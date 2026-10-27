"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { addWatermarkToFile } from '@/utils/watermark'

type Vehicle = {
    id: string
    plate_number: string
    chassis_number: string
    make_model_year: string
    insurance_panel: string
    status: string
    intake_cost: number
    market_value: number
    repair_cost: number
}

type MediaItem = {
    id: string
    category: string
    file_url: string
    media_type: string
    vehicle_id: string
}

type Toast = {
    message: string
    type: 'success' | 'error'
}

type ConfirmModal = {
    title: string
    message: string
    confirmText?: string
    confirmVariant?: 'primary' | 'danger' | 'success'
    onConfirm: () => void
}

type PreviewMedia = {
    url: string
    title: string
}

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
    const [uploadingCategory, setUploadingCategory] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState<Toast | null>(null)
    const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null)
    const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null)

    // Theme State ('dark' | 'light')
    const [theme, setTheme] = useState<'dark' | 'light'>('dark')

    // Custom Label Dialog State for Additional Photos
    const [showLabelModal, setShowLabelModal] = useState(false)
    const [pendingAdditionalFile, setPendingAdditionalFile] = useState<File | null>(null)
    const [customPhotoLabel, setCustomPhotoLabel] = useState('')

    // Settings Modal State
    const [showSettingsModal, setShowSettingsModal] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserEmail, setCurrentUserEmail] = useState<string>('')
    const [settingsFullName, setSettingsFullName] = useState('')
    const [settingsUsername, setSettingsUsername] = useState('')

    // Secure Password Change State
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
        async function checkTechnicianAccess() {
            const { data: { user }, error: authError } = await supabase.auth.getUser()
            if (!user || authError) {
                window.location.href = '/login'
                return
            }

            setCurrentUserId(user.id)
            setCurrentUserEmail(user.email || '')

            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('role, full_name, username')
                .eq('id', user.id)
                .single()

            if (userError || !userData || (userData.role !== 'technician' && userData.role !== 'admin')) {
                showToast('Access Denied: Restricted to workshop technicians.', 'error')
                setTimeout(() => { window.location.href = '/login' }, 1500)
                return
            }

            setSettingsFullName(userData.full_name || '')
            setSettingsUsername(userData.username || '')

            fetchActiveVehicles()
        }
        checkTechnicianAccess()
    }, [])

    async function fetchActiveVehicles() {
        setLoading(true)
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .in('status', ['pending_before_photos', 'in_repair', 'pending_after_photos'])
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })

        if (error) showToast(error.message, 'error')
        else setVehicles(data || [])
        setLoading(false)
    }

    async function fetchMedia(vehicleId: string) {
        const { data, error } = await supabase
            .from('vehicle_media')
            .select('*')
            .eq('vehicle_id', vehicleId)

        if (error) showToast(error.message, 'error')
        else setMediaItems(data || [])
    }

    const selectVehicle = (v: Vehicle) => {
        setSelectedVehicle(v)
        fetchMedia(v.id)
    }

    async function handleUpdateSettings(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUserId) return

        try {
            const { error: profileError } = await supabase
                .from('users')
                .update({ full_name: settingsFullName })
                .eq('id', currentUserId)

            if (profileError) throw profileError

            if (newPassword.trim()) {
                if (!oldPassword.trim()) {
                    showToast('Please enter your current (old) password to change passwords.', 'error')
                    return
                }
                if (newPassword !== confirmNewPassword) {
                    showToast('New passwords do not match.', 'error')
                    return
                }

                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: currentUserEmail,
                    password: oldPassword.trim(),
                })

                if (signInError) {
                    showToast('Incorrect old password provided.', 'error')
                    return
                }

                const { error: passwordError } = await supabase.auth.updateUser({
                    password: newPassword.trim(),
                })
                if (passwordError) throw passwordError

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

    async function handleDownload(url: string, title: string) {
        try {
            showToast('Preparing photo download...', 'success')
            const res = await fetch(url)
            const blob = await res.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(blobUrl)
        } catch (err) {
            window.open(url, '_blank')
        }
    }

    function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>, category: string, isBefore: boolean) {
        const file = e.target.files?.[0]
        if (!file || !selectedVehicle) return

        if (file.size > 10 * 1024 * 1024) {
            showToast('Photo is too large. Maximum size is 10MB.', 'error')
            e.target.value = ''
            return
        }

        const catObj = PHOTO_CATEGORIES.find(c => c.key === category)
        const angleLabel = catObj ? catObj.label : category
        const phaseLabel = isBefore ? 'Before Repair' : 'After Repair'

        setConfirmModal({
            title: 'Confirm Photo Upload',
            message: `Upload and watermark photo for "${angleLabel}" (${phaseLabel})?`,
            confirmText: 'Upload Photo',
            confirmVariant: 'primary',
            onConfirm: () => executePhotoUpload(file, category, isBefore),
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
        const categoryKey = `extra_${labelClean.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`

        setConfirmModal({
            title: 'Upload Additional Photo',
            message: `Upload and watermark additional photo labeled "${labelClean}"?`,
            confirmText: 'Upload Additional Photo',
            confirmVariant: 'primary',
            onConfirm: () => executePhotoUpload(pendingAdditionalFile, categoryKey, true, 'photo_additional', labelClean),
        })
        setPendingAdditionalFile(null)
    }

    async function executePhotoUpload(file: File, category: string, isBefore: boolean, customMediaType?: string, displayLabel?: string) {
        setConfirmModal(null)
        if (!selectedVehicle) return

        const mediaType = customMediaType || (isBefore ? 'photo_before' : 'photo_after')
        const stateKey = mediaType === 'photo_additional' ? `additional-${category}` : (isBefore ? category : `after-${category}`)
        setUploadingCategory(stateKey)
        showToast(`Watermarking & uploading photo...`, 'success')

        try {
            const phaseLabel = mediaType === 'photo_additional' ? (displayLabel || 'EXTRA EVIDENCE') : (isBefore ? 'BEFORE REPAIR' : 'AFTER REPAIR')
            const watermarkLabel = `WORKSHOP EVIDENCE • ${selectedVehicle.plate_number} • ${category.toUpperCase()} (${phaseLabel}) • ${new Date().toLocaleDateString()}`

            const fileToUpload = await addWatermarkToFile(file, watermarkLabel)

            if (mediaType !== 'photo_additional') {
                const existingPhoto = mediaItems.find(m => m.media_type === mediaType && m.category === category)
                if (existingPhoto) {
                    await supabase.from('vehicle_media').delete().eq('id', existingPhoto.id)
                }
            }

            const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'jpg'
            const uniqueId = Math.random().toString(36).substring(2, 9)
            const fileName = `${selectedVehicle.id}/${mediaType}/${category}_${Date.now()}_${uniqueId}.${fileExt}`

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('vehicle-files')
                .upload(fileName, fileToUpload, { cacheControl: '3600', upsert: true })

            if (uploadError) throw uploadError

            const { data: publicURLData } = supabase.storage
                .from('vehicle-files')
                .getPublicUrl(uploadData.path)

            const { error: dbError } = await supabase.from('vehicle_media').insert([
                {
                    vehicle_id: selectedVehicle.id,
                    media_type: mediaType,
                    category: category,
                    file_url: publicURLData.publicUrl,
                },
            ])

            if (dbError) throw dbError

            showToast('Photo watermarked and secured!', 'success')
            fetchMedia(selectedVehicle.id)
        } catch (err: any) {
            console.error('Photo Upload Error:', err)
            showToast(err.message || 'Failed to upload photo.', 'error')
        } finally {
            setUploadingCategory(null)
        }
    }

    function requestDeletePhoto(category: string, mediaType: string) {
        const isBefore = mediaType === 'photo_before'
        const catObj = PHOTO_CATEGORIES.find(c => c.key === category)
        const angleLabel = catObj ? catObj.label : category.replace(/^extra_/, '').replace(/_[0-9]+$/, '').replace(/_/g, ' ')
        const phaseLabel = mediaType === 'photo_additional' ? 'Additional' : (isBefore ? 'Before' : 'After')

        setConfirmModal({
            title: 'Confirm Photo Removal',
            message: `Are you sure you want to remove the ${phaseLabel} photo for "${angleLabel}"?`,
            confirmText: 'Remove Photo',
            confirmVariant: 'danger',
            onConfirm: () => executeDeletePhoto(category, mediaType),
        })
    }

    async function executeDeletePhoto(category: string, mediaType: string) {
        setConfirmModal(null)
        if (!selectedVehicle) return

        const photosToDelete = mediaItems.filter(
            (m) => m.vehicle_id === selectedVehicle.id && m.category === category && m.media_type === mediaType
        )

        setMediaItems((currentItems) =>
            currentItems.filter((item) => !(item.category === category && item.media_type === mediaType))
        )

        const { error: dbError } = await supabase
            .from('vehicle_media')
            .delete()
            .eq('vehicle_id', selectedVehicle.id)
            .eq('category', category)
            .eq('media_type', mediaType)

        if (dbError) {
            showToast('Error removing photo: ' + dbError.message, 'error')
            if (selectedVehicle) fetchMedia(selectedVehicle.id)
            return
        }

        for (const doc of photosToDelete) {
            if (doc.file_url) {
                try {
                    const pathParts = doc.file_url.split('/vehicle-files/')
                    if (pathParts.length > 1) {
                        const relativePath = decodeURIComponent(pathParts[1])
                        await supabase.storage.from('vehicle-files').remove([relativePath])
                    }
                } catch (err) {
                    console.error('Storage photo deletion error:', err)
                }
            }
        }

        showToast('Photo removed successfully.', 'success')
    }

    function requestStatusTransition(newStatus: string) {
        if (!selectedVehicle) return

        if (newStatus === 'in_repair') {
            const beforePhotos = mediaItems.filter(m => m.media_type === 'photo_before')
            if (beforePhotos.length < 8) {
                showToast(`Incomplete: ${beforePhotos.length}/8 'Before' photos captured. All 8 angles required.`, 'error')
                return
            }
        }

        if (newStatus === 'road_ready') {
            const afterPhotos = mediaItems.filter(m => m.media_type === 'photo_after')
            if (afterPhotos.length < 8) {
                showToast(`Incomplete: ${afterPhotos.length}/8 'After' photos captured. All 8 angles required.`, 'error')
                return
            }
        }

        const formattedStatus = newStatus.replace(/_/g, ' ').toUpperCase()

        setConfirmModal({
            title: 'Confirm Status Change',
            message: `Are you sure you want to update ${selectedVehicle.plate_number}'s status to "${formattedStatus}"?`,
            confirmText: 'Update Status',
            confirmVariant: 'success',
            onConfirm: () => executeStatusTransition(newStatus),
        })
    }

    async function executeStatusTransition(newStatus: string) {
        setConfirmModal(null)
        if (!selectedVehicle) return

        const { error } = await supabase
            .from('vehicles')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', selectedVehicle.id)

        if (error) {
            showToast('Error updating status: ' + error.message, 'error')
        } else {
            showToast(`Status updated to: ${newStatus.replace(/_/g, ' ').toUpperCase()}`, 'success')
            setSelectedVehicle({ ...selectedVehicle, status: newStatus })
            fetchActiveVehicles()
        }
    }

    function requestLogout() {
        setConfirmModal({
            title: 'Confirm Sign Out',
            message: 'Are you sure you want to sign out of the Technician Portal?',
            confirmText: 'Sign Out',
            confirmVariant: 'danger',
            onConfirm: () => executeLogout(),
        })
    }

    async function executeLogout() {
        setConfirmModal(null)
        await supabase.auth.signOut()
        document.cookie.split(";").forEach((c) => {
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
        });
        window.location.href = '/login'
    }

    const additionalPhotos = mediaItems.filter(m => m.media_type === 'photo_additional')
    const isDark = theme === 'dark'

    return (
        <div className={`min-h-screen pb-16 relative selection:bg-emerald-500 selection:text-white ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            {toast && (
                <div className="fixed top-6 right-6 z-50 animate-bounce">
                    <div className={`px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 border ${toast.type === 'success'
                            ? 'bg-emerald-950 text-emerald-200 border-emerald-700/80 shadow-emerald-950/50'
                            : 'bg-rose-950 text-rose-200 border-rose-700/80 shadow-rose-950/50'
                        }`}>
                        <span>{toast.type === 'success' ? '✨' : '⚠️'}</span>
                        <span>{toast.message}</span>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className={`border rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                        <div className={`w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center text-xl font-bold border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                            {confirmModal.confirmVariant === 'danger' ? '⚠️' : confirmModal.confirmVariant === 'success' ? '✅' : '❓'}
                        </div>
                        <h3 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{confirmModal.title}</h3>
                        <p className={`text-xs mt-2 font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{confirmModal.message}</p>

                        <div className="flex gap-3 mt-6">
                            <button
                                type="button"
                                onClick={() => setConfirmModal(null)}
                                className={`w-1/2 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmModal.onConfirm}
                                className={`w-1/2 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all cursor-pointer ${confirmModal.confirmVariant === 'danger'
                                        ? 'bg-rose-600 hover:bg-rose-500'
                                        : confirmModal.confirmVariant === 'success'
                                            ? 'bg-emerald-600 hover:bg-emerald-500'
                                            : 'bg-blue-600 hover:bg-blue-500'
                                    }`}
                            >
                                {confirmModal.confirmText || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Label Dialog Modal */}
            {showLabelModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className={`border rounded-3xl shadow-2xl max-w-sm w-full p-6 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                        <h3 className={`text-base font-extrabold mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>Label Additional Photo</h3>
                        <p className={`text-xs mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Enter a clear description for this extra evidence photo:</p>
                        <input
                            type="text"
                            value={customPhotoLabel}
                            onChange={(e) => setCustomPhotoLabel(e.target.value)}
                            placeholder="e.g. Scratched Bumper Detail"
                            className={`w-full border rounded-xl p-3 text-xs mb-6 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowLabelModal(false)}
                                className={`w-1/2 py-2.5 rounded-xl text-xs font-bold border cursor-pointer ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmAdditionalPhotoUpload}
                                className="w-1/2 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-md cursor-pointer"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
                    <div className={`border rounded-3xl shadow-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Technician Account Settings</h3>
                                <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Manage appearance, profile, and credentials.</p>
                            </div>
                            <button onClick={() => setShowSettingsModal(false)} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}>&times;</button>
                        </div>

                        <form onSubmit={handleUpdateSettings} className="space-y-4">
                            {/* Theme Preference */}
                            <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Interface Theme Mode</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setTheme('light')}
                                        className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'light' ? 'bg-emerald-600 text-white border-emerald-500 shadow-md' : isDark ? 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        ☀️ Day Mode
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTheme('dark')}
                                        className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'dark' ? 'bg-emerald-600 text-white border-emerald-500 shadow-md' : isDark ? 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        🌙 Night Mode
                                    </button>
                                </div>
                            </div>

                            {/* Read-Only Credentials */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Email (Locked)</label>
                                    <input type="text" disabled value={currentUserEmail} className={`w-full border rounded-xl p-3 text-xs font-medium cursor-not-allowed ${isDark ? 'bg-slate-950 border-slate-800 text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-500'}`} />
                                </div>
                                <div>
                                    <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Username (Locked)</label>
                                    <input type="text" disabled value={settingsUsername} className={`w-full border rounded-xl p-3 text-xs font-medium cursor-not-allowed ${isDark ? 'bg-slate-950 border-slate-800 text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-500'}`} />
                                </div>
                            </div>

                            <div>
                                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Full Name *</label>
                                <input type="text" required value={settingsFullName} onChange={(e) => setSettingsFullName(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                            </div>

                            {/* Password Change Section */}
                            <div className={`pt-4 border-t space-y-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Change Password (Optional)</h4>

                                <div>
                                    <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Current Password</label>
                                    <div className="relative">
                                        <input
                                            type={showOldPassword ? 'text' : 'password'}
                                            placeholder="••••••••"
                                            value={oldPassword}
                                            onChange={(e) => setOldPassword(e.target.value)}
                                            className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                        />
                                        <button type="button" onClick={() => setShowOldPassword(!showOldPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-emerald-500 cursor-pointer">
                                            {showOldPassword ? '🙈 Hide' : '👁️ View'}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>New Password</label>
                                    <div className="relative">
                                        <input
                                            type={showNewPassword ? 'text' : 'password'}
                                            placeholder="••••••••"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                        />
                                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-emerald-500 cursor-pointer">
                                            {showNewPassword ? '🙈 Hide' : '👁️ View'}
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Confirm New Password</label>
                                    <div className="relative">
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            placeholder="••••••••"
                                            value={confirmNewPassword}
                                            onChange={(e) => setConfirmNewPassword(e.target.value)}
                                            className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                        />
                                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-emerald-500 cursor-pointer">
                                            {showConfirmPassword ? '🙈 Hide' : '👁️ View'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <button type="button" onClick={() => setShowSettingsModal(false)} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}>Cancel</button>
                                <button type="submit" className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Media Preview Modal */}
            {previewMedia && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className={`border rounded-3xl shadow-2xl max-w-3xl w-full p-6 flex flex-col max-h-[90vh] ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}>
                        <div className={`flex justify-between items-center pb-4 border-b ${isDark ? 'border-slate-800 text-white' : 'border-slate-200 text-slate-900'}`}>
                            <h3 className="text-base font-extrabold truncate">{previewMedia.title}</h3>
                            <button
                                onClick={() => setPreviewMedia(null)}
                                className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                            >
                                &times;
                            </button>
                        </div>

                        <div className={`py-4 flex-1 overflow-auto flex items-center justify-center rounded-2xl my-4 border p-2 ${isDark ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
                            <img
                                src={previewMedia.url}
                                alt={previewMedia.title}
                                className="max-h-[60vh] w-auto object-contain rounded-xl shadow-md"
                            />
                        </div>

                        <div className={`flex flex-wrap justify-end gap-3 pt-2 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
                            <button
                                onClick={() => handleDownload(previewMedia.url, previewMedia.title)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                            >
                                💾 Save File
                            </button>
                            <a
                                href={previewMedia.url}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                            >
                                ↗️ Open in New Tab
                            </a>
                            <button
                                onClick={() => setPreviewMedia(null)}
                                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className={`border-b sticky top-0 z-20 shadow-lg backdrop-blur-md ${isDark ? 'bg-slate-950/90 border-slate-800 text-white' : 'bg-white/90 border-slate-200 text-slate-900'}`}>
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-black text-base">
                            🛠️
                        </div>
                        <div>
                            <h1 className="text-base font-extrabold tracking-tight">Workshop Technician Portal</h1>
                            <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Floor Inspection & Evidence Management</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={() => setTheme(isDark ? 'light' : 'dark')}
                            className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-amber-600 border-slate-200'}`}
                            title="Toggle Theme"
                        >
                            {isDark ? '☀️ Light' : '🌙 Dark'}
                        </button>
                        <button
                            onClick={() => setShowSettingsModal(true)}
                            className={`font-semibold px-3.5 py-2 rounded-xl text-xs border transition-all cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'}`}
                        >
                            ⚙️ Settings
                        </button>
                        <button
                            onClick={requestLogout}
                            className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow transition-all cursor-pointer"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {!selectedVehicle ? (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Active Workshop Queue</h2>
                                <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Select an assigned vehicle to record inspection photos and update repair progress.</p>
                            </div>
                            <span className={`text-xs font-bold px-3.5 py-1.5 rounded-full border ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-200 text-slate-700 border-slate-300'}`}>
                                Queue Count: {vehicles.length} Vehicles
                            </span>
                        </div>

                        {loading ? (
                            <div className="p-16 text-center text-slate-500 font-medium">Loading workshop queue...</div>
                        ) : vehicles.length === 0 ? (
                            <div className={`p-16 text-center rounded-3xl border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'}`}>
                                No vehicles currently assigned for workshop inspection.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {vehicles.map((v) => (
                                    <div
                                        key={v.id}
                                        onClick={() => selectVehicle(v)}
                                        className={`border rounded-3xl p-6 cursor-pointer transition-all hover:shadow-xl flex flex-col justify-between ${isDark
                                                ? 'bg-slate-950 border-slate-800 hover:border-emerald-500/80'
                                                : 'bg-white border-slate-200 hover:border-emerald-500/80 hover:shadow-md'
                                            }`}
                                    >
                                        <div>
                                            <div className="flex justify-between items-start mb-3">
                                                <h3 className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-blue-950'}`}>{v.plate_number}</h3>
                                                <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                                                    {v.status.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                            <p className={`text-xs font-semibold mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{v.make_model_year}</p>
                                            <p className={`text-[11px] font-mono p-2.5 rounded-xl border mb-6 truncate ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                                VIN: <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{v.chassis_number || 'N/A'}</span>
                                            </p>
                                        </div>

                                        <button
                                            type="button"
                                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                                        >
                                            Inspect & Upload Photos &rarr;
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div>
                        <button
                            onClick={() => setSelectedVehicle(null)}
                            className={`mb-6 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer px-3.5 py-2 rounded-xl border w-fit shadow-xs ${isDark ? 'bg-slate-950 text-emerald-400 hover:text-emerald-300 border-slate-800' : 'bg-white text-emerald-600 hover:text-emerald-700 border-slate-200'}`}
                        >
                            &larr; Back to Workshop Queue
                        </button>

                        {/* Vehicle Header Overview & Status Transition */}
                        <div className={`rounded-3xl border p-8 mb-8 shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-3xl font-black tracking-tight">{selectedVehicle.plate_number}</h2>
                                        <span className="px-3.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                                            {selectedVehicle.status.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    <p className="text-xs font-semibold text-slate-400 mt-1">{selectedVehicle.make_model_year} • VIN: {selectedVehicle.chassis_number}</p>
                                </div>

                                <div className="w-full md:w-auto">
                                    {selectedVehicle.status === 'pending_before_photos' && (
                                        <button
                                            onClick={() => requestStatusTransition('in_repair')}
                                            className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-2xl text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                                        >
                                            ✓ Complete "Before" Photos &rarr; Start Repair
                                        </button>
                                    )}
                                    {selectedVehicle.status === 'in_repair' && (
                                        <button
                                            onClick={() => requestStatusTransition('pending_after_photos')}
                                            className="w-full md:w-auto bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-2xl text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                                        >
                                            🔧 Finish Repair &rarr; Request "After" Photos
                                        </button>
                                    )}
                                    {selectedVehicle.status === 'pending_after_photos' && (
                                        <button
                                            onClick={() => requestStatusTransition('road_ready')}
                                            className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-2xl text-xs shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
                                        >
                                            🏁 Complete "After" Photos &rarr; Mark Road Ready
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Photo Evidence Management Grid */}
                        <div className="space-y-8">
                            {/* 1. MANDATORY BEFORE PHOTOS */}
                            <div className={`rounded-3xl border p-8 shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800/50">
                                    <div>
                                        <h3 className="text-sm font-extrabold uppercase tracking-wider">1. Mandatory "Before" Photos (8 Angles)</h3>
                                        <p className="text-xs text-slate-400 font-medium mt-0.5">All 8 angles are required before transitioning the vehicle to "In Repair".</p>
                                    </div>
                                    <span className="text-xs font-bold bg-emerald-950 text-emerald-300 px-3.5 py-1.5 rounded-full border border-emerald-800/60">
                                        {mediaItems.filter(m => m.media_type === 'photo_before').length} / 8 Captured
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {PHOTO_CATEGORIES.map((cat) => {
                                        const uploaded = mediaItems.find(m => m.category === cat.key && m.media_type === 'photo_before')
                                        const isUploading = uploadingCategory === cat.key
                                        const inputId = `desktop-input-before-${cat.key}`

                                        return (
                                            <div key={cat.key} className={`border rounded-2xl p-4 flex flex-col justify-between shadow-xs ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                <div>
                                                    <p className="text-xs font-extrabold uppercase tracking-wider mb-1">{cat.label}</p>
                                                    <p className={`text-xs font-semibold mb-4 ${uploaded ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                        {uploaded ? '✓ Captured & Secure' : 'Required'}
                                                    </p>
                                                </div>
                                                <div>
                                                    {uploaded ? (
                                                        <div className="flex gap-2 w-full">
                                                            <button
                                                                type="button"
                                                                onClick={() => setPreviewMedia({ url: uploaded.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (Before)` })}
                                                                className="w-1/2 text-center bg-slate-800 hover:bg-slate-700 text-emerald-300 py-2 rounded-xl text-xs font-bold transition-colors border border-slate-700 cursor-pointer"
                                                            >
                                                                View
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => requestDeletePhoto(cat.key, 'photo_before')}
                                                                className="w-1/2 text-center bg-rose-950 hover:bg-rose-900 text-rose-300 py-2 rounded-xl text-xs font-bold transition-colors border border-rose-900 cursor-pointer"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <label
                                                                htmlFor={inputId}
                                                                className="w-full block text-center bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-bold cursor-pointer shadow-md transition-all"
                                                            >
                                                                {isUploading ? 'Uploading...' : 'Upload / Snap'}
                                                            </label>
                                                            <input
                                                                id={inputId}
                                                                key={inputId}
                                                                type="file"
                                                                accept="image/*"
                                                                className="hidden"
                                                                onChange={(e) => handlePhotoSelect(e, cat.key, true)}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* 2. MANDATORY AFTER PHOTOS */}
                            {(selectedVehicle.status === 'in_repair' || selectedVehicle.status === 'pending_after_photos' || selectedVehicle.status === 'road_ready') && (
                                <div className={`rounded-3xl border p-8 shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                                    <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800/50">
                                        <div>
                                            <h3 className="text-sm font-extrabold uppercase tracking-wider">2. Mandatory "After" Photos (8 Angles)</h3>
                                            <p className="text-xs text-slate-400 font-medium mt-0.5">All 8 angles are required before marking the vehicle as "Road Ready".</p>
                                        </div>
                                        <span className="text-xs font-bold bg-blue-950 text-blue-300 px-3.5 py-1.5 rounded-full border border-blue-800/60">
                                            {mediaItems.filter(m => m.media_type === 'photo_after').length} / 8 Captured
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {PHOTO_CATEGORIES.map((cat) => {
                                            const uploaded = mediaItems.find(m => m.category === cat.key && m.media_type === 'photo_after')
                                            const isUploading = uploadingCategory === `after-${cat.key}`
                                            const inputId = `desktop-input-after-${cat.key}`

                                            return (
                                                <div key={cat.key} className={`border rounded-2xl p-4 flex flex-col justify-between shadow-xs ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                    <div>
                                                        <p className="text-xs font-extrabold uppercase tracking-wider mb-1">{cat.label}</p>
                                                        <p className={`text-xs font-semibold mb-4 ${uploaded ? 'text-blue-400' : 'text-slate-500'}`}>
                                                            {uploaded ? '✓ Captured & Secure' : 'Required'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        {uploaded ? (
                                                            <div className="flex gap-2 w-full">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPreviewMedia({ url: uploaded.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (After)` })}
                                                                    className="w-1/2 text-center bg-slate-800 hover:bg-slate-700 text-blue-300 py-2 rounded-xl text-xs font-bold transition-colors border border-slate-700 cursor-pointer"
                                                                >
                                                                    View
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => requestDeletePhoto(cat.key, 'photo_after')}
                                                                    className="w-1/2 text-center bg-rose-950 hover:bg-rose-900 text-rose-300 py-2 rounded-xl text-xs font-bold transition-colors border border-rose-900 cursor-pointer"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <label
                                                                    htmlFor={inputId}
                                                                    className="w-full block text-center bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-xs font-bold cursor-pointer shadow-md transition-all"
                                                                >
                                                                    {isUploading ? 'Uploading...' : 'Upload / Snap'}
                                                                </label>
                                                                <input
                                                                    id={inputId}
                                                                    key={inputId}
                                                                    type="file"
                                                                    accept="image/*"
                                                                    className="hidden"
                                                                    onChange={(e) => handlePhotoSelect(e, cat.key, false)}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* 3. ADDITIONAL EVIDENCE PHOTOS */}
                            <div className={`rounded-3xl border p-8 shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                                <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-800/50">
                                    <div>
                                        <h3 className="text-sm font-extrabold text-purple-400 uppercase tracking-wider">3. Additional Evidence Photos ({additionalPhotos.length})</h3>
                                        <p className="text-xs text-slate-400 font-medium mt-0.5">Upload close-up damage details, part codes, or extra inspection angles.</p>
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="desktop-input-additional"
                                            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer shadow-md transition-all inline-block"
                                        >
                                            + Add Extra Photo
                                        </label>
                                        <input
                                            id="desktop-input-additional"
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleAdditionalPhotoSelect}
                                        />
                                    </div>
                                </div>

                                {additionalPhotos.length === 0 ? (
                                    <div className={`border border-dashed rounded-2xl p-8 text-center text-xs text-slate-500 font-medium ${isDark ? 'bg-slate-900/50 border-slate-800' : 'bg-slate-50 border-slate-300'}`}>
                                        No additional evidence photos uploaded yet. Click "+ Add Extra Photo" to include optional close-ups.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                        {additionalPhotos.map((item) => {
                                            const displayTitle = item.category.replace(/^extra_/, '').replace(/_[0-9]+$/, '').replace(/_/g, ' ')
                                            return (
                                                <div key={item.id} className={`border rounded-2xl p-4 flex flex-col justify-between shadow-xs ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                    <div>
                                                        <p className="text-xs font-extrabold text-purple-300 uppercase tracking-wider mb-1 capitalize">{displayTitle}</p>
                                                        <p className="text-[11px] font-semibold text-emerald-400 mb-4">✓ Extra Evidence Photo</p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewMedia({ url: item.file_url, title: `${selectedVehicle.plate_number} - ${displayTitle}` })}
                                                            className="w-1/2 text-center bg-slate-800 hover:bg-slate-700 text-purple-300 py-2 rounded-xl text-xs font-bold transition-colors border border-slate-700 cursor-pointer"
                                                        >
                                                            View
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => requestDeletePhoto(item.category, 'photo_additional')}
                                                            className="w-1/2 text-center bg-rose-950 hover:bg-rose-900 text-rose-300 py-2 rounded-xl text-xs font-bold transition-colors border border-rose-900 cursor-pointer"
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
                )}
            </main>
        </div>
    )
}