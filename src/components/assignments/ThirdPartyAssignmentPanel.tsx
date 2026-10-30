"use client"

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
    fetchThirdPartyTechnicians,
    fetchAssignmentsForVehicle,
    createAssignment,
    completeAssignment,
    deleteAssignment,
    type VehicleAssignment,
} from '@/services/assignmentService'

type ThirdPartyTech = {
    id: string
    full_name: string | null
    username: string
    specialty: string | null
}

type Props = {
    isDark: boolean
    vehicleId: string
    vehiclePlate: string
    companyId?: string | null
    isAdmin?: boolean
    showToast: (msg: string, type: 'success' | 'error') => void
}

export default function ThirdPartyAssignmentPanel({ isDark, vehicleId, vehiclePlate, companyId, isAdmin = false, showToast }: Props) {
    const [assignments, setAssignments] = useState<VehicleAssignment[]>([])
    const [techs, setTechs] = useState<ThirdPartyTech[]>([])
    const [selectedTechId, setSelectedTechId] = useState('')
    const [loading, setLoading] = useState(true)

    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        async function load() {
            if (!vehicleId) return
            try {
                const [assignData, techData] = await Promise.all([
                    fetchAssignmentsForVehicle(vehicleId),
                    fetchThirdPartyTechnicians(companyId, isAdmin),
                ])
                setAssignments(assignData)
                setTechs(techData)
                setSelectedTechId('')
            } catch (err) {
                showToast(err instanceof Error ? err.message : 'Failed to load assignments', 'error')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [vehicleId, companyId, isAdmin])

    const assignedTechIds = new Set(assignments.map(a => a.technician_id))
    const availableTechs = techs.filter(t => !assignedTechIds.has(t.id))

    async function handleAssign() {
        if (!selectedTechId) {
            showToast('Please select a third-party technician first.', 'error')
            return
        }
        const tech = techs.find(t => t.id === selectedTechId)
        try {
            await createAssignment(vehicleId, selectedTechId, tech?.specialty || null)
            showToast(`${tech?.full_name || 'Technician'} assigned to ${vehiclePlate}.`, 'success')
            const assignData = await fetchAssignmentsForVehicle(vehicleId)
            setAssignments(assignData)
            setSelectedTechId('')
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to assign technician', 'error')
        }
    }

    async function handleUnassign(assignment: VehicleAssignment) {
        try {
            await deleteAssignment(assignment.id)
            showToast('Assignment removed.', 'success')
            const assignData = await fetchAssignmentsForVehicle(vehicleId)
            setAssignments(assignData)
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to remove assignment', 'error')
        }
    }

    async function handleMarkComplete(assignment: VehicleAssignment) {
        try {
            await completeAssignment(assignment.id)
            showToast(`Work marked complete for ${assignment.users?.full_name || 'technician'}.`, 'success')
            const assignData = await fetchAssignmentsForVehicle(vehicleId)
            setAssignments(assignData)
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to update assignment', 'error')
        }
    }

    const panelCard = isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'
    const labelClass = isDark ? 'text-slate-400' : 'text-slate-500'

    return (
        <div>
            <h3 className={`text-sm font-extrabold uppercase tracking-wider mb-6 pb-4 border-b ${isDark ? 'border-slate-800/50 text-white' : 'border-slate-200 text-slate-900'}`}>
                Third-Party Work Assignments ({assignments.length})
            </h3>

            {loading ? (
                <p className={`text-xs font-semibold ${labelClass}`}>Loading assignments…</p>
            ) : (
                <div className="space-y-4">
                    {assignments.length === 0 ? (
                        <p className={`text-xs font-semibold ${labelClass}`}>No third-party technicians assigned to this vehicle yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {assignments.map((a) => (
                                <div key={a.id} className={`border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${panelCard}`}>
                                    <div className="min-w-0">
                                        <p className={`text-sm font-black truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                            {a.users?.full_name || 'Technician'}
                                            {a.specialty && (
                                                <span className={`ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${isDark ? 'bg-purple-950 text-purple-300 border-purple-800' : 'bg-purple-50 text-purple-600 border-purple-200'}`}>
                                                    {a.specialty}
                                                </span>
                                            )}
                                        </p>
                                        <p className={`text-[11px] mt-1 ${labelClass}`}>
                                            {a.status === 'completed'
                                                ? `✓ Completed ${a.completed_at ? new Date(a.completed_at).toLocaleString() : ''}`
                                                : `Assigned ${new Date(a.created_at).toLocaleString()} — pending photos`}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 shrink-0">
                                        {a.status === 'assigned' && (
                                            <button
                                                onClick={() => handleMarkComplete(a)}
                                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                                                title="Mark this part complete (photos still viewable)"
                                            >
                                                ✓ Mark Part Complete
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleUnassign(a)}
                                            className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border-rose-900' : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200'}`}
                                            title="Remove assignment"
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className={`border rounded-2xl p-4 flex flex-col sm:flex-row gap-3 sm:items-center ${panelCard}`}>
                        <div className="flex-1 min-w-0">
                            <p className={`text-[11px] font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Assign a third-party technician</p>
                            {availableTechs.length === 0 ? (
                                <p className="text-xs font-semibold text-slate-500">
                                    {techs.length === 0
                                        ? 'No third-party technicians exist yet. Create one in Staff Management (Role: Technician → Type: Third-Party).'
                                        : 'All third-party technicians are already assigned to this vehicle.'}
                                </p>
                            ) : (
                                <select
                                    value={selectedTechId}
                                    onChange={(e) => setSelectedTechId(e.target.value)}
                                    className={`w-full border rounded-xl p-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                                >
                                    <option value="">Select technician…</option>
                                    {availableTechs.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.full_name || t.username}{t.specialty ? ` — ${t.specialty}` : ''}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                        {availableTechs.length > 0 && (
                            <button
                                onClick={handleAssign}
                                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors shrink-0"
                            >
                                + Assign
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
