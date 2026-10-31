"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { addWatermarkToFile } from '@/utils/watermark'
import { useTheme } from '@/lib/theme'
import { PHOTO_CATEGORIES } from '@/lib/photoCategories'
import { uniqueFileSuffix } from '@/lib/uploadUtils'
import { getPhotoStageRules } from '@/lib/photoStages'
import { completeAssignment, type VehicleAssignment } from '@/services/assignmentService'
import Toast from '@/components/ui/Toast'
import ConfirmModal from '@/components/ui/ConfirmModal'
import PreviewModal from '@/components/ui/PreviewModal'
import PhotoThumb from '@/components/ui/PhotoThumb'
import Card from '@/components/ui/Card'
import StatusBadge from '@/components/ui/StatusBadge'
import SectionHeading from '@/components/ui/SectionHeading'
import EmptyState from '@/components/ui/EmptyState'
import ResponsiveTable from '@/components/ui/ResponsiveTable'
import PhotoEvidenceCell from '@/components/technician/PhotoEvidenceCell'

type Vehicle = {
    id: string
    plate_number: string
    chassis_number: string
    make_model_year: string
    status: string
    repair_cost: number
}

type MediaItem = {
    id: string
    category: string
    file_url: string
    media_type: string
    vehicle_id: string
}

type ToastState = { message: string; type: 'success' | 'error' } | null
type ConfirmState = {
    title: string
    message: string
    confirmText?: string
    confirmVariant?: 'primary' | 'danger' | 'success'
    onConfirm: () => void
} | null
type PreviewState = { items: { url: string; title: string }[]; index: number } | null

