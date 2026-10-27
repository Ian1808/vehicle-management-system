"use client"

import { useState } from 'react'
import { useJPJPlate } from '@/hooks/useJPJPlate'
import { fetchPaqarValuationByPlate } from '@/services/paqarService'
import { getVehicleMakes, getModelsForMake, getYearsForVehicle, getVariantsForModel } from '@/services/vehicleDatabaseService'

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
    const { plate, error: plateError, handlePlateChange } = useJPJPlate()

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
    const [isQueryingPaqar, setIsQueryingPaqar] = useState(false)

    if (!isOpen) return null

    const availableModels = selectedMake ? getModelsForMake(selectedMake) : []
    const availableVariants = selectedMake && selectedModel ? getVariantsForModel(selectedMake, selectedModel) : []

    function handleMakeChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const make = e.target.value
        setSelectedMake(make)
        setSelectedModel('')
        setSelectedVariant('')
    }

    // Optional: Query Paqar for valuation when plate is entered
    async function handlePlateBlur() {
        if (!plate || plateError) return

        setIsQueryingPaqar(true)
        showToast('Checking Paqar.my for live market valuation...', 'success')

        try {
            const data = await fetchPaqarValuationByPlate(plate)
            if (data && !data.error && data.marketMedian) {
                setMarketVal(String(data.marketMedian))
                showToast(`Market valuation found: RM ${data.marketMedian.toLocaleString()}`, 'success')
            }
        } catch (err) {
            // Fail silently if plate is not in Paqar database, since local database handles make/model/year
        } finally {
            setIsQueryingPaqar(false)
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

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className={`border rounded-3xl shadow-2xl max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>New Vehicle Intake</h3>
                        <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Local Vehicle DB (MeterApp inspired) + Paqar Valuation</p>
                    </div>
                    <button onClick={onClose} className="rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer">&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400 flex items-center justify-between">
                            <span>Plate Number *</span>
                            {isQueryingPaqar && <span className="text-[10px] text-blue-400 animate-pulse">Checking Paqar...</span>}
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. WPH925 or VFE9578"
                            value={plate}
                            onChange={(e) => handlePlateChange(e.target.value)}
                            onBlur={handlePlateBlur}
                            className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${plateError ? 'border-rose-500 bg-rose-950/25 text-rose-300' : 'border-slate-800 bg-slate-950 text-white'}`}
                        />
                        {plateError && <p className="text-[10px] font-bold text-rose-500 mt-1">⚠️ {plateError}</p>}
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Chassis Number (VIN) *</label>
                        <input type="text" required placeholder="e.g. PMAL123456789" value={chassis} onChange={(e) => setChassis(e.target.value.toUpperCase())} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-medium bg-slate-950 text-white uppercase" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Make *</label>
                            <select required value={selectedMake} onChange={handleMakeChange} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-bold bg-slate-950 text-white cursor-pointer">
                                <option value="">-- Select Make --</option>
                                {makes.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Model *</label>
                            <select required disabled={!selectedMake} value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-bold bg-slate-950 text-white cursor-pointer disabled:opacity-50">
                                <option value="">-- Select Model --</option>
                                {availableModels.map(md => <option key={md} value={md}>{md}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Variant / Spec</label>
                            <select disabled={!selectedModel} value={selectedVariant} onChange={(e) => setSelectedVariant(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-bold bg-slate-950 text-white cursor-pointer disabled:opacity-50">
                                <option value="">-- Select Variant --</option>
                                {availableVariants.map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Mfg. Year *</label>
                            <select required value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-bold bg-slate-950 text-white cursor-pointer">
                                <option value="">-- Select Year --</option>
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Insurance Panel</label>
                        <input type="text" placeholder="e.g. Allianz General" value={insurancePanel} onChange={(e) => setInsurancePanel(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-medium bg-slate-950 text-white" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Intake Cost (RM)</label>
                            <input type="number" step="0.01" placeholder="0.00" value={intakeCost} onChange={(e) => setIntakeCost(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-medium bg-slate-950 text-white" />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Market Value (Paqar RM)</label>
                            <input type="number" step="0.01" placeholder="0.00" value={marketVal} onChange={(e) => setMarketVal(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-medium bg-slate-950 text-white" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                        <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer">Cancel</button>
                        <button type="submit" disabled={!!plateError} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">Save Intake</button>
                    </div>
                </form>
            </div>
        </div>
    )
}