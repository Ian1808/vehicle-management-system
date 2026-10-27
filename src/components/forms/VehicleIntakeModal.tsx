"use client"

import { useState } from 'react'
import { useJPJPlate } from '@/hooks/useJPJPlate'
import { useVehicleCatalog } from '@/hooks/useVehicleCatalog'

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
}

export default function VehicleIntakeModal({ isOpen, onClose, onSubmit, isDark }: Props) {
    const { plate, error: plateError, handlePlateChange } = useJPJPlate()
    const { makes, models, loading: catalogLoading, getModelsForMake } = useVehicleCatalog()

    const [selectedMake, setSelectedMake] = useState('')
    const [selectedModel, setSelectedModel] = useState('')
    const [selectedYear, setSelectedYear] = useState('')
    const [chassis, setChassis] = useState('')
    const [insurancePanel, setInsurancePanel] = useState('')
    const [intakeCost, setIntakeCost] = useState('')
    const [marketValue, setMarketValue] = useState('')

    if (!isOpen) return null

    function handleMakeChange(e: React.ChangeEvent<HTMLSelectElement>) {
        const make = e.target.value
        setSelectedMake(make)
        getModelsForMake(make)
        setSelectedModel('')
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (plateError || !plate) return

        if (!selectedMake || !selectedModel || !selectedYear) {
            alert('Please select Make, Model, and Year.')
            return
        }

        const makeModelYearStr = `${selectedMake} ${selectedModel} (${selectedYear})`
        onSubmit({
            plate_number: plate,
            chassis_number: chassis.toUpperCase(),
            make_model_year: makeModelYearStr,
            insurance_panel: insurancePanel,
            intake_cost: intakeCost ? parseFloat(intakeCost) : 0,
            market_value: marketValue ? parseFloat(marketValue) : 0,
        })
    }

    const currentYear = new Date().getFullYear()
    const years = Array.from(new Array(40), (_, i) => currentYear - i)

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className={`border rounded-3xl shadow-2xl max-w-lg w-full p-8 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>New Vehicle Intake</h3>
                        <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Validated against JPJ Malaysia & Data.gov.my</p>
                    </div>
                    <button onClick={onClose} className="rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer">&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Plate Number *</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. WXY1234A or MADANI99"
                            value={plate}
                            onChange={(e) => handlePlateChange(e.target.value)}
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
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">
                                Make * {catalogLoading && <span className="text-[9px] text-blue-400 animate-pulse">(Syncing...)</span>}
                            </label>
                            <select required disabled={catalogLoading || makes.length === 0} value={selectedMake} onChange={handleMakeChange} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-bold bg-slate-950 text-white cursor-pointer disabled:opacity-50">
                                <option value="">-- Select Make --</option>
                                {makes.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Model *</label>
                            <select required disabled={!selectedMake || models.length === 0} value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-bold bg-slate-950 text-white cursor-pointer disabled:opacity-50">
                                <option value="">-- Select Model --</option>
                                {models.map(md => <option key={md} value={md}>{md}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Mfg. Year *</label>
                        <select required value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-bold bg-slate-950 text-white cursor-pointer">
                            <option value="">-- Select Year --</option>
                            {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
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
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Market Value (RM)</label>
                            <input type="number" step="0.01" placeholder="0.00" value={marketValue} onChange={(e) => setMarketValue(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-medium bg-slate-950 text-white" />
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