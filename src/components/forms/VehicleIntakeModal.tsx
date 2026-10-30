"use client"

import { useEffect, useRef, useState } from 'react'
import { useJPJPlate } from '@/hooks/useJPJPlate'
import { getVehicleMakes, getModelsForMake, getYearsForVehicle, getVariantsForModel } from '@/services/vehicleDatabaseService'
import {
    buildGrantInspect,
    classifyGrantLines,
    extractBandFields,
    FIELD_LABELS,
    normalizeKey,
    planRegionBands,
    scoreGrant,
} from '@/lib/grantParser'
import type { BBox, GrantClassification, GrantInspect, ParsedGrant } from '@/lib/grantParser'

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

// Minimal structural type for the tesseract.js worker — only what the region
// re-scan pass needs (recognize + terminate), so no full type import required.
type OcrWorker = {
    recognize(blob: Blob): Promise<{ data: { text: string } }>
    terminate(): Promise<unknown>
}

// Crops a horizontal band out of the (already rotated, 2x) variant image and
// upscales it 2x more (4x effective) on a white background so the re-scan reads
// only that row's text at higher zoom.
async function cropBand(blob: Blob | File, bbox: BBox): Promise<Blob | null> {
    try {
        const bitmap = await createImageBitmap(blob)
        const bw = bitmap.width
        const bh = bitmap.height
        const bandH = Math.max(6, bbox.y1 - bbox.y0)
        const top = Math.max(0, Math.round(bbox.y0 - bandH * 0.5))
        const bottom = Math.min(bh, Math.round(bbox.y1 + bandH * 0.5))
        const scale = 2
        const cw = Math.max(1, Math.round(bw * scale))
        const ch = Math.max(1, Math.round((bottom - top) * scale))
        const canvas = document.createElement('canvas')
        canvas.width = cw
        canvas.height = ch
        const ctx = canvas.getContext('2d')
        if (!ctx) {
            bitmap.close()
            return null
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, cw, ch)
        ctx.drawImage(bitmap, 0, top, bw, bottom - top, 0, 0, cw, ch)
        bitmap.close()
        const imageData = ctx.getImageData(0, 0, cw, ch)
        const d = imageData.data
        for (let i = 0; i < d.length; i += 4) {
            const gray = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
            d[i] = gray
            d[i + 1] = gray
            d[i + 2] = gray
        }
        ctx.putImageData(imageData, 0, 0)
        return await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
    } catch {
        return null
    }
}

// Region re-scan pass: for every field whose row was located on the winning
// orientation, crop that row, re-OCR it at higher zoom, and keep the focused
// read when it yields a shape-valid value. Fields the crop could not read keep
// the whole-page value — a misaligned crop can never corrupt a field.
async function refineByRegions(
    worker: OcrWorker,
    variantBlob: Blob | File,
    classification: GrantClassification,
    onStatus: (s: string) => void
): Promise<{ parsed: ParsedGrant; refined: string[] }> {
    const merged = { ...classification.parsed }
    const refined: string[] = []
    for (const band of planRegionBands(classification)) {
        if (!band.bbox) continue
        onStatus(`Refining ${FIELD_LABELS[band.field]} row…`)
        const crop = await cropBand(variantBlob, band.bbox)
        if (!crop) continue
        let bandText = ''
        try {
            const { data } = await worker.recognize(crop)
            bandText = data.text
        } catch {
            continue
        }
        if (!bandText.trim()) continue
        const picked = extractBandFields(band.field, bandText)
        for (const key of Object.keys(picked) as Array<keyof ParsedGrant>) {
            if (picked[key]) {
                merged[key] = picked[key] as string
                refined.push(key)
            }
        }
    }
    return { parsed: merged, refined }
}

