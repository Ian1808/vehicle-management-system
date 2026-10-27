"use client"

import { useRef, useState } from 'react'
import { useJPJPlate } from '@/hooks/useJPJPlate'
import { getVehicleMakes, getModelsForMake, getYearsForVehicle, getVariantsForModel } from '@/services/vehicleDatabaseService'

type ParsedGrant = {
    plate: string
    chassis: string
    make: string
    model: string
    spec: string
    year: string
}

function normalizeKey(s: string) {
    return s.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function windowAfter(text: string, label: RegExp, maxLen: number): string {
    const idx = text.search(label)
    if (idx === -1) return ''
    return text.slice(idx, idx + maxLen)
}

// Parses OCR text from a Malaysian vehicle grant (SIJIL PEMILIKAN KENDERAAN)
// by anchoring on the known Malay field labels.
function parseGrantText(raw: string): ParsedGrant {
    const text = raw.toUpperCase().replace(/\s+/g, ' ')
    const result: ParsedGrant = { plate: '', chassis: '', make: '', model: '', spec: '', year: '' }

    const plateMatch = text.match(/PENDAFTARAN[\s\S]{0,80}?([A-Z]{1,3}\s?\d{1,4}[A-Z]?)/)
    if (plateMatch) result.plate = plateMatch[1].replace(/\s/g, '')

    const chassisMatch = text.match(/(?:CHASIS|CHASSIS)[\s\S]{0,90}?([A-Z0-9]{12,20})/)
    if (chassisMatch) result.chassis = chassisMatch[1]

    let mmChunk = windowAfter(text, /(?:BUATAN|NAMA MODEL)/, 170)
    const mmLabelEnd = mmChunk.search(/NAMA MODEL/)
    if (mmLabelEnd !== -1) {
        mmChunk = mmChunk.slice(mmLabelEnd + 'NAMA MODEL'.length)
    } else {
        mmChunk = mmChunk.replace(/^BUATAN/, '')
    }
    mmChunk = mmChunk.split(/\s+(?:KUUP|KUASA|BAHAN|PEMASANGAN|KELAS|JENIS|TARIKH|SYARAT|STATUS|B\.?D\.?)/)[0].trim()
    const mmParts = mmChunk.split('/').map(s => s.trim()).filter(Boolean)
    if (mmParts.length >= 2) {
        result.make = mmParts[0]
        result.model = mmParts.slice(1).join(' / ')
    } else {
        const tokens = mmChunk.split(/\s+/).filter(Boolean)
        if (tokens.length >= 2) {
            result.make = tokens[0]
            result.model = tokens.slice(1).join(' ')
        } else {
            result.model = tokens[0] || ''
        }
    }

    const yearMatch = text.match(/TAHUN DIBUAT[\s\S]{0,80}?((?:19|20)\d{2})/)
    if (yearMatch) result.year = yearMatch[1]

    const engineMatch = text.match(/(?:KUUP|KUASA)[A-Z ]{0,20}?ENJIN[\s\S]{0,60}?(\d{3,4})/)
    if (engineMatch) result.spec = engineMatch[1]

    return result
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
    function applyParsed(parsed: ParsedGrant) {
        const notes: string[] = []

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
                        if (parsed.spec) {
                            const variantMatch = matchOption(getVariantsForModel(makeMatch, modelMatch), parsed.spec)
                            if (variantMatch) {
                                setSelectedVariant(variantMatch)
                                notes.push(`Spec ${variantMatch}`)
                            } else {
                                notes.push(`Spec “${parsed.spec}” not listed — select manually`)
                            }
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
        try {
            const { createWorker } = await import('tesseract.js')
            const worker = await createWorker('eng')
            const { data } = await worker.recognize(file)
            await worker.terminate()
            const parsed = parseGrantText(data.text)
            if (!parsed.plate && !parsed.chassis && !parsed.make && !parsed.year) {
                showToast('Could not read vehicle details from this photo. Please fill in manually.', 'error')
                return
            }
            applyParsed(parsed)
        } catch {
            showToast('Photo scan failed. Please fill in the details manually.', 'error')
        } finally {
            setOcrBusy(false)
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
                        <p className={`text-[10px] font-medium mt-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                            Upload a photo of the vehicle grant (SIJIL PEMILIKAN KENDERAAN) to auto-fill plate, chassis, make, model, spec &amp; year — review the fields before saving.
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