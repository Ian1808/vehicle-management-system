"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { addWatermarkToFile } from '@/utils/watermark'

type Vehicle = {
    id: string
    plate_number: string
    make_model_year: string
    status: string
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
    const [settingsNewPassword, setSettingsNewPassword] = useState('')

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

            if (userError || !userData || userData.role !== 'technician') {
                showToast('Access Denied: Restricted to technicians only.', 'error')
                setTimeout(() => { window.location.href = '/' }, 1500)
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
            .select('id, plate_number, make_model_year, status')
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
                .update({ full_name: settingsFullName, username: settingsUsername })
                .eq('id', currentUserId)

            if (profileError) throw profileError

            if (settingsNewPassword.trim()) {
                const { error: passwordError } = await supabase.auth.updateUser({
                    password: settingsNewPassword.trim(),
                })
                if (passwordError) throw passwordError
                setSettingsNewPassword('')
            }

            showToast('Account settings updated successfully!', 'success')
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

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 pb-12 relative">
            {toast && (
                <div className="fixed top-6 right-6 z-50 animate-bounce">
                    <div className={`px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-3 border ${toast.type === 'success'
                            ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
                            : 'bg-rose-900 text-rose-100 border-rose-700'
                        }`}>
                        <span>{toast.type === 'success' ? '✨' : '⚠️'}</span>
                        <span>{toast.message}</span>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-slate-100 text-center">
                        <div className="w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center text-xl font-bold bg-slate-800">
                            {confirmModal.confirmVariant === 'danger' ? '⚠️' : confirmModal.confirmVariant === 'success' ? '✅' : '❓'}
                        </div>
                        <h3 className="text-lg font-extrabold text-white">{confirmModal.title}</h3>
                        <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">{confirmModal.message}</p>

                        <div className="flex gap-3 mt-6">
                            <button
                                type="button"
                                onClick={() => setConfirmModal(null)}
                                className="w-1/2 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer border border-slate-700"
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
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-slate-100">
                        <h3 className="text-base font-extrabold text-white mb-1">Label Additional Photo</h3>
                        <p className="text-xs text-slate-400 mb-4">Enter a clear description for this extra evidence photo:</p>
                        <input
                            type="text"
                            value={customPhotoLabel}
                            onChange={(e) => setCustomPhotoLabel(e.target.value)}
                            placeholder="e.g. Scratched Bumper Detail"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white mb-6 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowLabelModal(false)}
                                className="w-1/2 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 cursor-pointer"
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

            {/* Settings Modal */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-8 text-slate-100">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-xl font-extrabold text-white">Technician Account Settings</h3>
                                <p className="text-xs text-slate-400 mt-0.5 font-medium">Manage your personal profile and credentials.</p>
                            </div>
                            <button onClick={() => setShowSettingsModal(false)} className="bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer">&times;</button>
                        </div>

                        <form onSubmit={handleUpdateSettings} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">Email (Read-only)</label>
                                <input type="text" disabled value={currentUserEmail} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-medium text-slate-500 cursor-not-allowed" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">Full Name *</label>
                                <input type="text" required value={settingsFullName} onChange={(e) => setSettingsFullName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">Username *</label>
                                <input type="text" required value={settingsUsername} onChange={(e) => setSettingsUsername(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">New Password (leave blank to keep current)</label>
                                <input type="password" placeholder="••••••••" value={settingsNewPassword} onChange={(e) => setSettingsNewPassword(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none text-white" />
                            </div>
                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                                <button type="button" onClick={() => setShowSettingsModal(false)} className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer border border-slate-700">Cancel</button>
                                <button type="submit" className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Media Preview Modal */}
            {previewMedia && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-3xl w-full p-6 text-slate-100 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center pb-4 border-b border-slate-800">
                            <h3 className="text-base font-extrabold text-white truncate">{previewMedia.title}</h3>
                            <button
                                onClick={() => setPreviewMedia(null)}
                                className="bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="py-4 flex-1 overflow-auto flex items-center justify-center bg-slate-950 rounded-2xl my-4 border border-slate-800/80 p-2">
                            <img
                                src={previewMedia.url}
                                alt={previewMedia.title}
                                className="max-h-[60vh] w-auto object-contain rounded-xl shadow-md"
                            />
                        </div>

                        <div className="flex flex-wrap justify-end gap-3 pt-2 border-t border-slate-800/80">
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
                                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-20 shadow-md">
                <div className="max-w-3xl mx-auto px-4 py-4 flex justify-between items-center">
                    <h1 className="text-base font-bold tracking-wide text-emerald-400 flex items-center gap-2">
                        🛠️ Technician Portal <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md border border-slate-700">Mobile View</span>
                    </h1>
                    <div className="flex items-center gap-2">
                        {selectedVehicle && (
                            <button
                                onClick={() => setSelectedVehicle(null)}
                                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl font-semibold transition-colors border border-slate-700 cursor-pointer"
                            >
                                &larr; Switch
                            </button>
                        )}
                        <button
                            onClick={() => setShowSettingsModal(true)}
                            className="text-xs bg-slate-800 hover:bg-slate-700 text-emerald-300 px-3 py-1.5 rounded-xl font-semibold transition-colors border border-slate-700 cursor-pointer"
                        >
                            ⚙️ Settings
                        </button>
                        <button
                            onClick={requestLogout}
                            className="text-xs bg-rose-600/90 hover:bg-rose-500 text-white px-3 py-1.5 rounded-xl font-semibold transition-colors shadow cursor-pointer"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-4 pt-6">
                {!selectedVehicle ? (
                    <div>
                        <h2 className="text-xl font-bold mb-1 text-white">Assigned Vehicles</h2>
                        <p className="text-xs text-slate-400 mb-6 font-medium">Select a vehicle to inspect and capture mandatory photo evidence.</p>

                        {loading ? (
                            <div className="text-center py-16 text-slate-500 font-medium">Loading assigned vehicles...</div>
                        ) : vehicles.length === 0 ? (
                            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-8 text-center text-slate-400">
                                No vehicles currently awaiting photo inspection.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {vehicles.map((v) => (
                                    <div
                                        key={v.id}
                                        onClick={() => selectVehicle(v)}
                                        className="bg-slate-900 border border-slate-800 hover:border-emerald-500/80 p-4.5 rounded-2xl cursor-pointer transition-all flex justify-between items-center shadow-xs"
                                    >
                                        <div>
                                            <h3 className="text-base font-bold text-white tracking-wide">{v.plate_number}</h3>
                                            <p className="text-xs text-slate-400 mt-0.5">{v.make_model_year}</p>
                                        </div>
                                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 capitalize">
                                            {v.status.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div>
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                                <h2 className="text-2xl font-black text-white">{selectedVehicle.plate_number}</h2>
                                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 capitalize">
                                    {selectedVehicle.status.replace(/_/g, ' ')}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mb-5 font-medium">{selectedVehicle.make_model_year}</p>

                            <div className="flex gap-2 pt-4 border-t border-slate-800">
                                {selectedVehicle.status === 'pending_before_photos' && (
                                    <button
                                        onClick={() => requestStatusTransition('in_repair')}
                                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl text-xs shadow-md transition-all cursor-pointer"
                                    >
                                        Complete "Before" Photos &rarr; Start Repair
                                    </button>
                                )}
                                {selectedVehicle.status === 'in_repair' && (
                                    <button
                                        onClick={() => requestStatusTransition('pending_after_photos')}
                                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-4 rounded-xl text-xs shadow-md transition-all cursor-pointer"
                                    >
                                        Finish Repair &rarr; Request "After" Photos
                                    </button>
                                )}
                                {selectedVehicle.status === 'pending_after_photos' && (
                                    <button
                                        onClick={() => requestStatusTransition('road_ready')}
                                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-4 rounded-xl text-xs shadow-md transition-all cursor-pointer"
                                    >
                                        Complete "After" Photos &rarr; Mark Road Ready
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="space-y-6">
                            {/* 1. MANDATORY BEFORE PHOTOS */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider">1. Mandatory "Before" Photos</h3>
                                    <span className="text-xs bg-slate-800 px-3 py-1 rounded-full text-emerald-400 font-bold border border-slate-700">
                                        {mediaItems.filter(m => m.media_type === 'photo_before').length} / 8 Captured
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {PHOTO_CATEGORIES.map((cat) => {
                                        const uploaded = mediaItems.find(m => m.category === cat.key && m.media_type === 'photo_before')
                                        const isUploading = uploadingCategory === cat.key
                                        const inputId = `tech-input-before-${cat.key}`

                                        return (
                                            <div key={cat.key} className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                                                <div>
                                                    <p className="text-xs font-bold text-slate-200">{cat.label}</p>
                                                    <p className={`text-[10px] font-semibold mt-0.5 ${uploaded ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                        {uploaded ? '✓ Captured' : 'Required'}
                                                    </p>
                                                </div>
                                                <div>
                                                    {uploaded ? (
                                                        <div className="flex gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setPreviewMedia({ url: uploaded.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (Before)` })}
                                                                className="text-[11px] bg-slate-800 text-emerald-400 px-2.5 py-1.5 rounded-lg font-bold border border-slate-700 hover:bg-slate-700 cursor-pointer"
                                                            >
                                                                View
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => requestDeletePhoto(cat.key, 'photo_before')}
                                                                className="text-[11px] bg-rose-950 text-rose-400 px-2.5 py-1.5 rounded-lg font-bold border border-rose-900 hover:bg-rose-900 transition-colors cursor-pointer"
                                                            >
                                                                Remove
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <label
                                                                htmlFor={inputId}
                                                                className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-lg font-bold cursor-pointer shadow inline-block"
                                                            >
                                                                {isUploading ? '...' : 'Snap Camera'}
                                                            </label>
                                                            <input
                                                                id={inputId}
                                                                key={inputId}
                                                                type="file"
                                                                accept="image/*"
                                                                capture="environment"
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
                                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                                    <div className="flex justify-between items-center mb-4">
                                        <h3 className="font-bold text-sm text-slate-200 uppercase tracking-wider">2. Mandatory "After" Photos</h3>
                                        <span className="text-xs bg-slate-800 px-3 py-1 rounded-full text-blue-400 font-bold border border-slate-700">
                                            {mediaItems.filter(m => m.media_type === 'photo_after').length} / 8 Captured
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {PHOTO_CATEGORIES.map((cat) => {
                                            const uploaded = mediaItems.find(m => m.category === cat.key && m.media_type === 'photo_after')
                                            const isUploading = uploadingCategory === `after-${cat.key}`
                                            const inputId = `tech-input-after-${cat.key}`

                                            return (
                                                <div key={cat.key} className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-200">{cat.label}</p>
                                                        <p className={`text-[10px] font-semibold mt-0.5 ${uploaded ? 'text-blue-400' : 'text-slate-500'}`}>
                                                            {uploaded ? '✓ Captured' : 'Required'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        {uploaded ? (
                                                            <div className="flex gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPreviewMedia({ url: uploaded.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (After)` })}
                                                                    className="text-[11px] bg-slate-800 text-blue-400 px-2.5 py-1.5 rounded-lg font-bold border border-slate-700 hover:bg-slate-700 cursor-pointer"
                                                                >
                                                                    View
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => requestDeletePhoto(cat.key, 'photo_after')}
                                                                    className="text-[11px] bg-rose-950 text-rose-400 px-2.5 py-1.5 rounded-lg font-bold border border-rose-900 hover:bg-rose-900 transition-colors cursor-pointer"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div>
                                                                <label
                                                                    htmlFor={inputId}
                                                                    className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg font-bold cursor-pointer shadow inline-block"
                                                                >
                                                                    {isUploading ? '...' : 'Snap Camera'}
                                                                </label>
                                                                <input
                                                                    id={inputId}
                                                                    key={inputId}
                                                                    type="file"
                                                                    accept="image/*"
                                                                    capture="environment"
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

                            {/* 3. ADDITIONAL PHOTOS & EVIDENCE */}
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                                <div className="flex justify-between items-center mb-4">
                                    <div>
                                        <h3 className="font-bold text-sm text-purple-300 uppercase tracking-wider">3. Additional Evidence Photos</h3>
                                        <p className="text-[11px] text-slate-400">Upload close-up damage details, part codes, or extra inspection angles.</p>
                                    </div>
                                    <div>
                                        <label
                                            htmlFor="tech-input-additional"
                                            className="text-xs bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-1.5 rounded-xl font-bold cursor-pointer shadow inline-block transition-colors"
                                        >
                                            + Add Photo
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
                                    <div className="bg-slate-950/50 border border-dashed border-slate-800 rounded-xl p-4 text-center text-xs text-slate-500 font-medium">
                                        No additional evidence photos uploaded yet. Tap "+ Add Photo" to snap optional extra angles.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {additionalPhotos.map((item) => {
                                            const displayTitle = item.category.replace(/^extra_/, '').replace(/_[0-9]+$/, '').replace(/_/g, ' ')
                                            return (
                                                <div key={item.id} className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between">
                                                    <div>
                                                        <p className="text-xs font-bold text-purple-300 capitalize">{displayTitle}</p>
                                                        <p className="text-[10px] text-slate-400 font-semibold mt-0.5">✓ Extra Evidence</p>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewMedia({ url: item.file_url, title: `${selectedVehicle.plate_number} - ${displayTitle}` })}
                                                            className="text-[11px] bg-slate-800 text-purple-300 px-2.5 py-1.5 rounded-lg font-bold border border-slate-700 hover:bg-slate-700 cursor-pointer"
                                                        >
                                                            View
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => requestDeletePhoto(item.category, 'photo_additional')}
                                                            className="text-[11px] bg-rose-950 text-rose-400 px-2.5 py-1.5 rounded-lg font-bold border border-rose-900 hover:bg-rose-900 transition-colors cursor-pointer"
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