"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { addWatermarkToFile } from '@/utils/watermark'
import { useTheme } from '@/lib/theme'
import { PHOTO_CATEGORIES } from '@/lib/photoCategories'
import { uniqueFileSuffix } from '@/lib/uploadUtils'
import { getPhotoStageRules } from '@/lib/photoStages'
import Toast from '@/components/ui/Toast'
import ConfirmModal from '@/components/ui/ConfirmModal'
import PreviewModal from '@/components/ui/PreviewModal'
import PhotoThumb from '@/components/ui/PhotoThumb'
import AccountSettingsModal, { type AccountSettingsPayload } from '@/components/ui/AccountSettingsModal'
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

export default function TechnicianModule() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
    const [loading, setLoading] = useState(true)

    // Modals & UI State
    const [uploadingKey, setUploadingKey] = useState<string | null>(null)
    const [toast, setToast] = useState<ToastState>(null)
    const [confirmModal, setConfirmModal] = useState<ConfirmState>(null)
    const [previewMedia, setPreviewMedia] = useState<PreviewState>(null)
    const { theme, setTheme, isDark } = useTheme()
    const [showSettingsModal, setShowSettingsModal] = useState(false)

    // Additional Evidence Photos State
    const [showLabelModal, setShowLabelModal] = useState(false)
    const [pendingAdditionalFile, setPendingAdditionalFile] = useState<File | null>(null)
    const [customPhotoLabel, setCustomPhotoLabel] = useState('')

    // User Settings State
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserEmail, setCurrentUserEmail] = useState('')
    const [settingsFullName, setSettingsFullName] = useState('')
    const [settingsUsername, setSettingsUsername] = useState('')

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
                setCurrentUserEmail(user.email || '')

                const { data: userData } = await supabase
                    .from('users')
                    .select('role, full_name, username, company_id')
                    .eq('id', user.id)
                    .single()

                if (!userData || (userData.role !== 'technician' && userData.role !== 'admin' && userData.role !== 'manager')) {
                    showToast('Access Denied: Technician / Manager / Admin only.', 'error')
                    setTimeout(() => { window.location.href = '/' }, 1500)
                    return
                }

                setSettingsFullName(userData.full_name || '')
                setSettingsUsername(userData.username || '')

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
    }, [selectedVehicle?.id])

    async function handleSettingsSave(payload: AccountSettingsPayload): Promise<{ ok: boolean; error?: string }> {
        if (!currentUserId) return { ok: false, error: 'Not authenticated.' }
        try {
            if (!payload.username.trim()) return { ok: false, error: 'Username cannot be empty.' }

            const { data: existingUsername } = await supabase
                .from('users')
                .select('id')
                .eq('username', payload.username)
                .neq('id', currentUserId)
                .maybeSingle()

            if (existingUsername) return { ok: false, error: 'That username is already taken.' }

            await supabase.from('users').update({ full_name: payload.fullName, username: payload.username }).eq('id', currentUserId)

            if (payload.newPassword.trim()) {
                if (!payload.oldPassword.trim()) {
                    return { ok: false, error: 'Please enter your current password.' }
                }

                const { error: signInErr } = await supabase.auth.signInWithPassword({
                    email: currentUserEmail,
                    password: payload.oldPassword.trim(),
                })

                if (signInErr) return { ok: false, error: 'Incorrect old password.' }

                const { error: updateErr } = await supabase.auth.updateUser({ password: payload.newPassword.trim() })
                if (updateErr) return { ok: false, error: updateErr.message }
            }

            setSettingsFullName(payload.fullName)
            setSettingsUsername(payload.username)
            showToast('Settings & security updated successfully!', 'success')
            return { ok: true }
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : 'Failed to update settings.' }
        }
    }

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

    function requestSignOut() {
        setConfirmModal({
            title: 'Confirm Sign Out',
            message: 'Are you sure you want to sign out?',
            confirmText: 'Sign Out',
            confirmVariant: 'danger',
            onConfirm: async () => {
                setConfirmModal(null)
                await supabase.auth.signOut()
                window.location.href = '/login'
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

    const bgClass = isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'
    const innerCard = isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'

    return (
        <div className={`min-h-screen transition-colors duration-200 ${bgClass}`}>
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

            {/* Settings Modal */}
            {showSettingsModal && (
                <AccountSettingsModal
                    isDark={isDark}
                    theme={theme}
                    setTheme={setTheme}
                    title="User Account Settings"
                    subtitle="Manage appearance and security credentials."
                    email={currentUserEmail}
                    username={settingsUsername}
                    fullName={settingsFullName}
                    accent="blue"
                    onClose={() => setShowSettingsModal(false)}
                    onSave={handleSettingsSave}
                />
            )}

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

            {/* Header */}
            <header className={`border-b sticky top-0 z-40 backdrop-blur-md ${isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-slate-200'}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black">🔧</div>
                        <div>
                            <h1 className="text-base font-extrabold tracking-tight">Technician Portal</h1>
                            <p className="text-[11px] text-slate-400 hidden sm:block">Workshop Photo & Inspection Hub</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={`p-2 rounded-xl text-xs font-bold border cursor-pointer ${isDark ? 'border-slate-700 bg-slate-800 text-amber-300' : 'border-slate-200 bg-slate-100 text-amber-600'}`}>
                            {isDark ? '☀️' : '🌙'}
                        </button>
                        <button onClick={() => setShowSettingsModal(true)} className={`font-semibold px-3.5 py-2 rounded-xl text-xs border cursor-pointer ${isDark ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>⚙️ Settings</button>
                        <button onClick={requestSignOut} className="font-bold px-3.5 py-2 rounded-xl text-xs border border-rose-900 bg-rose-950 text-rose-300 cursor-pointer">Sign Out</button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                {selectedVehicle ? (
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

                            {/* 8 Mandatory Before/After Angles */}
                            {(showBeforeSection || showAfterSection) && (
                                <div className="pt-8 space-y-6">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <h3 className={`text-sm font-extrabold tracking-wider uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>Workshop Inspection Evidence (8 Angles)</h3>
                                        <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${isDark ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                                            {showBeforeSection && `Before ${beforeCapturedAngles}/${totalAngles}`}{showBeforeSection && showAfterSection && ' · '}{showAfterSection && `After ${afterCapturedAngles}/${totalAngles}`}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        {PHOTO_CATEGORIES.map((cat) => {
                                            const before = mediaItems.find(m => m.media_type === 'photo_before' && m.category === cat.key)
                                            const after = mediaItems.find(m => m.media_type === 'photo_after' && m.category === cat.key)

                                            return (
                                                <div key={cat.key} className={`border rounded-2xl p-4 sm:p-5 ${innerCard}`}>
                                                    <p className={`text-xs font-extrabold uppercase mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>{cat.label}</p>

                                                    <div className={`grid gap-4 ${showBeforeSection && showAfterSection ? 'grid-cols-1 min-[420px]:grid-cols-2' : 'grid-cols-1'}`}>
                                                        {showBeforeSection && (
                                                            <PhotoEvidenceCell
                                                                isDark={isDark}
                                                                phase="before"
                                                                isCaptured={!!before}
                                                                photoUrl={before?.file_url}
                                                                readonly={beforeMode === 'readonly'}
                                                                onView={() => openPhaseGallery('photo_before', before!.file_url)}
                                                                onRemove={() => handleRemovePhoto(before!)}
                                                                onFileChange={(e) => handlePhotoSelect(e, cat.key, 'photo_before')}
                                                                inputId={`upload-before-${cat.key}`}
                                                            />
                                                        )}
                                                        {showAfterSection && (
                                                            <PhotoEvidenceCell
                                                                isDark={isDark}
                                                                phase="after"
                                                                isCaptured={!!after}
                                                                photoUrl={after?.file_url}
                                                                readonly={afterMode === 'readonly'}
                                                                onView={() => openPhaseGallery('photo_after', after!.file_url)}
                                                                onRemove={() => handleRemovePhoto(after!)}
                                                                onFileChange={(e) => handlePhotoSelect(e, cat.key, 'photo_after')}
                                                                inputId={`upload-after-${cat.key}`}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 3. ADDITIONAL PHOTOS & EVIDENCE */}
                            {additionalMode !== 'hidden' && (
                                <div className="pt-8 space-y-4">
                                    <div className={`border rounded-2xl p-4 sm:p-5 ${innerCard}`}>
                                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                                            <div>
                                                <h3 className={`font-bold text-sm uppercase tracking-wider ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>3. Additional Evidence Photos</h3>
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
                                                                className="h-24"
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
                                        <tr key={v.id} className={`transition-colors ${isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'}`}>
                                            <td className="p-4 font-bold text-sm text-emerald-400">{v.plate_number}</td>
                                            <td className="p-4">{v.make_model_year}</td>
                                            <td className="p-4">
                                                <StatusBadge status={v.status} />
                                            </td>
                                            <td className="p-4 text-right">
                                                <button onClick={() => setSelectedVehicle(v)} className="px-3.5 py-1.5 rounded-xl font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 cursor-pointer">
                                                    Capture Evidence &rarr;
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </ResponsiveTable>
                            </div>

                            {/* Mobile card list */}
                            <div className="md:hidden space-y-3">
                                {vehicles.map((v) => (
                                    <div key={v.id} className={`border rounded-2xl p-4 flex flex-col gap-3 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-sm font-bold text-emerald-400">{v.plate_number}</span>
                                            <StatusBadge status={v.status} />
                                        </div>
                                        <p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{v.make_model_year}</p>
                                        <button onClick={() => setSelectedVehicle(v)} className="w-full px-3.5 py-2.5 rounded-xl font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 cursor-pointer text-xs">
                                            Capture Evidence &rarr;
                                        </button>
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