export default function TechnicianModule({ embedded = false }: { embedded?: boolean }) {
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
    const [myAssignments, setMyAssignments] = useState<VehicleAssignment[]>([])
    const [loading, setLoading] = useState(true)

    // Modals & UI State
    const [uploadingKey, setUploadingKey] = useState<string | null>(null)
    const [toast, setToast] = useState<ToastState>(null)
    const [confirmModal, setConfirmModal] = useState<ConfirmState>(null)
    const [previewMedia, setPreviewMedia] = useState<PreviewState>(null)
    const [photoGroup, setPhotoGroup] = useState<'before' | 'after' | 'additional'>('before')
    const { isDark } = useTheme()

    // Additional Evidence Photos State
    const [showLabelModal, setShowLabelModal] = useState(false)
    const [pendingAdditionalFile, setPendingAdditionalFile] = useState<File | null>(null)
    const [customPhotoLabel, setCustomPhotoLabel] = useState('')

    // User State
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    // Technician profile: third-party techs get the assignments view.
    const [technicianType, setTechnicianType] = useState<string>('inhouse')
    const [specialty, setSpecialty] = useState<string | null>(null)

    const supabase = createClient()

    function openPhaseGallery(phase: 'photo_before' | 'photo_after', clickedUrl: string) {
        const items = mediaItems
            .filter(m => m.media_type === phase)
            .map(m => ({
                url: m.file_url,
                title: `${selectedVehicle?.plate_number ?? ''} - ${PHOTO_CATEGORIES.find(c => c.key === m.category)?.label ?? m.category} (${phase === 'photo_before' ? 'Before' : 'After'})`,
            }))
        setPreviewMedia({ items, index: Math.max(0, items.findIndex(it => it.url === clickedUrl)) })
    }

    function openAdditionalGallery(clickedUrl: string) {
        const items = additionalPhotos.map(item => ({
            url: item.file_url,
            title: `${selectedVehicle?.plate_number ?? ''} - ${item.category.replace(/^extra_/, '').replace(/_[0-9a-f]{8}$/, '').replace(/_/g, ' ')} (Additional)`,
        }))
        setPreviewMedia({ items, index: Math.max(0, items.findIndex(it => it.url === clickedUrl)) })
    }

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    useEffect(() => {
        async function init() {
            try {
                const { data: { user }, error } = await supabase.auth.getUser()
                if (!user || error) {
                    window.location.href = '/login'
                    return
                }

                setCurrentUserId(user.id)

                const { data: userData } = await supabase
                    .from('users')
                    .select('role, full_name, username, company_id, technician_type, specialty')
                    .eq('id', user.id)
                    .single()

                if (!userData || (userData.role !== 'technician' && userData.role !== 'admin' && userData.role !== 'manager')) {
                    showToast('Access Denied: Technician / Manager / Admin only.', 'error')
                    setTimeout(() => { window.location.href = '/' }, 1500)
                    return
                }

                setTechnicianType(userData.technician_type || 'inhouse')
                setSpecialty(userData.specialty || null)

                if (userData.technician_type === 'third_party' && userData.role === 'technician') {
                    // Third-party technician: only vehicles assigned to them.
                    const { data: myAssignments, error: assignErr } = await supabase
                        .from('vehicle_assignments')
                        .select('*, vehicles(plate_number, make_model_year, status, company_id)')
                        .eq('technician_id', user.id)
                        .order('created_at', { ascending: false })

                    if (assignErr) {
                        if (assignErr.message.includes('vehicle_assignments')) {
                            console.warn('[TechnicianModule] vehicle_assignments table missing — assignments disabled until DB migration runs')
                        } else {
                            throw assignErr
                        }
                    } else {
                        setMyAssignments(myAssignments || [])
                    }
                    setLoading(false)
                    return
                }

                let queueQuery = supabase
                    .from('vehicles')
                    .select('*')
                    .in('status', ['pending_before_photos', 'in_repair', 'pending_after_photos', 'completed'])
                    .eq('is_deleted', false)

                if (userData.role !== 'admin') {
                    queueQuery = queueQuery.eq('company_id', userData.company_id || '')
                }

                const { data: list, error: fetchErr } = await queueQuery.order('created_at', { ascending: false })

                // company_id may not exist yet if the DB migration hasn't been run —
                // degrade to unscoped queue so existing technicians keep working.
                if (fetchErr && userData.role !== 'admin' && fetchErr.message.includes('company_id')) {
                    console.warn('[TechnicianModule] company_id column missing — company scoping disabled until DB migration runs')
                    const fallback = await supabase
                        .from('vehicles')
                        .select('*')
                        .in('status', ['pending_before_photos', 'in_repair', 'pending_after_photos', 'completed'])
                        .eq('is_deleted', false)
                        .order('created_at', { ascending: false })
                    if (!fallback.error) {
                        setVehicles(fallback.data || [])
                        setLoading(false)
                        return
                    }
                }

                if (fetchErr) throw fetchErr
                setVehicles(list || [])
            } catch (err: any) {
                showToast(err.message || 'Initialization failed', 'error')
            } finally {
                setLoading(false)
            }
        }
        init()
    }, [])

    useEffect(() => {
        async function loadMedia() {
            if (selectedVehicle) {
                const { data } = await supabase.from('vehicle_media').select('*').eq('vehicle_id', selectedVehicle.id)
                setMediaItems(data || [])
            }
        }
        loadMedia()
        setPhotoGroup('before')
    }, [selectedVehicle?.id])

    function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>, categoryKey: string, mediaType: 'photo_before' | 'photo_after') {
        const file = e.target.files?.[0]
        if (!file || !selectedVehicle) return

        if (file.size > 5 * 1024 * 1024) {
            showToast('File is too large. Max size is 5MB.', 'error')
            e.target.value = ''
            return
        }

        const catLabel = PHOTO_CATEGORIES.find(c => c.key === categoryKey)?.label || categoryKey
        const phaseLabel = mediaType === 'photo_before' ? 'BEFORE Repair' : 'AFTER Repair'

        setConfirmModal({
            title: 'Confirm Photo Upload',
            message: `Watermark and upload "${file.name}" for ${catLabel} (${phaseLabel})?`,
            confirmText: 'Upload Photo',
            confirmVariant: 'primary',
            onConfirm: () => executePhotoUpload(file, categoryKey, mediaType),
        })
        e.target.value = ''
    }

    function handleAdditionalPhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file || !selectedVehicle) return

        if (file.size > 10 * 1024 * 1024) {
            showToast('Photo is too large. Maximum size is 10MB.', 'error')
            e.target.value = ''
            return
        }

        setPendingAdditionalFile(file)
        setCustomPhotoLabel('Additional Detail')
        setShowLabelModal(true)
        e.target.value = ''
    }

    function confirmAdditionalPhotoUpload() {
        if (!pendingAdditionalFile || !selectedVehicle) return
        setShowLabelModal(false)

        const labelClean = customPhotoLabel.trim() || 'Additional Detail'
        const labelKey = labelClean.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const categoryKey = `extra_${labelKey}_${crypto.randomUUID().slice(0, 8)}`

        setConfirmModal({
            title: 'Upload Additional Photo',
            message: `Upload and watermark additional photo labeled "${labelClean}"?`,
            confirmText: 'Upload Additional Photo',
            confirmVariant: 'primary',
            onConfirm: () => executePhotoUpload(pendingAdditionalFile, categoryKey, 'photo_additional'),
        })
        setPendingAdditionalFile(null)
    }

    async function executePhotoUpload(file: File, categoryKey: string, mediaType: 'photo_before' | 'photo_after' | 'photo_additional') {
        setConfirmModal(null)
        if (!selectedVehicle) return

        const uploadKey = `${mediaType}_${categoryKey}`
        setUploadingKey(uploadKey)
        showToast(`Watermarking & uploading photo...`, 'success')

        try {
            const phaseText = mediaType === 'photo_before' ? 'BEFORE' : mediaType === 'photo_after' ? 'AFTER' : 'EXTRA EVIDENCE'
            const watermarkText = `CONFIDENTIAL • ${selectedVehicle.plate_number} • ${categoryKey.toUpperCase()} • ${phaseText}`
            const fileToUpload = await addWatermarkToFile(file, watermarkText)

            // Mandatory angles replace the existing photo; additional evidence photos are additive.
            if (mediaType !== 'photo_additional') {
                const existing = mediaItems.find(m => m.media_type === mediaType && m.category === categoryKey)
                if (existing) {
                    await supabase.from('vehicle_media').delete().eq('id', existing.id)
                }
            }

            const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'jpg'
            const path = `${selectedVehicle.id}/${mediaType}/${categoryKey}_${uniqueFileSuffix()}.${fileExt}`

            const { data: uploadData, error: uploadErr } = await supabase.storage
                .from('vehicle-files')
                .upload(path, fileToUpload, { cacheControl: '3600', upsert: true })

            if (uploadErr) throw uploadErr

            const { data: publicURLData } = supabase.storage.from('vehicle-files').getPublicUrl(uploadData.path)

            await supabase.from('vehicle_media').insert([{
                vehicle_id: selectedVehicle.id,
                media_type: mediaType,
                category: categoryKey,
                file_url: publicURLData.publicUrl,
                uploaded_by: currentUserId,
            }])

            showToast('Photo uploaded successfully!', 'success')
            const { data: updatedMedia } = await supabase.from('vehicle_media').select('*').eq('vehicle_id', selectedVehicle.id)
            setMediaItems(updatedMedia || [])
        } catch (err: any) {
            showToast(err.message || 'Photo upload failed', 'error')
        } finally {
            setUploadingKey(null)
        }
    }

    function handleRemovePhoto(item: MediaItem) {
        if (!selectedVehicle) return
        const phase = item.media_type === 'photo_before' ? 'BEFORE' : item.media_type === 'photo_after' ? 'AFTER' : 'ADDITIONAL'
        const catLabel = item.media_type === 'photo_additional'
            ? item.category.replace(/^extra_/, '').replace(/_[0-9a-f]{8}$/, '').replace(/_/g, ' ')
            : (PHOTO_CATEGORIES.find(c => c.key === item.category)?.label || item.category)
        setConfirmModal({
            title: 'Remove Photo',
            message: `Remove the ${phase} "${catLabel}" photo for ${selectedVehicle.plate_number}? This cannot be undone.`,
            confirmText: 'Remove Photo',
            confirmVariant: 'danger',
            onConfirm: () => executeRemovePhoto(item),
        })
    }

    async function executeRemovePhoto(item: MediaItem) {
        setConfirmModal(null)
        try {
            // Resolve the storage path from the public URL, then delete the file and the DB record.
            const url = new URL(item.file_url)
            const marker = '/storage/v1/object/public/vehicle-files/'
            const idx = url.pathname.indexOf(marker)
            const storagePath = idx !== -1 ? url.pathname.slice(idx + marker.length) : null
            if (storagePath) {
                await supabase.storage.from('vehicle-files').remove([storagePath])
            }
            await supabase.from('vehicle_media').delete().eq('id', item.id)
            const { data: updatedMedia } = await supabase.from('vehicle_media').select('*').eq('vehicle_id', item.vehicle_id)
            setMediaItems(updatedMedia || [])
            showToast('Photo removed successfully!', 'success')
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to remove photo', 'error')
        }
    }

    const totalAngles = PHOTO_CATEGORIES.length
    const beforeCapturedAngles = PHOTO_CATEGORIES.filter(c => mediaItems.some(m => m.media_type === 'photo_before' && m.category === c.key)).length
    const afterCapturedAngles = PHOTO_CATEGORIES.filter(c => mediaItems.some(m => m.media_type === 'photo_after' && m.category === c.key)).length
    const additionalPhotos = mediaItems.filter(m => m.media_type === 'photo_additional')
    const allBeforeCaptured = beforeCapturedAngles === totalAngles
    const allAfterCaptured = afterCapturedAngles === totalAngles
    const stage = selectedVehicle ? getPhotoStageRules(selectedVehicle.status) : null
    const beforeMode = stage?.before ?? 'readonly'
    const afterMode = stage?.after ?? 'readonly'
    const additionalMode = stage?.additional ?? 'readonly'
    const showBeforeSection = beforeMode !== 'hidden'
    const showAfterSection = afterMode !== 'hidden'

    // Photo evidence tabs — one group at a time (same pattern as Front Desk)
    const photoGroups = [
        { key: 'before' as const, label: 'Before Repair', count: beforeCapturedAngles, total: totalAngles, shown: showBeforeSection },
        { key: 'after' as const, label: 'After Repair', count: afterCapturedAngles, total: totalAngles, shown: showAfterSection },
        { key: 'additional' as const, label: 'Additional', count: additionalPhotos.length, total: 0, shown: additionalMode !== 'hidden' },
    ].filter(g => g.shown)
    const activePhotoGroup = photoGroups.some(g => g.key === photoGroup) ? photoGroup : (photoGroups[0]?.key ?? null)

    function handleStartRepair() {
        if (!selectedVehicle) return
        if (!allBeforeCaptured) {
            showToast(`Cannot start repair — ${totalAngles - beforeCapturedAngles} 'Before' photo(s) still missing. All ${totalAngles} angles are required.`, 'error')
            return
        }
        setConfirmModal({
            title: 'Start Repair',
            message: `All 8 'Before' photos captured. Move ${selectedVehicle.plate_number} to IN REPAIR?`,
            confirmText: 'Start Repair',
            confirmVariant: 'success',
            onConfirm: async () => {
                setConfirmModal(null)
                try {
                    await supabase.from('vehicles').update({ status: 'in_repair' }).eq('id', selectedVehicle.id)
                    setSelectedVehicle({ ...selectedVehicle, status: 'in_repair' })
                    showToast('Vehicle moved to In Repair!', 'success')
                } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Failed to update status', 'error')
                }
            }
        })
    }

    function handleFinishRepair() {
        if (!selectedVehicle) return
        setConfirmModal({
            title: 'Finish Repair',
            message: `Mark ${selectedVehicle.plate_number} as REPAIR COMPLETE and move to Pending After Photos?`,
            confirmText: 'Finish Repair',
            confirmVariant: 'primary',
            onConfirm: async () => {
                setConfirmModal(null)
                try {
                    await supabase.from('vehicles').update({ status: 'pending_after_photos' }).eq('id', selectedVehicle.id)
                    setSelectedVehicle({ ...selectedVehicle, status: 'pending_after_photos' })
                    showToast('Vehicle moved to Pending After Photos!', 'success')
                } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Failed to update status', 'error')
                }
            }
        })
    }

    function handleCompleteVehicle() {
        if (!selectedVehicle) return
        if (!allAfterCaptured) {
            showToast(`Cannot mark completed — ${totalAngles - afterCapturedAngles} 'After' photo(s) still missing. All ${totalAngles} angles are required.`, 'error')
            return
        }
        setConfirmModal({
            title: 'Mark Completed',
            message: `All 8 'After' photos captured. Mark ${selectedVehicle.plate_number} as COMPLETED?`,
            confirmText: 'Mark Completed',
            confirmVariant: 'success',
            onConfirm: async () => {
                setConfirmModal(null)
                try {
                    await supabase.from('vehicles').update({ status: 'completed' }).eq('id', selectedVehicle.id)
                    setSelectedVehicle({ ...selectedVehicle, status: 'completed' })
                    showToast('Vehicle marked as Completed!', 'success')
                } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Failed to update status', 'error')
                }
            }
        })
    }

    async function handleDownload(url: string, title: string) {
        try {
            const res = await fetch(url)
            const blob = await res.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = title.replace(/[^a-z0-9]/gi, '_').toLowerCase()
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(blobUrl)
        } catch {
            window.open(url, '_blank')
        }
    }

    // ---- Third-party technician handlers ----

    async function reloadMyAssignments() {
        if (!currentUserId) return
        try {
            const { data } = await supabase
                .from('vehicle_assignments')
                .select('*, vehicles(plate_number, make_model_year, status, company_id)')
                .eq('technician_id', currentUserId)
                .order('created_at', { ascending: false })
            if (!data) return
            setMyAssignments(data)
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to refresh assignments', 'error')
        }
    }

    async function handleThirdPartyUpload(assignment: VehicleAssignment, file: File | null) {
        if (!file || !currentUserId) return
        const uploadKey = `3p_${assignment.id}`
        setUploadingKey(uploadKey)
        try {
            const plate = assignment.vehicles?.plate_number || 'VEHICLE'
            const slug = (specialty || 'work').replace(/[^a-z0-9]+/gi, '_').toLowerCase().replace(/^_+|_+$/g, '') || 'work'
            const watermarkText = `CONFIDENTIAL • ${plate} • ${(specialty || 'THIRD-PARTY').toUpperCase()}`
            const fileToUpload = await addWatermarkToFile(file, watermarkText)
            const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'jpg'
            const path = `${assignment.vehicle_id}/photo_additional/extra_3p_${slug}_${uniqueFileSuffix()}.${fileExt}`

            const { data: uploadData, error: uploadErr } = await supabase.storage
                .from('vehicle-files')
                .upload(path, fileToUpload, { cacheControl: '3600', upsert: true })
            if (uploadErr) throw uploadErr

            const { data: publicURLData } = supabase.storage.from('vehicle-files').getPublicUrl(uploadData.path)

            await supabase.from('vehicle_media').insert([{
                vehicle_id: assignment.vehicle_id,
                media_type: 'photo_additional',
                category: `extra_3p_${slug}_${uniqueFileSuffix().slice(0, 8)}`,
                file_url: publicURLData.publicUrl,
                uploaded_by: currentUserId,
            }])

            showToast(`Photo uploaded to additional evidence for ${plate}!`, 'success')
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Photo upload failed', 'error')
        } finally {
            setUploadingKey(null)
        }
    }

    function requestMarkAssignmentComplete(assignment: VehicleAssignment) {
        setConfirmModal({
            title: 'Mark Part Complete',
            message: `Mark your work on ${assignment.vehicles?.plate_number || 'this vehicle'} as complete? You can still upload photos afterwards.`,
            confirmText: 'Mark Complete',
            confirmVariant: 'success',
            onConfirm: async () => {
                setConfirmModal(null)
                try {
                    await completeAssignment(assignment.id)
                    showToast('Part marked complete!', 'success')
                    await reloadMyAssignments()
                } catch (err) {
                    showToast(err instanceof Error ? err.message : 'Failed to mark complete', 'error')
                }
            }
        })
    }

    const bgClass = isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'
    const innerCard = isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'

    return (
        <div className={`min-h-screen ${embedded ? '' : 'pb-24 lg:pb-0 '}transition-colors duration-200 ${bgClass}`}>
            {toast && <Toast message={toast.message} type={toast.type} isDark={isDark} />}
            {confirmModal && (
                <ConfirmModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    confirmText={confirmModal.confirmText}
                    confirmVariant={confirmModal.confirmVariant}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal(null)}
                    isDark={isDark}
                />
            )}
            <PreviewModal preview={previewMedia} onClose={() => setPreviewMedia(null)} onDownload={handleDownload} onNavigate={(index) => setPreviewMedia(prev => (prev ? { ...prev, index } : prev))} isDark={isDark} />

            {/* Custom Label Dialog Modal */}
            {showLabelModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className={`border rounded-3xl shadow-2xl max-w-sm w-full p-6 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}>
                        <h3 className={`text-base font-extrabold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Label Additional Photo</h3>
                        <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Enter a clear description for this extra evidence photo:</p>
                        <input
                            type="text"
                            value={customPhotoLabel}
                            onChange={(e) => setCustomPhotoLabel(e.target.value)}
                            placeholder="e.g. Scratched Bumper Detail"
                            className={`w-full border rounded-xl p-3 text-xs mb-6 focus:outline-none focus:ring-2 focus:ring-purple-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-300 text-slate-800'}`}
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowLabelModal(false)}
                                className={`w-1/2 py-2.5 rounded-xl text-xs font-bold cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-600 bg-slate-100 border-slate-200'}`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmAdditionalPhotoUpload}
                                className="w-1/2 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 shadow-md cursor-pointer"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                {technicianType === 'third_party' ? (
                    <div>
                        <SectionHeading
                            isDark={isDark}
                            title={`My Third-Party Assignments${specialty ? ` — ${specialty}` : ''}`}
                            subtitle="Only vehicles assigned to you appear here. Upload photos of your completed work into the vehicle's additional evidence, then mark your part done."
                        />

                        {myAssignments.length === 0 ? (
                            <EmptyState isDark={isDark} message="No vehicles have been assigned to you yet. The admin, manager, or front desk will assign you once they need your specialist work." />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                {myAssignments.map((a) => {
                                    const done = a.status === 'completed'
                                    const plate = a.vehicles?.plate_number || 'Unknown'
                                    return (
                                        <Card key={a.id} isDark={isDark} className="p-5 flex flex-col justify-between shadow-xl">
                                            <div>
                                                <div className="flex items-center justify-between gap-2 mb-2">
                                                    <h3 className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{plate}</h3>
                                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${done
                                                        ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                                        : 'bg-amber-950 text-amber-300 border-amber-800'
                                                        }`}>
                                                        {done ? '✓ Completed' : 'Pending'}
                                                    </span>
                                                </div>
                                                <p className={`text-xs font-semibold mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{a.vehicles?.make_model_year || '—'}</p>
                                                {a.specialty && (
                                                    <span className={`inline-block mb-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${isDark ? 'bg-purple-950 text-purple-300 border-purple-800/60' : 'bg-purple-50 text-purple-600 border-purple-200'}`}>
                                                        🔧 {a.specialty}
                                                    </span>
                                                )}
                                                <p className={`text-[11px] mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    {done && a.completed_at ? `Completed ${new Date(a.completed_at).toLocaleString()}` : `Assigned ${new Date(a.created_at).toLocaleString()}`}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <label
                                                    htmlFor={`3p-upload-${a.id}`}
                                                    className={`flex-1 text-center px-3 py-2.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark
                                                        ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700'
                                                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                                                        }`}
                                                >
                                                    {uploadingKey === `3p_${a.id}` ? 'Uploading…' : '📁 Upload Photo'}
                                                </label>
                                                <label
                                                    htmlFor={`3p-camera-${a.id}`}
                                                    className={`flex-1 text-center px-3 py-2.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark
                                                        ? 'bg-blue-950 hover:bg-blue-900 text-blue-300 border-blue-800'
                                                        : 'bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200'
                                                        }`}
                                                >
                                                    📷 Take Photo
                                                </label>
                                                <input id={`3p-upload-${a.id}`} type="file" accept="image/*" className="hidden" onChange={(e) => handleThirdPartyUpload(a, e.target.files?.[0] || null)} />
                                                <input id={`3p-camera-${a.id}`} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleThirdPartyUpload(a, e.target.files?.[0] || null)} />
                                                {!done && (
                                                    <button
                                                        onClick={() => requestMarkAssignmentComplete(a)}
                                                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                                                    >
                                                        ✓ Mark Part Complete
                                                    </button>
                                                )}
                                            </div>
                                        </Card>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                ) : selectedVehicle ? (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <button onClick={() => setSelectedVehicle(null)} className={`text-xs font-bold px-3.5 py-2 rounded-xl border cursor-pointer ${isDark ? 'border-slate-800 bg-slate-950 text-emerald-400' : 'border-slate-200 bg-white text-emerald-600'}`}>
                                &larr; Back to Workshop Queue
                            </button>
                        </div>

                        <Card isDark={isDark} className="p-5 sm:p-8 mb-8 shadow-2xl">
                            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <div>
                                    <h2 className={`text-2xl sm:text-3xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedVehicle.plate_number}</h2>
                                    <p className={`mt-1 font-semibold text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{selectedVehicle.make_model_year}</p>
                                    <p className={`text-xs font-mono mt-2 inline-block px-3 py-1 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                        VIN: <span className={isDark ? 'text-white' : 'text-slate-900'}>{selectedVehicle.chassis_number}</span>
                                    </p>
                                </div>
                                <StatusBadge status={selectedVehicle.status} />
                            </div>

                            {/* Photo completeness banner */}
                            {selectedVehicle.status === 'pending_before_photos' && !allBeforeCaptured && (
                                <div className={`mt-6 px-5 py-3.5 rounded-2xl border flex items-center gap-3 text-xs font-bold ${isDark ? 'bg-amber-950/60 border-amber-800/70 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                                    <span>⚠️</span>
                                    <span>Incomplete: {beforeCapturedAngles}/{totalAngles} ‘Before’ photos captured. All {totalAngles} angles required.</span>
                                </div>
                            )}
                            {selectedVehicle.status === 'pending_after_photos' && !allAfterCaptured && (
                                <div className={`mt-6 px-5 py-3.5 rounded-2xl border flex items-center gap-3 text-xs font-bold ${isDark ? 'bg-amber-950/60 border-amber-800/70 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                                    <span>⚠️</span>
                                    <span>Incomplete: {afterCapturedAngles}/{totalAngles} ‘After’ photos captured. All {totalAngles} angles required.</span>
                                </div>
                            )}

                            {/* Gated stage advancement */}
                            {selectedVehicle.status === 'pending_before_photos' && (
                                <button onClick={handleStartRepair} className="mt-6 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-3.5 rounded-2xl text-sm shadow-lg cursor-pointer transition-colors">
                                    Complete “Before” Photos → Start Repair
                                </button>
                            )}
                            {selectedVehicle.status === 'in_repair' && (
                                <button onClick={handleFinishRepair} className="mt-6 w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-3.5 rounded-2xl text-sm shadow-lg cursor-pointer transition-colors">
                                    Finish Repair → Pending After Photos
                                </button>
                            )}
                            {selectedVehicle.status === 'pending_after_photos' && (
                                <button onClick={handleCompleteVehicle} className="mt-6 w-full bg-violet-600 hover:bg-violet-500 text-white font-extrabold py-3.5 rounded-2xl text-sm shadow-lg cursor-pointer transition-colors">
                                    Complete “After” Photos → Mark Completed
                                </button>
                            )}
                            {selectedVehicle.status === 'completed' && (
                                <div className={`mt-6 px-5 py-3.5 rounded-2xl border text-center text-xs font-extrabold ${isDark ? 'bg-emerald-950/60 border-emerald-800/70 text-emerald-300' : 'bg-emerald-50 border-emerald-300 text-emerald-700'}`}>
                                    ✓ Vehicle Completed
                                </div>
                            )}

                            {/* Photo evidence — tabbed: Before / After / Additional, one group at a time */}
                            {photoGroups.length > 0 && (
                                <div className="pt-8 space-y-6">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <h3 className={`text-sm font-extrabold tracking-wider uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>Workshop Inspection Evidence</h3>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {photoGroups.map(g => (
                                            <button
                                                key={g.key}
                                                type="button"
                                                onClick={() => setPhotoGroup(g.key)}
                                                className={`px-3.5 py-1.5 rounded-full text-[11px] font-extrabold border cursor-pointer transition-colors ${activePhotoGroup === g.key ? 'bg-blue-600 text-white border-blue-600' : isDark ? 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white' : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'}`}
                                            >
                                                {g.label} · {g.count}{g.total ? `/${g.total}` : ''}
                                            </button>
                                        ))}
                                    </div>

                                    {(activePhotoGroup === 'before' || activePhotoGroup === 'after') && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                            {PHOTO_CATEGORIES.map((cat) => {
                                                const mediaType = activePhotoGroup === 'before' ? 'photo_before' : 'photo_after'
                                                const item = mediaItems.find(m => m.media_type === mediaType && m.category === cat.key)

                                                return (
                                                    <div key={cat.key} className={`border rounded-2xl p-4 sm:p-5 ${innerCard}`}>
                                                        <p className={`text-xs font-extrabold uppercase mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>{cat.label}</p>

                                                        <div className="grid grid-cols-1 gap-4">
                                                            <PhotoEvidenceCell
                                                                isDark={isDark}
                                                                phase={activePhotoGroup}
                                                                isCaptured={!!item}
                                                                photoUrl={item?.file_url}
                                                                readonly={activePhotoGroup === 'before' ? beforeMode === 'readonly' : afterMode === 'readonly'}
                                                                onView={() => openPhaseGallery(mediaType, item!.file_url)}
                                                                onRemove={() => handleRemovePhoto(item!)}
                                                                onFileChange={(e) => handlePhotoSelect(e, cat.key, mediaType)}
                                                                inputId={`upload-${activePhotoGroup}-${cat.key}`}
                                                            />
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {activePhotoGroup === 'additional' && (
                                        <div className="space-y-4">
                                            <div className={`border rounded-2xl p-4 sm:p-5 ${innerCard}`}>
                                                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                                    <div>
                                                        <h3 className={`font-bold text-sm uppercase tracking-wider ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Additional Evidence Photos</h3>
                                                        <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Upload close-up damage details, part codes, or extra inspection angles.</p>
                                                    </div>
                                                    {additionalMode === 'edit' && (
                                                        <div className="flex gap-2">
                                                            <label
                                                                htmlFor="tech-input-additional"
                                                                className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-1.5 rounded-xl font-bold cursor-pointer shadow inline-block transition-colors"
                                                            >
                                                                {uploadingKey ? 'Uploading…' : '📷 Take Photo'}
                                                            </label>
                                                            <input
                                                                id="tech-input-additional"
                                                                type="file"
                                                                accept="image/*"
                                                                capture="environment"
                                                                className="hidden"
                                                                onChange={handleAdditionalPhotoSelect}
                                                            />
                                                            <label
                                                                htmlFor="tech-input-additional-file"
                                                                className={`text-xs px-3.5 py-1.5 rounded-xl font-bold cursor-pointer shadow inline-block transition-colors ${isDark ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                                                            >
                                                                {uploadingKey ? 'Uploading…' : '📁 Upload'}
                                                            </label>
                                                            <input
                                                                id="tech-input-additional-file"
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={handleAdditionalPhotoSelect}
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                {additionalPhotos.length === 0 ? (
                                                    <div className={`border border-dashed rounded-xl p-4 text-center text-xs font-medium ${isDark ? 'bg-slate-950/50 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-500'}`}>
                                                        {additionalMode === 'edit' ? 'No additional evidence photos uploaded yet. Tap “+ Add Photo” to snap optional extra angles.' : 'No additional evidence photos uploaded by the technician.'}
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        {additionalPhotos.map((item) => {
                                                            const displayTitle = item.category.replace(/^extra_/, '').replace(/_[0-9a-f]{8}$/, '').replace(/_/g, ' ')
                                                            return (
                                                                <div key={item.id} className={`border rounded-xl p-3.5 flex flex-col justify-between gap-2.5 ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'}`}>
                                                                    <div className="flex items-center justify-between gap-2">
                                                                        <p className={`text-xs font-bold capitalize ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>{displayTitle}</p>
                                                                        <p className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>✓ Extra Evidence</p>
                                                                    </div>
                                                                    <PhotoThumb
                                                                        url={item.file_url}
                                                                        alt={`${selectedVehicle?.plate_number ?? ''} - ${displayTitle}`}
                                                                        onClick={() => openAdditionalGallery(item.file_url)}
                                                                        className="h-40"
                                                                    />
                                                                    {additionalMode === 'edit' && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRemovePhoto(item)}
                                                                            className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold border cursor-pointer ${isDark ? 'bg-rose-950 text-rose-400 border-rose-900' : 'bg-rose-50 text-rose-600 border-rose-200'}`}
                                                                        >
                                                                            Remove
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </Card>
                    </div>
                ) : (
                    <div>
                        <SectionHeading
                            isDark={isDark}
                            title="Active Workshop Vehicles"
                            right={
                                <span className={`text-xs font-bold px-3.5 py-1.5 rounded-full border ${isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-white text-slate-600'}`}>
                                    Queue: {vehicles.length} Vehicles
                                </span>
                            }
                        />

                        {loading ? (
                            <EmptyState isDark={isDark} message="Loading workshop queue..." />
                        ) : vehicles.length === 0 ? (
                            <EmptyState isDark={isDark} message="No vehicles currently assigned to the workshop queue." />
                        ) : (
                            <>
                            <div className="hidden md:block">
                            <ResponsiveTable isDark={isDark} minWidth="min-w-[640px]">
                                <thead>
                                    <tr className={`text-[11px] uppercase font-bold border-b ${isDark ? 'text-slate-400 border-slate-800 bg-slate-900/80' : 'text-slate-500 border-slate-200 bg-slate-100'}`}>
                                        <th className="p-4">Plate Number</th>
                                        <th className="p-4">Make / Model / Year</th>
                                        <th className="p-4">Current Status</th>
                                        <th className="p-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y text-xs font-medium ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-200 text-slate-700'}`}>
                                    {vehicles.map((v) => (
                                        <tr key={v.id} onClick={() => setSelectedVehicle(v)} className={`transition-colors cursor-pointer ${isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'}`}>
                                            <td className="p-5 font-bold text-base text-emerald-400">{v.plate_number}</td>
                                            <td className="p-5">{v.make_model_year}</td>
                                            <td className="p-5">
                                                <StatusBadge status={v.status} />
                                            </td>
                                            <td className="p-5 text-right">
                                                <span className={`inline-block px-3.5 py-1.5 rounded-xl font-bold border ${isDark ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                                    Open &rarr;
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </ResponsiveTable>
                            </div>

                            {/* Mobile card list — tap the card to open the vehicle */}
                            <div className="md:hidden space-y-3">
                                {vehicles.map((v) => (
                                    <div key={v.id} onClick={() => setSelectedVehicle(v)} className={`border rounded-2xl p-5 flex flex-col gap-3 cursor-pointer active:scale-[0.99] transition-transform ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-base font-bold text-emerald-400">{v.plate_number}</span>
                                            <StatusBadge status={v.status} />
                                        </div>
                                        <p className={`text-sm font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{v.make_model_year}</p>
                                        <span className={`text-xs font-extrabold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>Capture Evidence →</span>
                                    </div>
                                ))}
                            </div>
                            </>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}