// Downsizes the photo to a compact JPEG for the cloud (Gemini) path. Gemini
// reads the document in any orientation itself, so no 4-orientation variants
// are needed here. Quality stays high (0.95) — aggressive JPEG compression
// previously made OCR engines misread "I-VTEC" as "1-VTEC".
async function compressForUpload(file: File): Promise<string> {
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

type GeminiResult = {
    fields: ParsedGrant
    confidence: Record<string, number>
    text: string
    model: string
}

// Calls the server route that proxies to Gemini (gemini-3.8-flash, thinking
// low). Returns { fields, confidence, text, model } on a successful scan,
// { unavailable: true } when the route reports no key / the API is disabled
// (so the UI can hint at setup), or null when the scan itself failed (no
// result / timeout) and the offline fallback should run. A 25s timeout
// guarantees the scanner can never spin forever.
async function tryGeminiOcr(file: File): Promise<GeminiResult | { unavailable: true } | null> {
    try {
        const imageBase64 = await compressForUpload(file)
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 25000)
        try {
            const res = await fetch('/api/ocr/grant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64, mimeType: 'image/jpeg' }),
                signal: controller.signal,
            })
            if (res.status === 503) return { unavailable: true }
            if (!res.ok) return null
            const data = await res.json()
            if (!data?.fields) return null
            return {
                fields: data.fields as ParsedGrant,
                confidence: (data.confidence && typeof data.confidence === 'object' ? data.confidence : {}) as Record<string, number>,
                text: typeof data.text === 'string' ? data.text : '',
                model: typeof data.model === 'string' ? data.model : 'gemini-3.8-flash',
            }
        } finally {
            clearTimeout(timer)
        }
    } catch {
        return null
    }
}

// --- score rating: lets you monitor whether the cloud model is sufficient ---
const SCORE_HISTORY_KEY = 'vehicleOcrScoreHistory'
type OcrScoreEntry = { ts: number; model: string; score: number; filled: number; total: number; plate: string }

function computeOcrScore(fields: ParsedGrant, confidence: Record<string, number>): { overall: number; filled: number } {
    const keys = Object.keys(FIELD_LABELS)
    let sum = 0
    let filled = 0
    for (const k of keys) {
        if (fields[k as keyof ParsedGrant]) filled++
        sum += confidence[k] || 0
    }
    return { overall: Math.round(sum / Math.max(1, keys.length)), filled }
}

function recordOcrScore(entry: OcrScoreEntry) {
    console.log('[OCR] scan record', entry)
    try {
        const list: OcrScoreEntry[] = JSON.parse(localStorage.getItem(SCORE_HISTORY_KEY) || '[]')
        list.push(entry)
        localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(list.slice(-50)))
    } catch {
        /* storage unavailable — console log only */
    }
}

function readOcrHistory(): OcrScoreEntry[] {
    try {
        return JSON.parse(localStorage.getItem(SCORE_HISTORY_KEY) || '[]')
    } catch {
        return []
    }
}

// Builds a classification for the inspect panel from Gemini's structured
// output: the parsed fields come straight from the model, while the line tags
// come from its plain transcription of the certificate.
function geminiToClassification(fields: ParsedGrant, text: string): GrantClassification {
    const base = classifyGrantLines(
        text.replace(/\r/g, '').split('\n').map((l: string) => ({ text: l }))
    )
    const sources: Record<string, string> = { plate: '', chassis: '', make: '', model: '', variant: '', spec: '', year: '' }
    for (const entry of Object.entries(fields) as Array<[keyof ParsedGrant, string]>) {
        const [key, value] = entry
        if (!value) continue
        const rec = base.lineRecords.find(r => r.valueText === value)
        if (rec) {
            if (!rec.field) rec.field = key
            sources[key] = rec.text
        }
    }
    return { parsed: fields, lineRecords: base.lineRecords, sources }
}

export type OcrScanPayload = { model: string; score: number; filled: number; total: number; ts: number }

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
        grantFile?: File | null
        ocrScan?: OcrScanPayload | null
        companyId?: string | null
    }) => void
    isDark: boolean
    showToast: (msg: string, type: 'success' | 'error') => void
    userRole?: string
    companies?: { id: string; name: string }[]
    fixedCompanyId?: string | null
}

