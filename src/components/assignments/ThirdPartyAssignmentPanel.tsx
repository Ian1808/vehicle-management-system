"use client"

import { useEffect, useState, useMemo, useRef } from 'react'
import { createClient } from '@/utils/supabase/client'
import {
    fetchThirdPartyTechnicians,
    fetchAssignmentsForVehicle,
    createAssignment,
    completeAssignment,
    deleteAssignment,
    type VehicleAssignment,
} from '@/services/assignmentService'
import { fetchVehicleMedia } from '@/services/vehicleService'

// Photos uploaded by a third-party technician are stored as photo_additional with a
// category that carries the assignment id, so evidence can be grouped per assignment:
//   extra_3p_<specialty slug>_<first 8 of assignment id>
export const thirdPartyPhotoToken = (assignmentId: string) => assignmentId.slice(0, 8)

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
    readOnly?: boolean
    staged?: boolean
    onCommitReady?: (fn: (() => Promise<void>) | null) => void
    onResetReady?: (fn: (() => Promise<void>) | null) => void
    showToast: (msg: string, type: 'success' | 'error') => void
}

type PendingOp =
    | { type: 'assign'; technicianId: string; specialty: string | null; fullName: string }
    | { type: 'unassign'; assignmentId: string }
    | { type: 'complete'; assignmentId: string }

