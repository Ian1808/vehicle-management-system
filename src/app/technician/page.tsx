"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { addWatermarkToFile } from '@/utils/watermark'
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
    const [theme, setTheme] = useState<'dark' | 'light'>('dark')
    const [showSettingsModal, setShowSettingsModal] = useState(false)

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
    const isDark = theme === 'dark'

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

    async function executePhotoUpload(file: File, categoryKey: string, mediaType: 'photo_before' | 'photo_after') {
        setConfirmModal(null)
        if (!selectedVehicle) return

        const uploadKey = `${mediaType}_${categoryKey}`
        setUploadingKey(uploadKey)
        showToast(`Watermarking & uploading photo...`, 'success')

        try {
            const watermarkText = `CONFIDENTIAL • ${selectedVehicle.plate_number} • ${mediaType === 'photo_before' ? 'BEFORE' : 'AFTER'} • ${categoryKey.toUpperCase()}`
            const fileToUpload = await addWatermarkToFile(file, watermarkText)

            const existing = mediaItems.find(m => m.media_type === mediaType && m.category === categoryKey)
            if (existing) {
                await supabase.from('vehicle_media').delete().eq('id', existing.id)
            }

            const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'jpg'
            const path = `${selectedVehicle.id}/${mediaType}/${categoryKey}_${Date.now()}.${fileExt}`

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

    async function handleStatusChange(newStatus: string) {
        if (!selectedVehicle) return
        setConfirmModal({
            title: 'Update Vehicle Status',
            message: `Change repair status to "${newStatus.replace(/_/g, ' ').toUpperCase()}"?`,
            confirmText: 'Update Status',
            confirmVariant: 'success',
            onConfirm: async () => {
                setConfirmModal(null)
                try {
                    await supabase.from('vehicles').update({ status: newStatus }).eq('id', selectedVehicle.id)
                    setSelectedVehicle({ ...selectedVehicle, status: newStatus })
                    showToast('Status updated successfully!', 'success')
                } catch (err: any) {
                    showToast(err.message || 'Failed to update status', 'error')
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
            {toast && <Toast message={toast.message} type={toast.type} />}
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
                    <div className="border border-slate-800 bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full p-8 text-slate-100 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-extrabold text-white">User Account Settings</h3>
                                <p className="text-xs mt-0.5 font-medium text-slate-400">Manage appearance and security credentials.</p>
                            </div>
                            <button onClick={() => setShowSettingsModal(false)} className="rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer">&times;</button>
                        </div>

                        <form onSubmit={handleUpdateSettings} className="space-y-5">
                            <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950">
                                <label className="block text-[11px] font-bold uppercase tracking-wider mb-2 text-slate-300">Interface Theme Mode</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button type="button" onClick={() => setTheme('light')} className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'light' ? 'bg-blue-600 text-white border-blue-500 shadow-md' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>☀️ Day Mode</button>
                                    <button type="button" onClick={() => setTheme('dark')} className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'dark' ? 'bg-blue-600 text-white border-blue-500 shadow-md' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>🌙 Night Mode</button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Email (Locked)</label>
                                    <input type="text" disabled value={currentUserEmail} className="w-full border border-slate-800 bg-slate-950 text-slate-500 rounded-xl p-3 text-xs font-medium cursor-not-allowed" />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Username (Locked)</label>
                                    <input type="text" disabled value={settingsUsername} className="w-full border border-slate-800 bg-slate-950 text-slate-500 rounded-xl p-3 text-xs font-medium cursor-not-allowed" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-wider mb-1.5 text-slate-400">Full Name *</label>
                                <input type="text" required value={settingsFullName} onChange={(e) => setSettingsFullName(e.target.value)} className="w-full border border-slate-800 bg-slate-950 text-white rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                            </div>

                            <div className="pt-4 border-t border-slate-800 space-y-4">
                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-300">Change Password (Optional)</h4>

                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-400">Current Password</label>
                                    <div className="relative">
                                        <input type={showOldPassword ? 'text' : 'password'} placeholder="••••••••" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="w-full border border-slate-800 bg-slate-950 text-white rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                        <button type="button" onClick={() => setShowOldPassword(!showOldPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-blue-500 cursor-pointer">{showOldPassword ? '🙈' : '👁️'}</button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-400">New Password</label>
                                    <div className="relative">
                                        <input type={showNewPassword ? 'text' : 'password'} placeholder="••••••••" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full border border-slate-800 bg-slate-950 text-white rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-blue-500 cursor-pointer">{showNewPassword ? '🙈' : '👁️'}</button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wider mb-1 text-slate-400">Confirm New Password</label>
                                    <div className="relative">
                                        <input type={showConfirmPassword ? 'text' : 'password'} placeholder="••••••••" value={confirmNewPassword} onChange={(e) => setConfirmNewPassword(e.target.value)} className="w-full border border-slate-800 bg-slate-950 text-white rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-blue-500 cursor-pointer">{showConfirmPassword ? '🙈' : '👁️'}</button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                                <button type="button" onClick={() => setShowSettingsModal(false)} className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer">Cancel</button>
                                <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer">Save Changes</button>
                            </div>
                        </form>
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
                        <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="p-2 rounded-xl text-xs font-bold border border-slate-700 bg-slate-800 text-amber-300 cursor-pointer">
                            {isDark ? '☀️' : '🌙'}
                        </button>
                        {userRole === 'admin' && (
                            <Link href="/admin" className="font-bold px-3.5 py-2 rounded-xl text-xs border border-purple-800 bg-purple-950 text-purple-300">🛡️ Admin Hub</Link>
                        )}
                        <Link href="/" className="font-semibold px-3.5 py-2 rounded-xl text-xs border border-slate-700 bg-slate-800 text-slate-200">📋 Front Desk</Link>
                        <button onClick={() => setShowSettingsModal(true)} className="font-semibold px-3.5 py-2 rounded-xl text-xs border border-slate-700 bg-slate-800 text-slate-200 cursor-pointer">⚙️ Settings</button>
                        <button onClick={requestSignOut} className="font-bold px-3.5 py-2 rounded-xl text-xs border border-rose-900 bg-rose-950 text-rose-300 cursor-pointer">Sign Out</button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {selectedVehicle ? (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <button onClick={() => setSelectedVehicle(null)} className="text-xs font-bold px-3.5 py-2 rounded-xl border border-slate-800 bg-slate-950 text-emerald-400 cursor-pointer">
                                &larr; Back to Workshop Queue
                            </button>

                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-400">Status Control:</span>
                                <select
                                    value={selectedVehicle.status}
                                    onChange={(e) => handleStatusChange(e.target.value)}
                                    className="bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs font-bold cursor-pointer"
                                >
                                    <option value="pending_before_photos">Pending Before Photos</option>
                                    <option value="in_repair">In Repair</option>
                                    <option value="pending_after_photos">Pending After Photos</option>
                                    <option value="completed">Completed</option>
                                </select>
                            </div>
                        </div>

                        <div className={`border rounded-3xl p-8 mb-8 shadow-2xl ${cardClass}`}>
                            <div className="flex justify-between items-center pb-6 border-b border-slate-800">
                                <div>
                                    <h2 className="text-3xl font-black text-white">{selectedVehicle.plate_number}</h2>
                                    <p className="mt-1 font-semibold text-sm text-slate-400">{selectedVehicle.make_model_year}</p>
                                    <p className="text-xs font-mono mt-2 inline-block px-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-slate-400">
                                        VIN: <span className="text-white">{selectedVehicle.chassis_number}</span>
                                    </p>
                                </div>
                                <span className="px-4 py-2 rounded-xl text-xs font-extrabold bg-amber-950 text-amber-300 border border-amber-800 capitalize">
                                    {selectedVehicle.status.replace(/_/g, ' ')}
                                </span>
                            </div>

                            {/* 8 Mandatory Before/After Angles */}
                            <div className="pt-8 space-y-6">
                                <h3 className="text-sm font-extrabold tracking-wider uppercase text-white">Workshop Inspection Evidence (8 Angles)</h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    {PHOTO_CATEGORIES.map((cat) => {
                                        const before = mediaItems.find(m => m.media_type === 'photo_before' && m.category === cat.key)
                                        const after = mediaItems.find(m => m.media_type === 'photo_after' && m.category === cat.key)

                                        return (
                                            <div key={cat.key} className={`border rounded-2xl p-5 ${innerCard}`}>
                                                <p className="text-xs font-extrabold uppercase text-white mb-4">{cat.label}</p>

                                                <div className="grid grid-cols-2 gap-4">
                                                    {/* Before Photo */}
                                                    <div className="border border-slate-800 bg-slate-950 rounded-xl p-3 flex flex-col justify-between">
                                                        <div>
                                                            <p className="text-[10px] font-bold uppercase text-amber-400 mb-1">Before Repair</p>
                                                            <p className={`text-[11px] mb-3 font-semibold ${before ? 'text-emerald-400' : 'text-slate-500'}`}>{before ? '✓ Captured' : 'Pending'}</p>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {before && (
                                                                <button onClick={() => setPreviewMedia({ url: before.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (Before)` })} className="w-full py-2 rounded-lg text-xs font-bold bg-slate-900 text-emerald-400 border border-slate-700 cursor-pointer">
                                                                    View Photo
                                                                </button>
                                                            )}
                                                            <label htmlFor={`upload-before-${cat.key}`} className="w-full block text-center py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow">
                                                                {before ? 'Retake' : 'Upload'}
                                                            </label>
                                                            <input id={`upload-before-${cat.key}`} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoSelect(e, cat.key, 'photo_before')} />
                                                        </div>
                                                    </div>

                                                    {/* After Photo */}
                                                    <div className="border border-slate-800 bg-slate-950 rounded-xl p-3 flex flex-col justify-between">
                                                        <div>
                                                            <p className="text-[10px] font-bold uppercase text-blue-400 mb-1">After Repair</p>
                                                            <p className={`text-[11px] mb-3 font-semibold ${after ? 'text-emerald-400' : 'text-slate-500'}`}>{after ? '✓ Captured' : 'Pending'}</p>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {after && (
                                                                <button onClick={() => setPreviewMedia({ url: after.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (After)` })} className="w-full py-2 rounded-lg text-xs font-bold bg-slate-900 text-blue-400 border border-slate-700 cursor-pointer">
                                                                    View Photo
                                                                </button>
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
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-black tracking-tight">Active Workshop Vehicles</h2>
                            <span className="text-xs font-bold px-3.5 py-1.5 rounded-full border border-slate-700 bg-slate-800 text-slate-300">Queue: {vehicles.length} Vehicles</span>
                        </div>

                        {loading ? (
                            <div className="p-16 text-center text-slate-500 font-medium">Loading workshop queue...</div>
                        ) : vehicles.length === 0 ? (
                            <div className="p-16 text-center text-slate-500 font-medium">No vehicles currently assigned to the workshop queue.</div>
                        ) : (
                            <div className="border border-slate-800 bg-slate-950 rounded-3xl shadow-xl overflow-hidden">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="text-[11px] uppercase font-bold text-slate-400 border-b border-slate-800 bg-slate-900/80">
                                            <th className="p-4.5">Plate Number</th>
                                            <th className="p-4.5">Make / Model / Year</th>
                                            <th className="p-4.5">Current Status</th>
                                            <th className="p-4.5 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800 text-xs font-medium text-slate-300">
                                        {vehicles.map((v) => (
                                            <tr key={v.id} className="hover:bg-slate-900/50 transition-colors">
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