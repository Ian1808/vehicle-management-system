"use client"

import { useState } from 'react'
import { useJPJPlate } from '@/hooks/useJPJPlate'
import { fetchPaqarVehicleByPlate } from '@/services/paqarService'

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

    const [chassis, setChassis] = useState('')
    const [make, setMake] = useState('')
    const [model, setModel] = useState('')
    const [year, setYear] = useState('')
    const [variant, setVariant] = useState('')
    const [marketVal, setMarketVal] = useState('')
    const [insurancePanel, setInsurancePanel] = useState('')
    const [intakeCost, setIntakeCost] = useState('')
    const [isQueryingPaqar, setIsQueryingPaqar] = useState(false)

    if (!isOpen) return null

    // Auto-fetch make, model, year, and market valuation from Paqar using the plate number
    async function handlePlateBlur() {
        if (!plate || plateError) return

        setIsQueryingPaqar(true)
        showToast('Querying Paqar.my for vehicle details...', 'success')

        try {
            const data = await fetchPaqarVehicleByPlate(plate)
            if (data) {
                if (data.make) setMake(data.make)
                if (data.model) setModel(data.model)
                if (data.year) setYear(String(data.year))
                if (data.variant) setVariant(data.variant)
                if (data.marketValue || data.valuation) {
                    setMarketVal(String(data.marketValue || data.valuation))
                }
                showToast('Vehicle details auto-filled from Paqar.my!', 'success')
            } else {
                showToast('No exact match found on Paqar.my. Please enter details manually.', 'error')
            }
        } catch (err) {
            showToast('Paqar lookup failed. Please enter details manually.', 'error')
        } finally {
            setIsQueryingPaqar(false)
        }
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (plateError || !plate) return

        if (!make || !model || !year) {
            showToast('Please ensure Make, Model, and Year are filled.', 'error')
            return
        }

        const makeModelYearStr = `${make} ${model} ${variant ? `(${variant})` : ''} - ${year}`.trim()
        onSubmit({
            plate_number: plate,
            chassis_number: chassis.toUpperCase(),
            make_model_year: makeModelYearStr,
            insurance_panel: insurancePanel,
            intake_cost: intakeCost ? parseFloat(intakeCost) : 0,
            market_value: marketVal ? parseFloat(marketVal) : 0,
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
                        <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Auto-fill make, model, year & valuation via Paqar.my</p>
                    </div>
                    <button onClick={onClose} className="rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer">&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400 flex items-center justify-between">
                            <span>Plate Number *</span>
                            {isQueryingPaqar && <span className="text-[10px] text-blue-400 animate-pulse">Querying Paqar.my...</span>}
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. WXY1234A or MADANI99"
                            value={plate}
                            onChange={(e) => handlePlateChange(e.target.value)}
                            onBlur={handlePlateBlur}
                            className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${plateError ? 'border-rose-500 bg-rose-950/25 text-rose-300' : 'border-slate-800 bg-slate-950 text-white'}`}
                        />
                        <p className="text-[10px] text-slate-400 mt-1">💡 Click outside plate input after typing to auto-fetch from Paqar.</p>
                        {plateError && <p className="text-[10px] font-bold text-rose-500 mt-1">⚠️ {plateError}</p>}
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Chassis Number (VIN) *</label>
                        <input type="text" required placeholder="e.g. PMAL123456789" value={chassis} onChange={(e) => setChassis(e.target.value.toUpperCase())} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-medium bg-slate-950 text-white uppercase" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Make *</label>
                            <input type="text" required placeholder="e.g. Perodua" value={make} onChange={(e) => setMake(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-medium bg-slate-950 text-white" />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Model *</label>
                            <input type="text" required placeholder="e.g. Myvi" value={model} onChange={(e) => setModel(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-medium bg-slate-950 text-white" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Variant / Spec</label>
                            <input type="text" placeholder="e.g. 1.5 AV" value={variant} onChange={(e) => setVariant(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-medium bg-slate-950 text-white" />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Mfg. Year *</label>
                            <select required value={year} onChange={(e) => setYear(e.target.value)} className="w-full border border-slate-800 rounded-xl p-3 text-xs font-bold bg-slate-950 text-white cursor-pointer">
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