export default function ThirdPartyAssignmentPanel({ isDark, vehicleId, vehiclePlate, companyId, isAdmin = false, readOnly = false, staged = false, onCommitReady, onResetReady, showToast }: Props) {
    const [assignments, setAssignments] = useState<VehicleAssignment[]>([])
    const [techs, setTechs] = useState<ThirdPartyTech[]>([])
    const [selectedTechId, setSelectedTechId] = useState('')
    const [loading, setLoading] = useState(true)
    const [media, setMedia] = useState<{ id: string; media_type: string; category: string | null; file_url: string }[]>([])
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [pendingOps, setPendingOps] = useState<PendingOp[]>([])
    const pendingOpsRef = useRef<PendingOp[]>([])
    useEffect(() => { pendingOpsRef.current = pendingOps }, [pendingOps])

    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        async function load() {
            if (!vehicleId) return
            try {
                const [assignData, techData, mediaData] = await Promise.all([
                    fetchAssignmentsForVehicle(vehicleId),
                    fetchThirdPartyTechnicians(companyId, isAdmin),
                    fetchVehicleMedia(vehicleId),
                ])
                setAssignments(assignData)
                setTechs(techData)
                setMedia(mediaData as any)
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
    const photosFor = (assignmentId: string) => media.filter(m => {
        const cat = m.category || ''
        return m.media_type === 'photo_additional' && cat.startsWith('extra_3p_') && cat.includes(thirdPartyPhotoToken(assignmentId))
    })

    async function handleAssign() {
        if (!selectedTechId) {
            showToast('Please select a third-party technician first.', 'error')
            return
        }
        const tech = techs.find(t => t.id === selectedTechId)
        if (staged) {
            setPendingOps(ops => [...ops, { type: 'assign', technicianId: selectedTechId, specialty: tech?.specialty || null, fullName: tech?.full_name || 'Technician' }])
            setAssignments(as => [...as, {
                id: `tmp-${Date.now()}`,
                vehicle_id: vehicleId,
                technician_id: selectedTechId,
                specialty: tech?.specialty || null,
                status: 'assigned',
                created_at: new Date().toISOString(),
                completed_at: null,
                users: { full_name: tech?.full_name || 'Technician', specialty: tech?.specialty || null, technician_type: 'third_party' },
            }])
            setSelectedTechId('')
            showToast('Assignment staged — confirm Save to apply.', 'success')
            return
        }
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
        if (staged) {
            setPendingOps(ops => [...ops, { type: 'unassign', assignmentId: assignment.id }])
            setAssignments(as => as.filter(a => a.id !== assignment.id))
            showToast('Removal staged — confirm Save to apply.', 'success')
            return
        }
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
        if (staged) {
            setPendingOps(ops => [...ops, { type: 'complete', assignmentId: assignment.id }])
            setAssignments(as => as.map(a => a.id === assignment.id ? { ...a, status: 'completed', completed_at: new Date().toISOString() } : a))
            showToast('Completion staged — confirm Save to apply.', 'success')
            return
        }
        try {
            await completeAssignment(assignment.id)
            showToast(`Work marked complete for ${assignment.users?.full_name || 'technician'}.`, 'success')
            const assignData = await fetchAssignmentsForVehicle(vehicleId)
            setAssignments(assignData)
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to update assignment', 'error')
        }
    }

    // Staged mode: register commit/reset so the parent can apply or discard pending ops.
    async function commitPending() {
        for (const op of pendingOpsRef.current) {
            if (op.type === 'assign') await createAssignment(vehicleId, op.technicianId, op.specialty)
            else if (op.type === 'unassign') await deleteAssignment(op.assignmentId)
            else if (op.type === 'complete') await completeAssignment(op.assignmentId)
        }
        setPendingOps([])
        const assignData = await fetchAssignmentsForVehicle(vehicleId)
        setAssignments(assignData)
    }

    async function resetPending() {
        setPendingOps([])
        const assignData = await fetchAssignmentsForVehicle(vehicleId)
        setAssignments(assignData)
    }

    useEffect(() => {
        onCommitReady?.(staged ? commitPending : null)
        onResetReady?.(staged ? resetPending : null)
        return () => { onCommitReady?.(null); onResetReady?.(null) }
    }, [staged])

    // Exiting edit mode without committing (e.g. Back button) must not leave stale optimistic rows.
    useEffect(() => {
        if (!staged && pendingOpsRef.current.length > 0) {
            setPendingOps([])
            fetchAssignmentsForVehicle(vehicleId).then(setAssignments).catch(() => {})
        }
    }, [staged])

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
                            {assignments.map((a) => {
                                const photos = photosFor(a.id)
                                const hasEvidence = photos.length > 0
                                return (
                                <div key={a.id} className={`border rounded-2xl p-4 flex flex-col gap-3 ${panelCard}`}>
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
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
                                                    : `Assigned ${new Date(a.created_at).toLocaleString()}`}
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2 shrink-0">
                                            {!readOnly && a.status === 'assigned' && (
                                                <button
                                                    onClick={() => handleMarkComplete(a)}
                                                    disabled={!hasEvidence}
                                                    title={hasEvidence ? 'Mark this part complete' : 'Attach at least one work photo before completing'}
                                                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-colors ${hasEvidence
                                                        ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                                                        : isDark ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-slate-200 text-slate-400 cursor-not-allowed'}`}
                                                >
                                                    ✓ Mark Part Complete
                                                </button>
                                            )}
                                            {!readOnly && (
                                                <button
                                                    onClick={() => handleUnassign(a)}
                                                    className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border-rose-900' : 'bg-rose-50 hover:bg-rose-100 text-rose-600 border-rose-200'}`}
                                                    title="Remove assignment"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Work evidence attached by the third-party technician */}
                                    {hasEvidence ? (
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {photos.map(ph => (
                                                <button
                                                    key={ph.id}
                                                    onClick={() => setPreviewUrl(ph.file_url)}
                                                    className={`w-16 h-16 rounded-lg overflow-hidden border cursor-pointer hover:opacity-80 transition-opacity ${isDark ? 'border-slate-700' : 'border-slate-300'}`}
                                                    title="View work photo"
                                                >
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={ph.file_url} alt="Third-party work evidence" className="w-full h-full object-cover" />
                                                </button>
                                            ))}
                                            <span className={`text-[10px] font-bold uppercase tracking-wider ${labelClass}`}>{photos.length} photo{photos.length > 1 ? 's' : ''} attached</span>
                                        </div>
                                    ) : (
                                        <div className={`rounded-xl border px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${isDark ? 'border-amber-800 bg-amber-950/40 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                            ⚠ Photo evidence required — technician must attach a work photo{a.status === 'assigned' ? ' before this part can be completed' : ''}
                                        </div>
                                    )}
                                </div>
                                )
                            })}
                        </div>
                    )}

                    {readOnly ? (
                        <p className={`text-[10px] font-semibold ${labelClass}`}>View-only — enable Edit Details to manage assignments.</p>
                    ) : (
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
                    )}
                </div>
            )}

            {previewUrl && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={() => setPreviewUrl(null)}>
                    <div className="max-h-full max-w-full overflow-auto" onClick={(e) => e.stopPropagation()}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={previewUrl} alt="Third-party work evidence" className="max-h-[85vh] rounded-2xl border border-slate-700" />
                        <button
                            onClick={() => setPreviewUrl(null)}
                            className="mt-3 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold cursor-pointer"
                        >
                            Close preview
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
