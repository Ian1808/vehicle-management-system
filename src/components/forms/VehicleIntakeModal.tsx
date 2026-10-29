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
// { parsed, classification } on a successful scan, { unavailable: true } when
// the route reports no key / an API error (so the UI can hint at setup), or
// null when the scan itself failed (no text / timeout) and the offline
// fallback should run. A 25s timeout guarantees the scanner can never spin
// forever.
async function tryCloudOcr(file: File): Promise<{ parsed: ParsedGrant; classification: GrantClassification } | { unavailable: true } | null> {
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
            const classification = classifyGrantLines(
                data.text.replace(/\r/g, '').split('\n').map((l: string) => ({ text: l }))
            )
            if (scoreGrant(classification.parsed) === 0) return null
            return { parsed: classification.parsed, classification }
        } finally {
            clearTimeout(timer)
        }
    } catch {
        return null
    }
}

// Cloud OCR (Google Vision) is opt-in. Off by default so scan results come
// purely from the offline Tesseract engine; set NEXT_PUBLIC_ENABLE_CLOUD_OCR
// to "true" in .env.local (and restart the dev server) to turn it back on.
const CLOUD_OCR_ENABLED = process.env.NEXT_PUBLIC_ENABLE_CLOUD_OCR === 'true'

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
    const [ocrInspect, setOcrInspect] = useState<GrantInspect | null>(null)
    const [showInspect, setShowInspect] = useState(false)
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
        setOcrInspect(null)
        setShowInspect(false)
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
            // 1) Cloud OCR first (Google Vision) — only when explicitly enabled.
            if (CLOUD_OCR_ENABLED) {
                setOcrStatus('reading')
                const cloudResult = await tryCloudOcr(file)
                if (cloudResult && 'parsed' in cloudResult) {
                    if (!isOpenRef.current) return
                    setOcrStatus('parsing')
                    setOcrInspect(buildGrantInspect(cloudResult.classification, 'cloud', 0))
                    applyParsed(cloudResult.parsed, 0)
                    return
                }
                cloudUnavailable = cloudResult !== null && 'unavailable' in cloudResult
            }

            // 2) Offline Tesseract (tries 0°/90°/180°/270°; keeps the best).
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
                if (cloudUnavailable) {
                    showToast('Google Vision is unavailable (check the API key in .env.local) and the offline scan could not read this photo either. Please fill in the details manually.', 'error')
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

                    {ocrInspect && (
                        <div className={`mb-1 rounded-2xl border p-3 ${isDark ? 'border-slate-700 bg-slate-950/60' : 'border-slate-200 bg-slate-50'}`}>
                            <button
                                type="button"
                                onClick={() => setShowInspect(v => !v)}
                                className={`w-full flex items-center justify-between text-[11px] font-extrabold cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-700'}`}
                            >
                                <span>
                                    🔍 OCR details — {ocrInspect.engine === 'cloud' ? 'Google Vision' : 'offline engine'}
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
                                                <span className={`font-mono font-bold ${f.value ? (isDark ? 'text-slate-100' : 'text-slate-900') : (isDark ? 'text-slate-600' : 'text-slate-400')}`}>{f.value || '—'}</span>
                                                {f.refined && <span className="shrink-0 px-1 rounded bg-blue-500/20 text-blue-400 text-[9px] font-extrabold">region</span>}
                                                {f.source && <span className="truncate opacity-60">· {f.source}</span>}
                                            </div>
                                        ))}
                                    </div>
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