export default function VehicleIntakeModal({ isOpen, onClose, onSubmit, isDark, showToast, userRole, companies = [], fixedCompanyId }: Props) {
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
    const [ocrInspect, setOcrInspect] = useState<GrantInspect | null>(null)
    const [showInspect, setShowInspect] = useState(false)
    const [grantFile, setGrantFile] = useState<File | null>(null)
    const [ocrScan, setOcrScan] = useState<OcrScanPayload | null>(null)
    const [companyId, setCompanyId] = useState<string>(fixedCompanyId || (companies[0]?.id ?? ''))
    const fileInputRef = useRef<HTMLInputElement>(null)
    const cameraInputRef = useRef<HTMLInputElement>(null)
    const isOpenRef = useRef(isOpen)
    useEffect(() => {
        isOpenRef.current = isOpen
    }, [isOpen])

    if (!isOpen) return null
    // Read the persisted scan-score history at render time (SSR-safe: the
    // reader returns [] when localStorage is unavailable).
    const scanHistory = showInspect ? readOcrHistory() : []

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
        setOcrInspect(null)
        setShowInspect(false)
        setOcrBusy(false)
        setOcrStatus('')
        setOcrPass(0)
        setGrantFile(null)
        setOcrScan(null)
        setCompanyId(fixedCompanyId || (companies[0]?.id ?? ''))
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
        let geminiUnavailable = false
        try {
            // 1) Gemini (gemini-3.8-flash, thinking low) — reads the certificate
            // in any orientation and returns structured fields + a score.
            setOcrStatus('reading')
            const gemini = await tryGeminiOcr(file)
            if (gemini && 'fields' in gemini) {
                if (!isOpenRef.current) return
                setOcrStatus('parsing')
                const { overall, filled } = computeOcrScore(gemini.fields, gemini.confidence)
                recordOcrScore({ ts: Date.now(), model: gemini.model, score: overall, filled, total: 7, plate: gemini.fields.plate || '' })
                const classification = geminiToClassification(gemini.fields, gemini.text)
                setOcrInspect(buildGrantInspect(classification, 'cloud', 0, [], { model: gemini.model, score: overall, confidence: gemini.confidence }))
                applyParsed(gemini.fields, 0)
                // Keep the scanned photo + scan record so saving can auto-store the
                // grant document and persist the score for admin monitoring.
                setGrantFile(file)
                setOcrScan({ model: gemini.model, score: overall, filled, total: 7, ts: Date.now() })
                return
            }
            geminiUnavailable = gemini !== null && 'unavailable' in gemini

            // 2) Offline Tesseract fallback (tries 0°/90°/180°/270°; keeps the best).
            setOcrStatus('loading')
            const { createWorker } = await import('tesseract.js')
            if (!isOpenRef.current) return
            const worker = await createWorker('eng')
            const variants = await makeGrantVariants(file)
            let best: { parsed: ParsedGrant; rotation: number; variantBlob: Blob | File; classification: GrantClassification } | null = null
            for (let i = 0; i < variants.length; i++) {
                setOcrStatus('reading')
                setOcrPass(i + 1)
                const { data } = await worker.recognize(variants[i].blob)
                if (!isOpenRef.current) {
                    await worker.terminate()
                    return
                }
                // tesseract.js runtime returns line geometry under `lines`,
                // but its shipped typings omit it — read it via a narrow cast.
                const ocrLines = (data as { lines?: Array<{ text: string; bbox?: BBox }> }).lines || []
                const classification = classifyGrantLines(
                    ocrLines.map(l => ({ text: l.text, bbox: l.bbox }))
                )
                const score = scoreGrant(classification.parsed)
                if (!best || score > scoreGrant(best.parsed)) {
                    best = { parsed: classification.parsed, rotation: variants[i].rotation, variantBlob: variants[i].blob, classification }
                }
                if (score >= 5) break // this orientation parsed well — no need to try the rest
            }
            if (!isOpenRef.current) {
                await worker.terminate()
                return
            }
            setOcrStatus('parsing')
            if (!best || scoreGrant(best.parsed) === 0) {
                if (best) setOcrInspect(buildGrantInspect(best.classification, 'offline', best.rotation))
                await worker.terminate()
                if (geminiUnavailable) {
                    showToast('Gemini is unavailable (check GEMINI_API_KEY in .env.local — the Generative Language API must be enabled for your Google Cloud project) and the offline scan could not read this photo either. Please fill in the details manually.', 'error')
                } else {
                    showToast('Could not read vehicle details from this photo. Make sure the certificate is in focus and well lit.', 'error')
                }
                return
            }

            // 3) Region re-scan: crop each located field row and re-OCR it at a
            // higher zoom. Fields the crop cannot read keep the whole-page value.
            const refined = await refineByRegions(worker, best.variantBlob, best.classification, s => setOcrStatus(s))
            await worker.terminate()
            if (!isOpenRef.current) return
            setOcrInspect(buildGrantInspect(best.classification, 'offline', best.rotation, refined.refined))
            applyParsed(refined.parsed, best.rotation)
            setGrantFile(file)
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
            grantFile,
            ocrScan,
            companyId: fixedCompanyId || companyId || null,
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
                        <input
                            ref={cameraInputRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handleGrantFile}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => cameraInputRef.current?.click()}
                                disabled={ocrBusy}
                                className="py-3 rounded-xl text-xs font-extrabold transition-all shadow-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
                            >
                                📷 Take Photo
                            </button>
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={ocrBusy}
                                className={`py-3 rounded-xl text-xs font-extrabold transition-all shadow-md cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                            >
                                📁 Upload Photo
                            </button>
                        </div>
                        {ocrBusy && (
                            <p className={`text-[10px] font-bold mt-2 ${isDark ? 'text-blue-300' : 'text-blue-600'}`}>
                                {ocrStatus === 'loading' ? '⏳ Preparing OCR engine (first scan downloads ~15 MB, please wait)…' : ocrStatus === 'reading' ? (ocrPass > 1 ? `📖 Reading text from photo (pass ${ocrPass}/4 — trying orientations)…` : '📖 Reading text from photo…') : '✨ Filling in fields…'}
                            </p>
                        )}
                        <p className={`text-[10px] font-medium mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Upload a photo of the vehicle grant (SIJIL PEMILIKAN KENDERAAN) to auto-fill plate, chassis, make, model, spec &amp; year — any orientation works. Review the fields before saving.
                        </p>
                    </div>

                    {ocrInspect && userRole === 'admin' && (
                        <div className={`mb-1 rounded-2xl border p-3 ${isDark ? 'border-slate-700 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                            <button
                                type="button"
                                onClick={() => setShowInspect(v => !v)}
                                className={`w-full flex items-center justify-between text-[11px] font-extrabold cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                            >
                                <span>
                                    🔍 OCR details — {ocrInspect.engine === 'cloud' ? (ocrInspect.model || 'Gemini') : 'offline engine'}
                                    {typeof ocrInspect.score === 'number' && (
                                        <span className={ocrInspect.score >= 80 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : ocrInspect.score >= 50 ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-rose-400' : 'text-rose-600')}>
                                            {' '}· score {ocrInspect.score}/100
                                        </span>
                                    )}
                                    {ocrInspect.rotation ? ` · rotated ${ocrInspect.rotation}°` : ''}
                                    {ocrInspect.refined.length > 0 ? ` · ${ocrInspect.refined.length} field${ocrInspect.refined.length > 1 ? 's' : ''} refined by region re-scan` : ''}
                                </span>
                                <span>{showInspect ? '▾' : '▸'}</span>
                            </button>
                            {showInspect && (
                                <div className="mt-2 space-y-2">
                                    <div className="grid grid-cols-1 gap-1">
                                        {ocrInspect.fields.map(f => (
                                            <div key={f.key} className={`flex items-center gap-2 text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                                <span className={`w-2 h-2 rounded-full shrink-0 ${f.value ? 'bg-emerald-500' : 'bg-rose-400'}`} />
                                                <span className="w-24 shrink-0 font-bold">{f.label}</span>
                                                {typeof f.confidence === 'number' && (
                                                    <span className="w-12 h-1.5 rounded-full bg-slate-700/50 shrink-0 overflow-hidden">
                                                        <span
                                                            className={`block h-full rounded-full ${f.confidence >= 80 ? 'bg-emerald-500' : f.confidence >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                            style={{ width: `${f.confidence}%` }}
                                                        />
                                                    </span>
                                                )}
                                                <span className={`font-mono font-bold ${f.value ? (isDark ? 'text-slate-100' : 'text-slate-900') : (isDark ? 'text-slate-600' : 'text-slate-400')}`}>{f.value || '—'}</span>
                                                {f.refined && <span className="shrink-0 px-1 rounded bg-blue-500/20 text-blue-400 text-[9px] font-extrabold">region</span>}
                                                {f.source && <span className="truncate opacity-60">· {f.source}</span>}
                                            </div>
                                        ))}
                                    </div>
                                    {typeof ocrInspect.score === 'number' && (
                                        <div className={`flex items-center gap-2 text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                                            <span className="font-extrabold">Model score</span>
                                            <span className={`font-extrabold ${ocrInspect.score >= 80 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : ocrInspect.score >= 50 ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-rose-400' : 'text-rose-600')}`}>
                                                {ocrInspect.score}/100
                                            </span>
                                            <span className="opacity-70">· {ocrInspect.fields.filter(f => f.value).length}/7 fields filled</span>
                                            <span className="opacity-50">(0 = unreadable, 100 = fully clear — watch this to judge if the model is good enough)</span>
                                        </div>
                                    )}
                                    {scanHistory.length > 0 && (
                                        <div className={`rounded-lg border p-2 text-[9px] ${isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                                            <div className="font-extrabold mb-1 opacity-70">Recent scan scores (kept in this browser — last {Math.min(scanHistory.length, 10)} of {scanHistory.length})</div>
                                            {[...scanHistory].reverse().slice(0, 10).map((h, i) => (
                                                <div key={h.ts + '-' + i} className="flex gap-2 opacity-80">
                                                    <span className="font-mono">{new Date(h.ts).toLocaleTimeString()}</span>
                                                    <span>{h.model}</span>
                                                    <span className={`font-extrabold ${h.score >= 80 ? 'text-emerald-500' : h.score >= 50 ? 'text-amber-500' : 'text-rose-500'}`}>{h.score}/100</span>
                                                    <span>{h.filled}/{h.total} fields</span>
                                                    {h.plate && <span className="font-mono">{h.plate}</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className={`max-h-36 overflow-y-auto rounded-lg border p-2 font-mono text-[9px] leading-relaxed ${isDark ? 'border-slate-800 bg-slate-900 text-slate-300' : 'border-slate-200 bg-white text-slate-600'}`}>
                                        {ocrInspect.lines.length === 0 && <div className="opacity-60">No lines read from this photo.</div>}
                                        {ocrInspect.lines.map((l, i) => (
                                            <div key={i} className={l.field ? (isDark ? 'bg-blue-500/10 text-blue-200' : 'bg-blue-50 text-blue-700') : undefined}>
                                                <span className={l.kind === 'label' ? (isDark ? 'text-amber-400' : 'text-amber-600') : 'opacity-70'}>
                                                    [{l.kind === 'label' ? `label ${l.labelType || ''}` : 'value'}{l.field ? ` → ${l.field}` : ''}]
                                                </span>{' '}
                                                {l.text}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

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

                    {companies.length > 0 && (
                        <div>
                            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Company *</label>
                            {fixedCompanyId ? (
                                <input
                                    type="text"
                                    value={companies.find(c => c.id === fixedCompanyId)?.name || 'My Company'}
                                    disabled
                                    className={`w-full border rounded-xl p-3 text-xs font-bold opacity-70 ${inputBgClass}`}
                                />
                            ) : (
                                <select
                                    value={companyId}
                                    onChange={(e) => setCompanyId(e.target.value)}
                                    className={`w-full border rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer ${inputBgClass}`}
                                >
                                    {companies.map((c) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}

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