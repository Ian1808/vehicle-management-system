"use client"

import { useEffect, useRef, useState } from 'react'
import { useJPJPlate } from '@/hooks/useJPJPlate'
import { getVehicleMakes, getModelsForMake, getYearsForVehicle, getVariantsForModel } from '@/services/vehicleDatabaseService'

type ParsedGrant = {
    plate: string
    chassis: string
    make: string
    model: string
    variant: string
    spec: string
    year: string
}

function normalizeKey(s: string) {
    return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Parses OCR text from a Malaysian vehicle grant (SIJIL PEMILIKAN KENDERAAN).
// Both OCR engines (Google Vision, Tesseract) mangle the Malay labels and can
// return the label column and value column as separate blocks, as interleaved
// rows, or as mangled single lines. Strategy: classify every line as a known
// label or a value, then find each field's value NEAR its label's position,
// verifying it by the value's distinctive SHAPE (plate / VIN / digits / year).
function parseGrantText(raw: string): ParsedGrant {
    const lines = raw
        .toUpperCase()
        .replace(/\r/g, '')
        .split('\n')
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    const result: ParsedGrant = { plate: '', chassis: '', make: '', model: '', variant: '', spec: '', year: '' }

    // Known grant labels, in priority order (a line can match several — e.g.
    // "Tarikh Pendaftaran" is a date label, not the plate label). All regexes
    // MUST be global ("g") — the classification loop relies on exec() advancing
    // lastIndex; a non-global exec returns the same first match forever.
    const LABELS: Array<{ type: string; re: RegExp }> = [
        { type: 'TAHUN', re: /(?:TAHUN|DIBUAT)/g },
        { type: 'TARIKH', re: /TARIKH/g },
        { type: 'KEUPAYAAN', re: /(?:KUUP|KUASA|KEUPAY)\w*\s*(?:ENJIN)?/g },
        { type: 'CHASIS', re: /CHASS?IS|CHESIS|ENJIN/g },
        { type: 'SYARAT', re: /SYARAT/g },
        { type: 'PENDAFTARAN', re: /PENDAFTARAN/g },
        { type: 'MODEL', re: /(?:BUATAN|BUSTAN|NAMA|NEMA)\s*MODE[!LI1]*|BUATAN|BUSTAN|MODEL|MODE[!LI1]*/g },
        { type: 'BAHAN', re: /BAHAN/g },
        { type: 'STATUS', re: /STATUS/g },
        { type: 'KELAS', re: /KELAS/g },
        { type: 'BDM', re: /B\.?\s*D\.?\s*M/g },
        { type: 'PEMUNYA', re: /PEMUNYA|PENUNYA/g },
        { type: 'ALAMAT', re: /ALAMAT/g },
        { type: 'ID', re: /(?:^|[^A-Z0-9])ID(?:$|[^A-Z0-9])/g },
    ]

    // Split every line into a label (if it contains a known field name) or a
    // value. Vision's text order varies per photo — labels may come first as a
    // block with all values after (with watermark noise lines before them), or
    // label/value pairs may be interleaved. So each field is extracted by
    // searching VALUES ordered by proximity to its label, verifying the value
    // by its SHAPE (plate / VIN / digits / year) rather than by fixed position.
    const labels: string[] = []
    const values: string[] = []
    const cleanValue = (s: string) =>
        s.replace(/[^A-Z0-9 .()/-]/g, ' ').replace(/\s+/g, ' ').trim()
    for (const line of lines) {
        const entry = LABELS.find(l => {
            l.re.lastIndex = 0
            return l.re.test(line)
        })
        if (!entry) {
            values.push(cleanValue(line.replace(/^\s*:\s*/, '')))
            continue
        }
        // Inline value ("LABEL : VALUE" or "LABEL VALUE") = text after the
        // LAST label keyword occurrence on the line.
        let lastEnd = -1
        entry.re.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = entry.re.exec(line)) !== null) {
            lastEnd = m.index + m[0].length
            if (entry.re.lastIndex === m.index) entry.re.lastIndex++
        }
        labels.push(entry.type)
        const tail = cleanValue(line.slice(lastEnd).replace(/^\s*:\s*/, ''))
        // Only keep the tail as a value when it looks like one: it must not
        // itself contain another label word ("Syarat Pendaftaran 1" → tail
        // "Pendaftaran 1" is a label fragment, not a value), and it needs a
        // digit, a "/" separator, or 2+ words ("Berdaftar"/"Bakar"/"Asal" are
        // label fragments too).
        if (tail) {
            const containsLabel = LABELS.some(l => {
                l.re.lastIndex = 0
                return l.re.test(tail)
            })
            if (!containsLabel && (/\d/.test(tail) || tail.includes('/') || tail.split(/\s+/).filter(Boolean).length >= 2)) {
                values.push(tail)
            }
        }
    }

    const idxOf = (type: string) => labels.lastIndexOf(type)
    // Value indices ordered by distance from the label position (-1 = all).
    const near = (labelIdx: number): number[] => {
        const idx = Array.from({ length: values.length }, (_, i) => i)
        if (labelIdx === -1) return idx
        return idx.sort((a, b) => Math.abs(a - labelIdx) - Math.abs(b - labelIdx))
    }
    const isBodyTypeLine = (v: string) => v.includes('MOTOKAR') || v.includes('WINDOW')

    // --- plate: the first value containing a plate-shaped token
    let plateIdx = -1
    for (let i = 0; i < values.length && plateIdx === -1; i++) {
        for (const t of values[i].split(/[^A-Z0-9]+/).filter(Boolean)) {
            if (/^[A-Z]{1,3}\d{1,4}[A-Z]?$/.test(t)) {
                result.plate = t
                plateIdx = i
                break
            }
        }
    }

    // --- chassis: the VIN-shaped token nearest the chassis label (14+ alnum,
    // letters AND digits, found inside the line). Chassis+engine often merge
    // without a separator, so keep the first 17 chars (standard VIN length).
    const chassisLabelIdx = idxOf('CHASIS')
    let chassisIdx = -1
    for (const i of near(chassisLabelIdx)) {
        const v = values[i]
        // The part before a "/" separator is the chassis when engine number
        // shares the line; OCR junk may also prefix the VIN on the same line.
        const m = v.split('/')[0].match(/(?:^|[^A-Z0-9])([A-Z][A-Z0-9]{13,})(?:$|[^A-Z0-9])/)
        if (!m) continue
        const t = m[1]
        const c = t.length > 18 ? t.slice(0, 17) : t
        if (/[A-Z]/.test(c) && /\d/.test(c)) {
            result.chassis = c
            chassisIdx = i
            break
        }
    }

    // --- make/model: prefer the value nearest the MODEL label that starts
    // with a known make; only if none exists, fall back to a proximity score.
    const mmLabelIdx = idxOf('MODEL')
    let mmValIdx = -1
    const mmCandidates = near(mmLabelIdx)
        .map(i => ({ i, v: values[i] }))
        .filter(({ v }) => {
            const tokens = v.split(/\s+/).filter(Boolean)
            // 2+ words, and not an all-digits line (ID number / capacity).
            return tokens.length >= 2 && !/^[0-9\s]+$/.test(v)
        })
    const rankedMakes = [...getVehicleMakes()].sort((a, b) => normalizeKey(b).length - normalizeKey(a).length)
    let knownHit: { i: number; v: string } | null = null
    let knownDist = Infinity
    for (const c of mmCandidates) {
        const norm = normalizeKey(c.v)
        if (rankedMakes.some(mk => norm.startsWith(normalizeKey(mk)))) {
            const d = mmLabelIdx === -1 ? c.i : Math.abs(c.i - mmLabelIdx)
            if (d < knownDist) {
                knownDist = d
                knownHit = c
            }
        }
    }
    const mmHit = knownHit ?? mmCandidates.reduce<{ i: number; v: string; score: number } | null>(
        (best, c) => {
            const d = mmLabelIdx === -1 ? c.i : Math.abs(c.i - mmLabelIdx)
            let score = -d * 0.5
            if (c.v.includes('/')) score += 1.5
            if (c.v.split(/\s+/).length <= 5) score += 1
            return !best || score > best.score ? { ...c, score } : best
        },
        null
    )
    if (mmHit) {
        mmValIdx = mmHit.i
        const parts = mmHit.v.split('/').map(s => s.trim()).filter(Boolean)
        if (parts.length >= 2) {
            result.make = parts[0]
            result.model = parts.slice(1).join(' / ')
        } else {
            const tk = mmHit.v.split(/\s+/).filter(Boolean)
            result.make = tk[0]
            result.model = tk.slice(1).join(' ')
        }
    }

    // --- spec: engine capacity near the KEUPAYAAN label. Values already
    // claimed by plate/chassis/make-model and body-type lines are excluded.
    // Prefer a STANDALONE digit line ("3498") over digits embedded in an
    // address ("977 JALAN ... 6 ..."), and OCR sometimes prepends a junk
    // digit ("11799" for 1799) — then the last 4 digits of the label's own
    // line are used.
    const specLabelIdx = idxOf('KEUPAYAAN')
    const specSkip = (i: number) =>
        i === plateIdx || i === mmValIdx || i === chassisIdx || isBodyTypeLine(values[i])
    let specValIdx = -1
    const standaloneDigits = (v: string) => /^[0-9\s]+$/.test(v)
    for (const i of near(specLabelIdx)) {
        if (specSkip(i)) continue
        const v = values[i]
        const digits = v.replace(/[^0-9]/g, '')
        if ((digits.length === 3 || digits.length === 4) && standaloneDigits(v)) {
            result.spec = digits
            specValIdx = i
            break
        }
    }
    if (!result.spec) {
        for (const i of near(specLabelIdx)) {
            if (specSkip(i)) continue
            const digits = values[i].replace(/[^0-9]/g, '')
            if (digits.length === 3 || digits.length === 4) {
                result.spec = digits
                specValIdx = i
                break
            }
        }
    }
    if (!result.spec) {
        for (const i of near(specLabelIdx)) {
            if (specSkip(i)) continue
            const digits = values[i].replace(/[^0-9]/g, '')
            if (digits.length !== 5) continue
            const d = specLabelIdx === -1 ? i : Math.abs(i - specLabelIdx)
            if (d <= 1) {
                result.spec = digits.slice(-4)
                specValIdx = i
                break
            }
        }
    }

    // --- year: the standalone 19xx/20xx token nearest the TAHUN label (never
    // a date, never a value already claimed by another field).
    const yearLabelIdx = idxOf('TAHUN')
    for (const i of near(yearLabelIdx)) {
        if (i === plateIdx || i === mmValIdx || i === chassisIdx || i === specValIdx) continue
        const v = values[i] || ''
        if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v)) continue
        const m = v.match(/(?:^|[^0-9])((?:19|20)\d{2})(?:$|[^0-9])/)
        if (m) {
            result.year = m[1]
            break
        }
    }

    // Variant = everything after the base model name, e.g. "CIVIC 1.8L I-VTEC (A)" → "1.8L I-VTEC (A)".
    const modelTokens = result.model.split(/\s+/).filter(Boolean)
    if (modelTokens.length >= 2) {
        result.variant = modelTokens.slice(1).join(' ')
    }

    return result
}

