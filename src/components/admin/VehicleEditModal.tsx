"use client"

import { useState } from 'react'

export type VehicleEditPayload = {
    plate_number: string
    chassis_number: string
    make_model_year: string
    insurance_panel: string
    intake_cost: number
    market_value: number
    repair_cost: number
}

type VehicleEditModalProps = {
    vehicle: {
        id: string
        plate_number: string
        chassis_number: string
        make_model_year: string
        insurance_panel: string
        intake_cost: number
        market_value: number
        repair_cost: number
    } | null
    isDark: boolean
    onClose: () => void
    onSave: (payload: VehicleEditPayload) => Promise<boolean>
}

export default function VehicleEditModal({ vehicle, isDark, onClose, onSave }: VehicleEditModalProps) {
    // Initialized from props; the parent mounts this modal with a fresh key per
    // vehicle (key={vehicle.id}), so state is always in sync with the vehicle.
    const [plate, setPlate] = useState(vehicle?.plate_number || '')
    const [chassis, setChassis] = useState(vehicle?.chassis_number || '')
    const [makeModelYear, setMakeModelYear] = useState(vehicle?.make_model_year || '')
    const [insurancePanel, setInsurancePanel] = useState(vehicle?.insurance_panel || '')
    const [intakeCost, setIntakeCost] = useState(vehicle?.intake_cost ? String(vehicle.intake_cost) : '')
    const [marketValue, setMarketValue] = useState(vehicle?.market_value ? String(vehicle.market_value) : '')
    const [repairCost, setRepairCost] = useState(vehicle?.repair_cost ? String(vehicle.repair_cost) : '')
    const [saving, setSaving] = useState(false)

    if (!vehicle) return null

    const bgClass = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
    const inputBgClass = isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
    const labelClass = isDark ? 'text-slate-400' : 'text-slate-600'

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!plate.trim() || !chassis.trim() || !makeModelYear.trim()) return
        setSaving(true)
        const ok = await onSave({
            plate_number: plate.trim().toUpperCase(),
            chassis_number: chassis.trim().toUpperCase(),
            make_model_year: makeModelYear.trim(),
            insurance_panel: insurancePanel.trim(),
            intake_cost: intakeCost ? parseFloat(intakeCost) : 0,
            market_value: marketValue ? parseFloat(marketValue) : 0,
            repair_cost: repairCost ? parseFloat(repairCost) : 0,
        })
        setSaving(false)
        if (ok) onClose()
    }

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className={`border rounded-3xl shadow-2xl max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto ${bgClass}`}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-extrabold">✏️ Edit Vehicle — {vehicle.plate_number}</h3>
                    <button type="button" onClick={onClose} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg cursor-pointer ${isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'}`}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Plate Number *</label>
                            <input type="text" required value={plate} onChange={(e) => setPlate(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium uppercase ${inputBgClass}`} />
                        </div>
                        <div>
                            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Chassis Number (VIN) *</label>
                            <input type="text" required value={chassis} onChange={(e) => setChassis(e.target.value.toUpperCase())} className={`w-full border rounded-xl p-3 text-xs font-medium uppercase ${inputBgClass}`} />
                        </div>
                    </div>

                    <div>
                        <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Make / Model / Year *</label>
                        <input type="text" required value={makeModelYear} onChange={(e) => setMakeModelYear(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium ${inputBgClass}`} />
                    </div>

                    <div>
                        <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Insurance Panel</label>
                        <input type="text" placeholder="e.g. Allianz General" value={insurancePanel} onChange={(e) => setInsurancePanel(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium ${inputBgClass}`} />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Intake Cost (RM)</label>
                            <input type="number" step="0.01" placeholder="0.00" value={intakeCost} onChange={(e) => setIntakeCost(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium ${inputBgClass}`} />
                        </div>
                        <div>
                            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Market Value (RM)</label>
                            <input type="number" step="0.01" placeholder="0.00" value={marketValue} onChange={(e) => setMarketValue(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium ${inputBgClass}`} />
                        </div>
                        <div>
                            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Repair Cost (RM)</label>
                            <input type="number" step="0.01" placeholder="0.00" value={repairCost} onChange={(e) => setRepairCost(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium ${inputBgClass}`} />
                        </div>
                    </div>

                    <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <button type="button" onClick={onClose} className={`px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>Cancel</button>
                        <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white cursor-pointer shadow-lg shadow-purple-500/20 disabled:opacity-50">
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
