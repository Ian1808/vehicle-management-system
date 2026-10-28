"use client"

import { useRef, useState } from 'react'
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
// Works line-by-line with fuzzy label matching because Tesseract often
// mangles the Malay field names — a value may also sit on the next line.
function parseGrantText(raw: string): ParsedGrant {
    const lines = raw
        .toUpperCase()
        .replace(/\r/g, '')
        .split('\n')
        .map(l => l.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    const result: ParsedGrant = { plate: '', chassis: '', make: '', model: '', variant: '', spec: '', year: '' }

    const findValue = (linePredicate: (l: string) => boolean, valuePattern: RegExp): string => {
        for (let i = 0; i < lines.length; i++) {
            if (!linePredicate(lines[i])) continue
            for (let j = 0; j <= 2; j++) {
                const m = (lines[i + j] || '').match(valuePattern)
                if (m) return m[1]
            }
            return ''
        }
        return ''
    }

    result.plate = findValue(
        l => l.includes('PENDAFTARAN') && !l.includes('TARIKH'),
        /([A-Z]{1,3}\s?\d{1,4}[A-Z]?)/
    )
    // Chassis/VIN: the value sits after "ENJIN" (when the chassis and engine
    // numbers share one line) or after the CHASIS label, before the "/" that
    // separates chassis from engine number. Handles OCR mangling the label
    // ("CHASTS"), inserting spaces in the VIN, or dropping the "/" separator.
    const chassisIdx = lines.findIndex(l => l.includes('CHAS'))
    if (chassisIdx !== -1) {
        const chassisLine = lines[chassisIdx]
        let val = ''
        if (chassisLine.includes('ENJIN')) {
            val = chassisLine.slice(chassisLine.indexOf('ENJIN') + 5)
        } else {
            const ci = Math.max(chassisLine.lastIndexOf('CHASSIS'), chassisLine.lastIndexOf('CHASIS'))
            if (ci !== -1) {
                val = chassisLine.slice(ci + 7)
                if (!/[A-Z0-9]{8,}/.test(val) && lines[chassisIdx + 1]) {
                    val = (val + ' ' + lines[chassisIdx + 1]).trim()
                }
            }
        }
        const firstPart = val.split('/')[0].replace(/[^A-Z0-9]/g, '')
        const chassisMatch = firstPart.match(/[A-Z]{2,5}\d{4,}[A-Z]{1,4}\d{3,6}/) || firstPart.match(/[A-Z0-9]{12,18}/)
        if (chassisMatch) result.chassis = chassisMatch[0]
    }
    result.year = findValue(
        l => l.includes('TAHUN') || l.includes('DIBUAT'),
        /((?:19|20)\d{2})/
    )
    result.spec = findValue(
        l => (l.includes('KUUP') || l.includes('KUASA')) && l.includes('ENJIN'),
        /(\d{3,4})/
    )

    const mmLineIdx = lines.findIndex(l => l.includes('BUATAN') || l.includes('NAMA MODEL') || l.includes('MODEL'))
    if (mmLineIdx !== -1) {
        let mmText = ''
        for (let j = 0; j <= 2; j++) mmText += ' ' + (lines[mmLineIdx + j] || '')
        mmText = mmText
            .replace(/BUATAN/g, ' ')
            .replace(/NAMA MODEL/g, ' ')
            .replace(/MODEL/g, ' ')
            .trim()
        mmText = mmText.split(/\s+(?:KUUP|KUASA|BAHAN|PEMASANGAN|KELAS|JENIS|TARIKH|SYARAT|STATUS|B\.?D\.?)/)[0].trim()
        const mmParts = mmText.split('/').map(s => s.trim()).filter(Boolean)
        if (mmParts.length >= 2) {
            result.make = mmParts[0]
            result.model = mmParts.slice(1).join(' / ')
        } else {
            const tokens = mmText.split(/\s+/).filter(Boolean)
            if (tokens.length >= 2) {
                result.make = tokens[0]
                result.model = tokens.slice(1).join(' ')
            } else {
                result.model = tokens[0] || ''
            }
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
    const fileInputRef = useRef<HTMLInputElement>(null)

    if (!isOpen) return null

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

        showToast(`Grant scanned ✓ ${notes.join(' · ')}. Review before saving.`, 'success')
    }

    async function handleGrantFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        setOcrBusy(true)
        setOcrStatus('loading')
        try {
            const { createWorker } = await import('tesseract.js')
            const worker = await createWorker('eng')
            const variants = await makeGrantVariants(file)
            let best: { parsed: ParsedGrant; rotation: number } | null = null
            for (let i = 0; i < variants.length; i++) {
                setOcrStatus('reading')
                setOcrPass(i + 1)
                const { data } = await worker.recognize(variants[i].blob)
                const parsed = parseGrantText(data.text)
                const score = scoreGrant(parsed)
                if (!best || score > scoreGrant(best.parsed)) {
                    best = { parsed, rotation: variants[i].rotation }
                }
                if (score >= 5) break // this orientation parsed well — no need to try the rest
            }
            await worker.terminate()
            setOcrStatus('parsing')
            if (!best || scoreGrant(best.parsed) === 0) {
                showToast('Could not read vehicle details from this photo. Make sure the certificate is in focus and well lit.', 'error')
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

        if (!selectedMake || !selectedModel || !selectedYear) {
            showToast('Please select Make, Model, and Mfg. Year.', 'error')
            return
        }

        const makeModelYearStr = `${selectedMake} ${selectedModel} ${selectedVariant ? `(${selectedVariant})` : ''} - ${selectedYear}`.trim()
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
                    <button onClick={onClose} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg cursor-pointer ${closeBtnClass}`}>&times;</button>
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
                        <button type="button" onClick={onClose} className={`px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${cancelBtnClass}`}>Cancel</button>
                        <button type="submit" className="px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-lg shadow-blue-500/20">Save & Intake</button>
                    </div>
                </form>
            </div>
        </div>
    )
}