// Decodes the photo once and returns four grayscale, upscaled variants
// (0°/90°/180°/270°) so OCR can be tried in every orientation.
type GrantVariant = { blob: Blob | File; rotation: 0 | 90 | 180 | 270 }

async function makeGrantVariants(file: File): Promise<GrantVariant[]> {
    try {
        const bitmap = await createImageBitmap(file)
        const scale = 2
        const baseW = bitmap.width
        const baseH = bitmap.height
        const rotations: Array<0 | 90 | 180 | 270> = [0, 90, 180, 270]
        const variants: GrantVariant[] = []
        for (const rotation of rotations) {
            const swapped = rotation === 90 || rotation === 270
            const w = Math.round((swapped ? baseH : baseW) * scale)
            const h = Math.round((swapped ? baseW : baseH) * scale)
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            const ctx = canvas.getContext('2d')
            if (!ctx) {
                variants.push({ blob: file, rotation })
                continue
            }
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, w, h)
            ctx.translate(w / 2, h / 2)
            ctx.rotate((rotation * Math.PI) / 180)
            ctx.drawImage(bitmap, (-baseW * scale) / 2, (-baseH * scale) / 2, baseW * scale, baseH * scale)
            const imageData = ctx.getImageData(0, 0, w, h)
            const d = imageData.data
            for (let i = 0; i < d.length; i += 4) {
                const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
                d[i] = gray
                d[i + 1] = gray
                d[i + 2] = gray
            }
            ctx.putImageData(imageData, 0, 0)
            const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
            variants.push({ blob: blob ?? file, rotation })
        }
        bitmap.close()
        return variants
    } catch {
        return [
            { blob: file, rotation: 0 },
            { blob: file, rotation: 90 },
            { blob: file, rotation: 180 },
            { blob: file, rotation: 270 },
        ]
    }
}

