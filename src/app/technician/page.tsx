"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { addWatermarkToFile } from '@/utils/watermark'
import { useTheme } from '@/lib/theme'
import Toast from '@/components/ui/Toast'
import ConfirmModal from '@/components/ui/ConfirmModal'
import PreviewModal from '@/components/ui/PreviewModal'

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
type PreviewState = { url: string; title: string } | null

const PHOTO_CATEGORIES = [
    { key: 'front', label: 'Front View' },
    { key: 'back', label: 'Back View' },
    { key: 'left', label: 'Left Side' },
    { key: 'right', label: 'Right Side' },
    { key: 'windshield', label: 'Front Windshield' },
    { key: 'meter_gauge', label: 'Meter Gauge' },
    { key: 'engine_bay', label: 'Engine Bay' },
    { key: 'chassis_number', label: 'Chassis Number (VIN)' },
]

export default function TechnicianPortal() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState('technician')

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
    const [oldPassword, setOldPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmNewPassword, setConfirmNewPassword] = useState('')
    const [showOldPassword, setShowOldPassword] = useState(false)
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)

    const supabase = createClient()

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
                    .select('role, full_name, username')
                    .eq('id', user.id)
                    .single()

                if (!userData || (userData.role !== 'technician' && userData.role !== 'admin')) {
                    showToast('Access Denied: Technician / Admin only.', 'error')
                    setTimeout(() => { window.location.href = '/' }, 1500)
                    return
                }

                setUserRole(userData.role)
                setSettingsFullName(userData.full_name || '')
                setSettingsUsername(userData.username || '')

                const { data: list, error: fetchErr } = await supabase
                    .from('vehicles')
                    .select('*')
                    .in('status', ['pending_before_photos', 'in_repair', 'pending_after_photos', 'completed'])
                    .eq('is_deleted', false)
                    .order('created_at', { ascending: false })

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

    async function handleUpdateSettings(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUserId) return

        try {
            await supabase.from('users').update({ full_name: settingsFullName }).eq('id', currentUserId)

            if (newPassword.trim()) {
                if (!oldPassword.trim()) {
                    showToast('Please enter your current password.', 'error')
                    return
                }
                if (newPassword !== confirmNewPassword) {
                    showToast('New passwords do not match.', 'error')
                    return
                }

                const { error: signInErr } = await supabase.auth.signInWithPassword({
                    email: currentUserEmail,
                    password: oldPassword.trim(),
                })

                if (signInErr) {
                    showToast('Incorrect old password.', 'error')
                    return
                }

                const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword.trim() })
                if (updateErr) throw updateErr

                setOldPassword('')
                setNewPassword('')
                setConfirmNewPassword('')
            }

            showToast('Settings & security updated successfully!', 'success')
            setShowSettingsModal(false)
        } catch (err: any) {
            showToast(err.message || 'Failed to update settings.', 'error')
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
            const uniqueId = crypto.randomUUID().slice(0, 8)
            const path = `${selectedVehicle.id}/${mediaType}/${categoryKey}_${Date.now()}_${uniqueId}.${fileExt}`

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

    const beforeCount = mediaItems.filter(m => m.media_type === 'photo_before').length
    const afterCount = mediaItems.filter(m => m.media_type === 'photo_after').length
    const additionalPhotos = mediaItems.filter(m => m.media_type === 'photo_additional')
    const allBeforeCaptured = PHOTO_CATEGORIES.every(c => mediaItems.some(m => m.media_type === 'photo_before' && m.category === c.key))
    const allAfterCaptured = PHOTO_CATEGORIES.every(c => mediaItems.some(m => m.media_type === 'photo_after' && m.category === c.key))

    function handleStartRepair() {
        if (!selectedVehicle) return
        if (!allBeforeCaptured) {
            showToast(`Cannot start repair — ${8 - beforeCount} 'Before' photo(s) still missing. All 8 angles are required.`, 'error')
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
            showToast(`Cannot mark completed — ${8 - afterCount} 'After' photo(s) still missing. All 8 angles are required.`, 'error')
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
    const cardClass = isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900 shadow-xl'
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
            <PreviewModal preview={previewMedia} onClose={() => setPreviewMedia(null)} onDownload={handleDownload} isDark={isDark} />

            {/* Settings Modal */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
                    <div className={`border rounded-3xl shadow-2xl max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto ${isDark ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'}`}>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>User Account Settings</h3>
                                <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Manage appearance and security credentials.</p>
                            </div>
                            <button onClick={() => setShowSettingsModal(false)} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900'}`}>&times;</button>
                        </div>

                        <form onSubmit={handleUpdateSettings} className="space-y-5">
                            <div className={`p-4 rounded-2xl border ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50'}`}>
                                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Interface Theme Mode</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button type="button" onClick={() => setTheme('light')} className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'light' ? 'bg-blue-600 text-white border-blue-500 shadow-md' : isDark ? 'bg-slate-900 text-slate-400 border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>☀️ Day Mode</button>
                                    <button type="button" onClick={() => setTheme('dark')} className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'dark' ? 'bg-blue-600 text-white border-blue-500 shadow-md' : isDark ? 'bg-slate-900 text-slate-400 border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>🌙 Night Mode</button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Email (Locked)</label>
                                    <input type="text" disabled value={currentUserEmail} className={`w-full border rounded-xl p-3 text-xs font-medium cursor-not-allowed ${isDark ? 'border-slate-800 bg-slate-950 text-slate-500' : 'border-slate-200 bg-slate-100 text-slate-500'}`} />
                                </div>
                                <div>
                                    <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Username (Locked)</label>
                                    <input type="text" disabled value={settingsUsername} className={`w-full border rounded-xl p-3 text-xs font-medium cursor-not-allowed ${isDark ? 'border-slate-800 bg-slate-950 text-slate-500' : 'border-slate-200 bg-slate-100 text-slate-500'}`} />
                                </div>
                            </div>

                            <div>
                                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Full Name *</label>
                                <input type="text" required value={settingsFullName} onChange={(e) => setSettingsFullName(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
                            </div>

                            <div className={`pt-4 border-t space-y-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Change Password (Optional)</h4>

                                <div>
                                    <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Current Password</label>
                                    <div className="relative">
                                        <input type={showOldPassword ? 'text' : 'password'} placeholder="••••••••" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
                                        <button type="button" onClick={() => setShowOldPassword(!showOldPassword)} className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer ${isDark ? 'text-slate-400 hover:text-blue-500' : 'text-slate-500 hover:text-blue-600'}`}>{showOldPassword ? '🙈' : '👁️'}</button>
                                    </div>
                                </div>

                                <div>
                                    <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>New Password</label>
                                    <div className="relative">
                                        <input type={showNewPassword ? 'text' : 'password'} placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
                                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer ${isDark ? 'text-slate-400 hover:text-blue-500' : 'text-slate-500 hover:text-blue-600'}`}>{showNewPassword ? '🙈' : '👁️'}</button>
                                    </div>
                                </div>

                                <div>
                                    <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Confirm New Password</label>
                                    <div className="relative">
                                        <input type={showConfirmPassword ? 'text' : 'password'} placeholder="••••••••" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'border-slate-800 bg-slate-950 text-white' : 'border-slate-200 bg-slate-50 text-slate-800'}`} />
                                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer ${isDark ? 'text-slate-400 hover:text-blue-500' : 'text-slate-500 hover:text-blue-600'}`}>{showConfirmPassword ? '🙈' : '👁️'}</button>
                                    </div>
                                </div>
                            </div>

                            <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <button type="button" onClick={() => setShowSettingsModal(false)} className={`px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>Cancel</button>
                                <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
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
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black">🔧</div>
                        <div>
                            <h1 className="text-base font-extrabold tracking-tight">Technician Portal</h1>
                            <p className="text-[11px] text-slate-400">Workshop Photo & Inspection Hub</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2.5">
                        <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={`p-2 rounded-xl text-xs font-bold border cursor-pointer ${isDark ? 'border-slate-700 bg-slate-800 text-amber-300' : 'border-slate-200 bg-slate-100 text-amber-600'}`}>
                            {isDark ? '☀️' : '🌙'}
                        </button>
                        {userRole === 'admin' && (
                            <Link href="/admin" className="font-bold px-3.5 py-2 rounded-xl text-xs border border-purple-800 bg-purple-950 text-purple-300">🛡️ Admin Hub</Link>
                        )}
                        <Link href="/" className={`font-semibold px-3.5 py-2 rounded-xl text-xs border ${isDark ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>📋 Front Desk</Link>
                        <button onClick={() => setShowSettingsModal(true)} className={`font-semibold px-3.5 py-2 rounded-xl text-xs border cursor-pointer ${isDark ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>⚙️ Settings</button>
                        <button onClick={requestSignOut} className="font-bold px-3.5 py-2 rounded-xl text-xs border border-rose-900 bg-rose-950 text-rose-300 cursor-pointer">Sign Out</button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {selectedVehicle ? (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <button onClick={() => setSelectedVehicle(null)} className={`text-xs font-bold px-3.5 py-2 rounded-xl border cursor-pointer ${isDark ? 'border-slate-800 bg-slate-950 text-emerald-400' : 'border-slate-200 bg-white text-emerald-600'}`}>
                                &larr; Back to Workshop Queue
                            </button>
                        </div>

                        <div className={`border rounded-3xl p-8 mb-8 shadow-2xl ${cardClass}`}>
                            <div className={`flex justify-between items-center pb-6 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <div>
                                    <h2 className={`text-3xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedVehicle.plate_number}</h2>
                                    <p className={`mt-1 font-semibold text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{selectedVehicle.make_model_year}</p>
                                    <p className={`text-xs font-mono mt-2 inline-block px-3 py-1 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                                        VIN: <span className={isDark ? 'text-white' : 'text-slate-900'}>{selectedVehicle.chassis_number}</span>
                                    </p>
                                </div>
                                <span className="px-4 py-2 rounded-xl text-xs font-extrabold bg-amber-950 text-amber-300 border border-amber-800 capitalize">
                                    {selectedVehicle.status.replace(/_/g, ' ')}
                                </span>
                            </div>

                            {/* Photo completeness banner */}
                            {selectedVehicle.status === 'pending_before_photos' && !allBeforeCaptured && (
                                <div className={`mt-6 px-5 py-3.5 rounded-2xl border flex items-center gap-3 text-xs font-bold ${isDark ? 'bg-amber-950/60 border-amber-800/70 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                                    <span>⚠️</span>
                                    <span>Incomplete: {beforeCount}/8 ‘Before’ photos captured. All 8 angles required.</span>
                                </div>
                            )}
                            {selectedVehicle.status === 'pending_after_photos' && !allAfterCaptured && (
                                <div className={`mt-6 px-5 py-3.5 rounded-2xl border flex items-center gap-3 text-xs font-bold ${isDark ? 'bg-amber-950/60 border-amber-800/70 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-800'}`}>
                                    <span>⚠️</span>
                                    <span>Incomplete: {afterCount}/8 ‘After’ photos captured. All 8 angles required.</span>
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
                            <div className="pt-8 space-y-6">
                                <div className="flex items-center justify-between">
                                    <h3 className={`text-sm font-extrabold tracking-wider uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>Workshop Inspection Evidence (8 Angles)</h3>
                                    <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${isDark ? 'bg-slate-900 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-600'}`}>
                                        Before {beforeCount}/8 · After {afterCount}/8
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {PHOTO_CATEGORIES.map((cat) => {
                                        const before = mediaItems.find(m => m.media_type === 'photo_before' && m.category === cat.key)
                                        const after = mediaItems.find(m => m.media_type === 'photo_after' && m.category === cat.key)

                                        return (
                                            <div key={cat.key} className={`border rounded-2xl p-5 ${innerCard}`}>
                                                <p className={`text-xs font-extrabold uppercase mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>{cat.label}</p>

                                                <div className="grid grid-cols-2 gap-4">
                                                    {/* Before Photo */}
                                                    <div className={`border rounded-xl p-3 flex flex-col justify-between ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
                                                        <div>
                                                            <p className="text-[10px] font-bold uppercase text-amber-400 mb-1">Before Repair</p>
                                                            <p className={`text-[11px] mb-3 font-semibold ${before ? 'text-emerald-400' : 'text-slate-500'}`}>{before ? '✓ Captured' : 'Pending'}</p>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {before && (
                                                                <>
                                                                    <button onClick={() => setPreviewMedia({ url: before.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (Before)` })} className={`w-full py-2 rounded-lg text-xs font-bold border cursor-pointer ${isDark ? 'bg-slate-900 text-emerald-400 border-slate-700' : 'bg-white text-emerald-600 border-slate-200'}`}>
                                                                        View Photo
                                                                    </button>
                                                                    <button onClick={() => handleRemovePhoto(before)} className={`w-full py-2 rounded-lg text-xs font-bold border cursor-pointer ${isDark ? 'bg-rose-950 text-rose-300 border-rose-800' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                                                                        Remove
                                                                    </button>
                                                                </>
                                                            )}
                                                            <label htmlFor={`upload-before-${cat.key}`} className="w-full block text-center py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow">
                                                                {before ? 'Retake' : 'Upload'}
                                                            </label>
                                                            <input id={`upload-before-${cat.key}`} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoSelect(e, cat.key, 'photo_before')} />
                                                        </div>
                                                    </div>

                                                    {/* After Photo */}
                                                    <div className={`border rounded-xl p-3 flex flex-col justify-between ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
                                                        <div>
                                                            <p className="text-[10px] font-bold uppercase text-blue-400 mb-1">After Repair</p>
                                                            <p className={`text-[11px] mb-3 font-semibold ${after ? 'text-emerald-400' : 'text-slate-500'}`}>{after ? '✓ Captured' : 'Pending'}</p>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {after && (
                                                                <>
                                                                    <button onClick={() => setPreviewMedia({ url: after.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (After)` })} className={`w-full py-2 rounded-lg text-xs font-bold border cursor-pointer ${isDark ? 'bg-slate-900 text-blue-400 border-slate-700' : 'bg-white text-blue-600 border-slate-200'}`}>
                                                                        View Photo
                                                                    </button>
                                                                    <button onClick={() => handleRemovePhoto(after)} className={`w-full py-2 rounded-lg text-xs font-bold border cursor-pointer ${isDark ? 'bg-rose-950 text-rose-300 border-rose-800' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                                                                        Remove
                                                                    </button>
                                                                </>
                                                            )}
                                                            <label htmlFor={`upload-after-${cat.key}`} className="w-full block text-center py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow">
                                                                {after ? 'Retake' : 'Upload'}
                                                            </label>
                                                            <input id={`upload-after-${cat.key}`} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoSelect(e, cat.key, 'photo_after')} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* 3. ADDITIONAL PHOTOS & EVIDENCE */}
                            <div className="pt-8 space-y-4">
                                <div className={`border rounded-2xl p-5 ${innerCard}`}>
                                    <div className="flex justify-between items-center mb-4">
                                        <div>
                                            <h3 className={`font-bold text-sm uppercase tracking-wider ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>3. Additional Evidence Photos</h3>
                                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Upload close-up damage details, part codes, or extra inspection angles.</p>
                                        </div>
                                        <div>
                                            <label
                                                htmlFor="tech-input-additional"
                                                className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-1.5 rounded-xl font-bold cursor-pointer shadow inline-block transition-colors"
                                            >
                                                {uploadingKey ? 'Uploading…' : '+ Add Photo'}
                                            </label>
                                            <input
                                                id="tech-input-additional"
                                                type="file"
                                                accept="image/*"
                                                capture="environment"
                                                className="hidden"
                                                onChange={handleAdditionalPhotoSelect}
                                            />
                                        </div>
                                    </div>

                                    {additionalPhotos.length === 0 ? (
                                        <div className={`border border-dashed rounded-xl p-4 text-center text-xs font-medium ${isDark ? 'bg-slate-950/50 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-300 text-slate-500'}`}>
                                            No additional evidence photos uploaded yet. Tap “+ Add Photo” to snap optional extra angles.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {additionalPhotos.map((item) => {
                                                const displayTitle = item.category.replace(/^extra_/, '').replace(/_[0-9a-f]{8}$/, '').replace(/_/g, ' ')
                                                return (
                                                    <div key={item.id} className={`border rounded-xl p-3.5 flex items-center justify-between ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'}`}>
                                                        <div>
                                                            <p className={`text-xs font-bold capitalize ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>{displayTitle}</p>
                                                            <p className={`text-[10px] font-semibold mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>✓ Extra Evidence</p>
                                                        </div>
                                                        <div className="flex gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setPreviewMedia({ url: item.file_url, title: `${selectedVehicle?.plate_number} - ${displayTitle}` })}
                                                                className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold border cursor-pointer ${isDark ? 'bg-slate-800 text-purple-300 border-slate-700' : 'bg-slate-100 text-purple-700 border-slate-200'}`}
                                                            >
                                                                View
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemovePhoto(item)}
                                                                className={`text-[11px] px-2.5 py-1.5 rounded-lg font-bold border cursor-pointer ${isDark ? 'bg-rose-950 text-rose-400 border-rose-900' : 'bg-rose-50 text-rose-600 border-rose-200'}`}
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black tracking-tight">Active Workshop Vehicles</h2>
                            <span className={`text-xs font-bold px-3.5 py-1.5 rounded-full border ${isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-white text-slate-600'}`}>Queue: {vehicles.length} Vehicles</span>
                        </div>

                        {loading ? (
                            <div className="p-16 text-center text-slate-500 font-medium">Loading workshop queue...</div>
                        ) : vehicles.length === 0 ? (
                            <div className="p-16 text-center text-slate-500 font-medium">No vehicles currently assigned to the workshop queue.</div>
                        ) : (
                            <div className={`border rounded-3xl shadow-xl overflow-hidden ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className={`text-[11px] uppercase font-bold border-b ${isDark ? 'text-slate-400 border-slate-800 bg-slate-900/80' : 'text-slate-500 border-slate-200 bg-slate-100'}`}>
                                            <th className="p-4.5">Plate Number</th>
                                            <th className="p-4.5">Make / Model / Year</th>
                                            <th className="p-4.5">Current Status</th>
                                            <th className="p-4.5 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className={`divide-y text-xs font-medium ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-200 text-slate-700'}`}>
                                        {vehicles.map((v) => (
                                            <tr key={v.id} className={`transition-colors ${isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'}`}>
                                                <td className="p-4.5 font-bold text-sm text-emerald-400">{v.plate_number}</td>
                                                <td className="p-4.5">{v.make_model_year}</td>
                                                <td className="p-4.5">
                                                    <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-800 capitalize">
                                                        {v.status.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                                <td className="p-4.5 text-right">
                                                    <button onClick={() => setSelectedVehicle(v)} className="px-3.5 py-1.5 rounded-xl font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 hover:bg-emerald-900 cursor-pointer">
                                                        Capture Evidence &rarr;
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}