// Higher = the OCR result looks more like a readable grant. Used to pick the
// best rotation and to stop early when the upright pass already parsed well.
function scoreGrant(p: ParsedGrant): number {
    let s = 0
    if (p.plate) s += 2
    if (p.chassis) s += 2
    if (p.make) s += 1
    if (p.model) s += 1
    if (p.year) s += 1
    if (p.spec) s += 1
    return s
}

function matchOption(options: string[], target: string): string | null {
    const t = normalizeKey(target)
    if (!t) return null
    const exact = options.find(o => normalizeKey(o) === t)
    if (exact) return exact
    const contained = options
        .filter(o => t.includes(normalizeKey(o)))
        .sort((a, b) => normalizeKey(b).length - normalizeKey(a).length)
    if (contained.length) return contained[0]
    return options.find(o => normalizeKey(o).includes(t)) || null
}

// Downsizes the photo to a compact JPEG for the cloud path. Google Vision
// rotates the document itself, so no 4-orientation variants are needed here.
// Quality stays high (0.95) — aggressive JPEG compression made Vision misread
// "I-VTEC" as "1-VTEC" on the pink certificate background.
async function compressForCloud(file: File): Promise<string> {
    const bitmap = await createImageBitmap(file)
    const MAX = 2000
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close?.()
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
    return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

// Calls the server route that proxies to Google Cloud Vision. Returns
// { parsed } on a successful scan, { unavailable: true } when the route
// reports no key / an API error (so the UI can hint at setup), or null when
// the scan itself failed (no text / timeout) and the offline fallback should
// run. A 25s timeout guarantees the scanner can never spin forever.
async function tryCloudOcr(file: File): Promise<{ parsed: ParsedGrant } | { unavailable: true } | null> {
    try {
        const imageBase64 = await compressForCloud(file)
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 25000)
        try {
            const res = await fetch('/api/ocr/grant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64 }),
                signal: controller.signal,
            })
            if (res.status === 503 || res.status === 502) return { unavailable: true }
            if (!res.ok) return null
            const data = await res.json()
            if (!data?.text) return null
            const parsed = parseGrantText(data.text)
            if (scoreGrant(parsed) === 0) return null
            return { parsed }
        } finally {
            clearTimeout(timer)
        }
    } catch {
        return null
    }
}

type Props = {
    isOpen: boolean
    onClose: () => void
    onSubmit: (data: {
        plate_number: string
        chassis_number: string
        make_model_year: string
        insurance_panel: string
        intake_cost: number
        market_value: number
    }) => void
    isDark: boolean
    showToast: (msg: string, type: 'success' | 'error') => void
}

export default function VehicleIntakeModal({ isOpen, onClose, onSubmit, isDark, showToast }: Props) {
    const { plate, error: plateError, handlePlateChange, setPlate } = useJPJPlate()

    const makes = getVehicleMakes()
    const years = getYearsForVehicle()

    const [chassis, setChassis] = useState('')
    const [selectedMake, setSelectedMake] = useState('')
    const [selectedModel, setSelectedModel] = useState('')
    const [selectedVariant, setSelectedVariant] = useState('')
    const [selectedYear, setSelectedYear] = useState('')
    const [marketVal, setMarketVal] = useState('')
    const [insurancePanel, setInsurancePanel] = useState('')
    const [intakeCost, setIntakeCost] = useState('')
    const [ocrBusy, setOcrBusy] = useState(false)
    const [ocrStatus, setOcrStatus] = useState('')
    const [ocrPass, setOcrPass] = useState(0)
    const [manualOverride, setManualOverride] = useState(false)
    const [ocrFields, setOcrFields] = useState<ParsedGrant | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const isOpenRef = useRef(isOpen)
    useEffect(() => {
        isOpenRef.current = isOpen
    }, [isOpen])

    if (!isOpen) return null

    function resetForm() {
        setPlate('')
        setChassis('')
        setSelectedMake('')
        setSelectedModel('')
        setSelectedVariant('')
        setSelectedYear('')
        setMarketVal('')
        setInsurancePanel('')
        setIntakeCost('')
        setManualOverride(false)
        setOcrFields(null)
        setOcrBusy(false)
        setOcrStatus('')
        setOcrPass(0)
    }

    function handleClose() {
        resetForm()
        onClose()
    }

    const availableModels = selectedMake ? getModelsForMake(selectedMake) : []
    const availableVariants = selectedMake && selectedModel ? getVariantsForModel(selectedMake, selectedModel) : []

    function handleMakeChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const make = e.target.value
        setSelectedMake(make)
        setSelectedModel('')
        setSelectedVariant('')
    }

    // Auto-fill form fields from OCR-parsed grant details (best-effort; user reviews before saving).
    function applyParsed(parsed: ParsedGrant, rotation: number) {
        const notes: string[] = []
        if (rotation !== 0) notes.push(`Rotated ${rotation}°`)
        setOcrFields(parsed)
        if (!manualOverride) notes.push('Vehicle details from OCR — “Enter data manually” to change')

        if (parsed.plate) {
            setPlate(parsed.plate)
            notes.push(`Plate ${parsed.plate}`)
        }
        if (parsed.chassis) {
            setChassis(parsed.chassis)
            notes.push(`Chassis ${parsed.chassis}`)
        }
        if (parsed.year && years.includes(Number(parsed.year))) {
            setSelectedYear(parsed.year)
            notes.push(`Year ${parsed.year}`)
        }

        if (parsed.make) {
            const makeMatch = makes.find(m => normalizeKey(m) === normalizeKey(parsed.make))
            if (makeMatch) {
                handleMakeChange({ target: { value: makeMatch } } as React.ChangeEvent<HTMLSelectElement>)
                notes.push(`Make ${makeMatch}`)
                if (parsed.model) {
                    const modelMatch = matchOption(getModelsForMake(makeMatch), parsed.model)
                    if (modelMatch) {
                        setSelectedModel(modelMatch)
                        notes.push(`Model ${modelMatch}`)
                        const variantOptions = getVariantsForModel(makeMatch, modelMatch)
                        const variantCandidates = [parsed.variant, parsed.spec].filter(Boolean)
                        let variantMatch: string | null = null
                        for (const candidate of variantCandidates) {
                            variantMatch = matchOption(variantOptions, candidate)
                            if (variantMatch) break
                        }
                        if (variantMatch) {
                            setSelectedVariant(variantMatch)
                            notes.push(`Variant ${variantMatch}`)
                        } else if (variantCandidates.length > 0) {
                            notes.push(`Variant “${variantCandidates[0]}” not listed — select manually`)
                        }
                    } else {
                        notes.push(`Model “${parsed.model}” not in list — select manually`)
                    }
                }
            } else {
                notes.push(`Make “${parsed.make}” not in database — select manually`)
            }
        }

        const needsDigitCheck = Boolean(parsed.chassis || parsed.spec)
        showToast(`Grant scanned ✓ ${notes.join(' · ')}. ${needsDigitCheck ? 'Verify VIN & engine digits before saving.' : 'Review before saving.'}`, 'success')
    }

    async function handleGrantFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        setOcrBusy(true)
        let cloudUnavailable = false
        try {
            // 1) Cloud OCR first (Google Vision) — far more accurate on grants.
            setOcrStatus('reading')
            const cloudResult = await tryCloudOcr(file)
            if (cloudResult && 'parsed' in cloudResult) {
                if (!isOpenRef.current) return
                setOcrStatus('parsing')
                applyParsed(cloudResult.parsed, 0)
                return
            }
            cloudUnavailable = cloudResult !== null && 'unavailable' in cloudResult

            // 2) Offline Tesseract fallback (tries 0°/90°/180°/270°).
            setOcrStatus('loading')
            const { createWorker } = await import('tesseract.js')
            if (!isOpenRef.current) return
            const worker = await createWorker('eng')
            const variants = await makeGrantVariants(file)
            let best: { parsed: ParsedGrant; rotation: number } | null = null
            for (let i = 0; i < variants.length; i++) {
                setOcrStatus('reading')
                setOcrPass(i + 1)
                const { data } = await worker.recognize(variants[i].blob)
                if (!isOpenRef.current) {
                    await worker.terminate()
                    return
                }
                const parsed = parseGrantText(data.text)
                const score = scoreGrant(parsed)
                if (!best || score > scoreGrant(best.parsed)) {
                    best = { parsed, rotation: variants[i].rotation }
                }
                if (score >= 5) break // this orientation parsed well — no need to try the rest
            }
            await worker.terminate()
            if (!isOpenRef.current) return
            setOcrStatus('parsing')
            if (!best || scoreGrant(best.parsed) === 0) {
                if (cloudUnavailable) {
                    showToast('Google Vision is unavailable (check the API key in .env.local) and the offline scan could not read this photo either. Please fill in the details manually.', 'error')
                } else {
                    showToast('Could not read vehicle details from this photo. Make sure the certificate is in focus and well lit.', 'error')
                }
                return
            }
            applyParsed(best.parsed, best.rotation)
        } catch {
            showToast('Photo scan failed. Please fill in the details manually.', 'error')
        } finally {
            setOcrBusy(false)
            setOcrStatus('')
            setOcrPass(0)
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (plateError || !plate) return

        let makeModelYearStr: string
        if (manualOverride) {
            if (!selectedMake || !selectedModel || !selectedYear) {
                showToast('Please select Make, Model, and Mfg. Year.', 'error')
                return
            }
            makeModelYearStr = `${selectedMake} ${selectedModel} ${selectedVariant ? `(${selectedVariant})` : ''} - ${selectedYear}`.trim()
        } else {
            if (!ocrFields?.make || !ocrFields?.model || !ocrFields?.year) {
                showToast('Scan the grant photo to fill vehicle details, or click “Enter data manually”.', 'error')
                return
            }
            makeModelYearStr = `${ocrFields.make} ${ocrFields.model} - ${ocrFields.year}`.trim()
        }

        onSubmit({
            plate_number: plate,
            chassis_number: chassis.toUpperCase(),
            make_model_year: makeModelYearStr,
            insurance_panel: insurancePanel,
            intake_cost: intakeCost ? parseFloat(intakeCost) : 0,
            market_value: marketVal ? parseFloat(marketVal) : 0,
        })
    }

    // Dynamic theme styling helper classes
    const bgClass = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
    const inputBgClass = isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
    const labelClass = isDark ? 'text-slate-400' : 'text-slate-600'
    const subTextClass = isDark ? 'text-slate-400' : 'text-slate-500'
    const closeBtnClass = isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
    const cancelBtnClass = isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className={`border rounded-3xl shadow-2xl max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto ${bgClass}`}>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-extrabold">New Vehicle Intake</h3>
                    </div>
                    <button onClick={handleClose} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg cursor-pointer ${closeBtnClass}`}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className={`mb-1 border-2 border-dashed rounded-2xl p-4 text-center ${isDark ? 'border-slate-700 bg-slate-950/60' : 'border-slate-300 bg-slate-50'}`}>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleGrantFile}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={ocrBusy}
                            className="w-full py-3 rounded-xl text-xs font-extrabold transition-all shadow-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
                        >
                            {ocrBusy ? '⏳ Scanning grant photo…' : '📷 Scan Grant / VOC Photo'}
                        </button>
                        {ocrBusy && (
                            <p className={`text-[10px] font-bold mt-2 ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
                                {ocrStatus === 'loading' ? '⏳ Preparing OCR engine (first scan downloads ~15 MB, please wait)…' : ocrStatus === 'reading' ? (ocrPass > 1 ? `📖 Reading text from photo (pass ${ocrPass}/4 — trying orientations)…` : '📖 Reading text from photo…') : '✨ Filling in fields…'}
                            </p>
                        )}
                        <p className={`text-[10px] font-medium mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Upload a photo of the vehicle grant (SIJIL PEMILIKAN KENDERAAN) to auto-fill plate, chassis, make, model, spec &amp; year — any orientation works. Review the fields before saving.
                        </p>
                    </div>

                    <div>
                        <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Plate Number *</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. ABC1234"
                            value={plate}
                            onChange={(e) => handlePlateChange(e.target.value)}
                            className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${plateError ? 'border-rose-500 bg-rose-950/25 text-rose-300' : inputBgClass}`}
                        />
                        {plateError && <p className="text-[10px] font-bold text-rose-500 mt-1">⚠️ {plateError}</p>}
                    </div>

                    <div>
                        <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Chassis Number (VIN) *</label>
                        <input type="text" required placeholder="e.g. PMAL123456789" value={chassis} onChange={(e) => setChassis(e.target.value.toUpperCase())} className={`w-full border rounded-xl p-3 text-xs font-medium uppercase ${inputBgClass}`} />
                    </div>

                    <div className="flex justify-end mb-1">
                        <button
                            type="button"
                            onClick={() => setManualOverride(v => !v)}
                            className={`text-[10px] font-bold underline cursor-pointer ${isDark ? 'text-blue-300 hover:text-blue-200' : 'text-blue-600 hover:text-blue-500'}`}
                        >
                            {manualOverride ? '↩ Back to OCR data' : '✏️ Enter data manually'}
                        </button>
                    </div>

                    {manualOverride ? (
                        <>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Make *</label>
                                    <select required value={selectedMake} onChange={handleMakeChange} className={`w-full border rounded-xl p-3 text-xs font-bold cursor-pointer ${inputBgClass}`}>
                                        <option value="">-- Select Make --</option>
                                        {makes.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Model *</label>
                                    <select required disabled={!selectedMake} value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-bold cursor-pointer disabled:opacity-50 ${inputBgClass}`}>
                                        <option value="">-- Select Model --</option>
                                        {availableModels.map(md => <option key={md} value={md}>{md}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Variant / Spec</label>
                                    <select disabled={!selectedModel} value={selectedVariant} onChange={(e) => setSelectedVariant(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-bold cursor-pointer disabled:opacity-50 ${inputBgClass}`}>
                                        <option value="">-- Select Variant --</option>
                                        {availableVariants.map(v => <option key={v} value={v}>{v}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Mfg. Year *</label>
                                    <select required value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-bold cursor-pointer ${inputBgClass}`}>
                                        <option value="">-- Select Year --</option>
                                        {years.map(y => <option key={y} value={y}>{y}</option>)}
                                    </select>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Make *</label>
                                <input type="text" disabled placeholder="Scan to fill" value={ocrFields?.make || ''} className={`w-full border rounded-xl p-3 text-xs font-medium disabled:opacity-70 ${inputBgClass}`} />
                            </div>
                            <div>
                                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Model *</label>
                                <input type="text" disabled placeholder="Scan to fill" value={ocrFields?.model || ''} className={`w-full border rounded-xl p-3 text-xs font-medium disabled:opacity-70 ${inputBgClass}`} />
                            </div>
                            <div>
                                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Variant / Spec</label>
                                <input type="text" disabled placeholder="N/A" value={ocrFields?.variant || ''} className={`w-full border rounded-xl p-3 text-xs font-medium disabled:opacity-70 ${inputBgClass}`} />
                            </div>
                            <div>
                                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Mfg. Year *</label>
                                <input type="text" disabled placeholder="Scan to fill" value={ocrFields?.year || ''} className={`w-full border rounded-xl p-3 text-xs font-medium disabled:opacity-70 ${inputBgClass}`} />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Insurance Panel</label>
                        <input type="text" placeholder="e.g. Allianz General" value={insurancePanel} onChange={(e) => setInsurancePanel(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium ${inputBgClass}`} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Intake Cost (RM)</label>
                            <input type="number" step="0.01" placeholder="0.00" value={intakeCost} onChange={(e) => setIntakeCost(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium ${inputBgClass}`} />
                        </div>
                        <div>
                            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Market Value (RM)</label>
                            <input type="number" step="0.01" placeholder="0.00" value={marketVal} onChange={(e) => setMarketVal(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium ${inputBgClass}`} />
                        </div>
                    </div>

                    <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <button type="button" onClick={handleClose} className={`px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${cancelBtnClass}`}>Cancel</button>
                        <button type="submit" className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-lg shadow-blue-500/20">Save & Intake</button>
                    </div>
                </form>
            </div>
        </div>
    )
}