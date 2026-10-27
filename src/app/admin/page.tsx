"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

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
    is_deleted: boolean
    created_at: string
}

type MediaItem = {
    id: string
    category: string
    file_url: string
    media_type: string
    vehicle_id: string
}

type StaffUser = {
    id: string
    username: string
    email: string
    full_name: string
    role: string
    last_login: string | null
    created_at: string
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

export default function AdminDashboard() {
    const [activeTab, setActiveTab] = useState<'vehicles' | 'staff' | 'trash'>('vehicles')
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [deletedVehicles, setDeletedVehicles] = useState<Vehicle[]>([])
    const [staffUsers, setStaffUsers] = useState<StaffUser[]>([])
    const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState<Toast | null>(null)
    const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null)
    const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null)

    // Theme State ('dark' | 'light')
    const [theme, setTheme] = useState<'dark' | 'light'>('dark')

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
        async function checkAdminAccess() {
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

            if (userError || !userData || userData.role !== 'admin') {
                showToast('Access Denied: Restricted to Workshop Administrators.', 'error')
                setTimeout(() => { window.location.href = '/' }, 1500)
                return
            }

            setSettingsFullName(userData.full_name || '')
            setSettingsUsername(userData.username || '')

            fetchVehicles()
            fetchDeletedVehicles()
            fetchStaffUsers()
        }
        checkAdminAccess()
    }, [])

    useEffect(() => {
        if (selectedVehicle) {
            fetchVehicleMedia(selectedVehicle.id)
        }
    }, [selectedVehicle?.id])

    async function fetchVehicles() {
        setLoading(true)
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })

        if (error) showToast(error.message, 'error')
        else setVehicles(data || [])
        setLoading(false)
    }

    async function fetchDeletedVehicles() {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .eq('is_deleted', true)
            .order('updated_at', { ascending: false })

        if (!error) setDeletedVehicles(data || [])
    }

    async function fetchStaffUsers() {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false })

        if (!error) setStaffUsers(data || [])
    }

    async function fetchVehicleMedia(vehicleId: string) {
        const { data, error } = await supabase
            .from('vehicle_media')
            .select('*')
            .eq('vehicle_id', vehicleId)

        if (error) showToast(error.message, 'error')
        else setMediaItems(data || [])
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
            showToast('Preparing file download...', 'success')
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

    function requestStatusOverride(newStatus: string) {
        if (!selectedVehicle) return
        const formattedStatus = newStatus.replace(/_/g, ' ').toUpperCase()

        setConfirmModal({
            title: 'Confirm Admin Status Override',
            message: `Override vehicle ${selectedVehicle.plate_number}'s status directly to "${formattedStatus}"?`,
            confirmText: 'Override Status',
            confirmVariant: 'primary',
            onConfirm: () => executeStatusOverride(newStatus),
        })
    }

    async function executeStatusOverride(newStatus: string) {
        setConfirmModal(null)
        if (!selectedVehicle) return

        const { error } = await supabase
            .from('vehicles')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', selectedVehicle.id)

        if (error) {
            showToast('Error overriding status: ' + error.message, 'error')
        } else {
            showToast(`Status overridden to ${newStatus.replace(/_/g, ' ').toUpperCase()}`, 'success')
            setSelectedVehicle({ ...selectedVehicle, status: newStatus })
            fetchVehicles()
        }
    }

    function requestSoftDeleteVehicle(v: Vehicle) {
        setConfirmModal({
            title: 'Confirm Soft Delete',
            message: `Archive vehicle ${v.plate_number}? It will be moved to the Trash bin and hidden from active views.`,
            confirmText: 'Archive Vehicle',
            confirmVariant: 'danger',
            onConfirm: () => executeSoftDeleteVehicle(v.id),
        })
    }

    async function executeSoftDeleteVehicle(vehicleId: string) {
        setConfirmModal(null)
        const { error } = await supabase
            .from('vehicles')
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq('id', vehicleId)

        if (error) {
            showToast('Error archiving vehicle: ' + error.message, 'error')
        } else {
            showToast('Vehicle archived to trash.', 'success')
            if (selectedVehicle?.id === vehicleId) setSelectedVehicle(null)
            fetchVehicles()
            fetchDeletedVehicles()
        }
    }

    async function executeRestoreVehicle(vehicleId: string) {
        const { error } = await supabase
            .from('vehicles')
            .update({ is_deleted: false, updated_at: new Date().toISOString() })
            .eq('id', vehicleId)

        if (error) {
            showToast('Error restoring vehicle: ' + error.message, 'error')
        } else {
            showToast('Vehicle restored to active registry!', 'success')
            fetchVehicles()
            fetchDeletedVehicles()
        }
    }

    function requestRoleChange(userId: string, newRole: string, username: string) {
        setConfirmModal({
            title: 'Confirm Staff Role Change',
            message: `Change user "${username}"'s role to "${newRole.toUpperCase()}"?`,
            confirmText: 'Update Role',
            confirmVariant: 'success',
            onConfirm: () => executeRoleChange(userId, newRole),
        })
    }

    async function executeRoleChange(userId: string, newRole: string) {
        setConfirmModal(null)
        const { error } = await supabase
            .from('users')
            .update({ role: newRole })
            .eq('id', userId)

        if (error) {
            showToast('Failed to update role: ' + error.message, 'error')
        } else {
            showToast('Staff role updated successfully.', 'success')
            fetchStaffUsers()
        }
    }

    function requestLogout() {
        setConfirmModal({
            title: 'Confirm Sign Out',
            message: 'Are you sure you want to sign out of the Admin Control Hub?',
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
        <div className={`min-h-screen relative selection:bg-purple-500 selection:text-white ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
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

            {confirmModal && (
                <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className={`border rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                        <div className={`w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center text-xl font-bold border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
                            {confirmModal.confirmVariant === 'danger' ? '⚠️' : confirmModal.confirmVariant === 'success' ? '✅' : '⚙️'}
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

            {/* Settings Modal */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
                    <div className={`border rounded-3xl shadow-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Admin Account Settings</h3>
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
                                        className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'light' ? 'bg-purple-600 text-white border-purple-500 shadow-md' : isDark ? 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        ☀️ Day Mode
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTheme('dark')}
                                        className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'dark' ? 'bg-purple-600 text-white border-purple-500 shadow-md' : isDark ? 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
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
                                <input type="text" required value={settingsFullName} onChange={(e) => setSettingsFullName(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
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
                                            className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                        />
                                        <button type="button" onClick={() => setShowOldPassword(!showOldPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-purple-500 cursor-pointer">
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
                                            className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                        />
                                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-purple-500 cursor-pointer">
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
                                            className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                                        />
                                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-purple-500 cursor-pointer">
                                            {showConfirmPassword ? '🙈 Hide' : '👁️ View'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <button type="button" onClick={() => setShowSettingsModal(false)} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}>Cancel</button>
                                <button type="submit" className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Media Preview Modal */}
            {previewMedia && (
                <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-4 z-50">
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
                            {previewMedia.url.includes('.pdf') ? (
                                <iframe src={previewMedia.url} className="w-full h-[60vh] rounded-xl border-0" title={previewMedia.title} />
                            ) : (
                                <img
                                    src={previewMedia.url}
                                    alt={previewMedia.title}
                                    className="max-h-[60vh] w-auto object-contain rounded-xl shadow-md"
                                />
                            )}
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

            <header className={`border-b shadow-lg ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200 text-slate-900'}`}>
                <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <h1 className={`text-xl font-black tracking-tight flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                            🛡️ Workshop Admin Hub
                            <span className="text-xs bg-purple-950 text-purple-300 px-3 py-1 rounded-full border border-purple-800/60 font-bold uppercase tracking-wider">
                                System Administrator
                            </span>
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setTheme(isDark ? 'light' : 'dark')}
                            className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-amber-600 border-slate-200'}`}
                            title="Toggle Theme"
                        >
                            {isDark ? '☀️ Light' : '🌙 Dark'}
                        </button>
                        <Link
                            href="/"
                            className={`font-semibold px-3.5 py-2 rounded-xl text-xs border transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}
                        >
                            Front Desk View &rarr;
                        </Link>
                        <button
                            onClick={() => setShowSettingsModal(true)}
                            className={`font-semibold px-3.5 py-2 rounded-xl text-xs border transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'}`}
                        >
                            ⚙️ Settings
                        </button>
                        <button
                            onClick={requestLogout}
                            className="bg-rose-600 hover:bg-rose-500 text-white font-semibold px-3.5 py-2 rounded-xl text-xs shadow transition-all cursor-pointer"
                        >
                            Sign Out
                        </button>
                    </div>
                </div>

                <div className={`max-w-7xl mx-auto px-6 flex gap-6 border-t pt-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                    <button
                        onClick={() => { setActiveTab('vehicles'); setSelectedVehicle(null); }}
                        className={`pb-3 text-xs font-bold tracking-wider uppercase border-b-2 cursor-pointer transition-all ${activeTab === 'vehicles' ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        🚗 Active Vehicles ({vehicles.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('staff')}
                        className={`pb-3 text-xs font-bold tracking-wider uppercase border-b-2 cursor-pointer transition-all ${activeTab === 'staff' ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        👥 Staff Governance ({staffUsers.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('trash')}
                        className={`pb-3 text-xs font-bold tracking-wider uppercase border-b-2 cursor-pointer transition-all ${activeTab === 'trash' ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-slate-200'
                            }`}
                    >
                        🗑️ Archive / Trash ({deletedVehicles.length})
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 py-8">
                {activeTab === 'vehicles' && (
                    selectedVehicle ? (
                        <div>
                            <button
                                onClick={() => setSelectedVehicle(null)}
                                className="mb-6 text-xs font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                                &larr; Back to Admin Vehicle Directory
                            </button>

                            <div className={`rounded-3xl border p-8 mb-8 shadow-xl ${isDark ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                                <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <h2 className="text-3xl font-black">{selectedVehicle.plate_number}</h2>
                                            <span className="px-3.5 py-1 rounded-full text-xs font-bold uppercase bg-purple-950 text-purple-300 border border-purple-800/60">
                                                {selectedVehicle.status.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                        <p className="text-slate-400 mt-1 font-medium text-sm">{selectedVehicle.make_model_year} • VIN: {selectedVehicle.chassis_number}</p>
                                    </div>

                                    <div className={`flex items-center gap-2 p-2.5 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider pl-2">Override Status:</span>
                                        <select
                                            value={selectedVehicle.status}
                                            onChange={(e) => requestStatusOverride(e.target.value)}
                                            className={`border text-xs font-bold rounded-xl px-3 py-1.5 focus:outline-none cursor-pointer ${isDark ? 'bg-slate-900 border-slate-700 text-purple-300' : 'bg-white border-slate-300 text-purple-700'}`}
                                        >
                                            <option value="intake">Intake</option>
                                            <option value="pending_before_photos">Pending Before Photos</option>
                                            <option value="in_repair">In Repair</option>
                                            <option value="pending_after_photos">Pending After Photos</option>
                                            <option value="road_ready">Road Ready</option>
                                        </select>
                                    </div>
                                </div>

                                <div className={`grid grid-cols-1 md:grid-cols-4 gap-4 py-6 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                                    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Intake Cost</p>
                                        <p className="text-xl font-black mt-1">RM {selectedVehicle.intake_cost?.toLocaleString()}</p>
                                    </div>
                                    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Market Value</p>
                                        <p className="text-xl font-black mt-1">RM {selectedVehicle.market_value?.toLocaleString()}</p>
                                    </div>
                                    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Repair Cost</p>
                                        <p className="text-xl font-black mt-1">RM {selectedVehicle.repair_cost?.toLocaleString()}</p>
                                    </div>
                                    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Est. Margin / Net</p>
                                        <p className="text-xl font-black text-emerald-400 mt-1">
                                            RM {((selectedVehicle.market_value || 0) - (selectedVehicle.intake_cost || 0) - (selectedVehicle.repair_cost || 0)).toLocaleString()}
                                        </p>
                                    </div>
                                </div>

                                <div className="pt-6">
                                    <h3 className="text-sm font-bold uppercase tracking-wider mb-4">1. Front Desk Verified Documents</h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {['grant', 'jpj', 'insurance', 'ber'].map((cat) => {
                                            const doc = mediaItems.find(m => m.media_type === 'document' && m.category === cat)
                                            const docLabel =
                                                cat === 'grant' ? 'Vehicle Grant (VOC)' :
                                                    cat === 'jpj' ? 'JPJ Inspection' :
                                                        cat === 'insurance' ? 'Insurance & Roadtax' : 'BER Form'

                                            return (
                                                <div key={cat} className={`border rounded-2xl p-4 flex flex-col justify-between ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                    <div>
                                                        <p className="text-xs font-bold uppercase tracking-wider mb-1">{docLabel}</p>
                                                        <p className={`text-[11px] font-semibold mb-4 ${doc ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                            {doc ? '✓ Verified File Attached' : 'Not Uploaded'}
                                                        </p>
                                                    </div>
                                                    {doc && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewMedia({ url: doc.file_url, title: `${selectedVehicle.plate_number} - ${docLabel}` })}
                                                            className={`w-full text-center py-2 rounded-xl text-xs font-bold transition-colors border cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700' : 'bg-white hover:bg-slate-100 text-purple-700 border-slate-300'}`}
                                                        >
                                                            Inspect Document &rarr;
                                                        </button>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div className="pt-8">
                                    <h3 className="text-sm font-bold uppercase tracking-wider mb-4">2. Technician Evidence Audit (8 Angles)</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {PHOTO_CATEGORIES.map((cat) => {
                                            const before = mediaItems.find(m => m.media_type === 'photo_before' && m.category === cat.key)
                                            const after = mediaItems.find(m => m.media_type === 'photo_after' && m.category === cat.key)

                                            return (
                                                <div key={cat.key} className={`border rounded-2xl p-4 ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                    <p className="text-xs font-bold uppercase tracking-wider mb-3">{cat.label}</p>
                                                    <div className="grid grid-cols-2 gap-3 text-center">
                                                        <div className={`border rounded-xl p-3 flex flex-col justify-between ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                                                            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-2">Before Repair</p>
                                                            {before ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPreviewMedia({ url: before.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (Before)` })}
                                                                    className={`w-full py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-emerald-400 border-slate-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'}`}
                                                                >
                                                                    Inspect Photo
                                                                </button>
                                                            ) : (
                                                                <span className="text-[11px] text-slate-500 italic">Missing</span>
                                                            )}
                                                        </div>

                                                        <div className={`border rounded-xl p-3 flex flex-col justify-between ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                                                            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">After Repair</p>
                                                            {after ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setPreviewMedia({ url: after.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (After)` })}
                                                                    className={`w-full py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-blue-400 border-slate-700' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'}`}
                                                                >
                                                                    Inspect Photo
                                                                </button>
                                                            ) : (
                                                                <span className="text-[11px] text-slate-500 italic">Missing</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {additionalPhotos.length > 0 && (
                                    <div className="pt-8">
                                        <h3 className="text-sm font-bold text-purple-300 uppercase tracking-wider mb-4">3. Additional Evidence Photos ({additionalPhotos.length})</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                            {additionalPhotos.map((item) => {
                                                const displayTitle = item.category.replace(/^extra_/, '').replace(/_[0-9]+$/, '').replace(/_/g, ' ')
                                                return (
                                                    <div key={item.id} className={`border rounded-2xl p-4 flex flex-col justify-between ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                        <div>
                                                            <p className="text-xs font-bold text-purple-300 uppercase tracking-wider mb-1 capitalize">{displayTitle}</p>
                                                            <p className="text-[11px] font-semibold text-emerald-400 mb-4">✓ Extra Evidence Photo</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setPreviewMedia({ url: item.file_url, title: `${selectedVehicle.plate_number} - ${displayTitle}` })}
                                                            className={`w-full text-center py-2 rounded-xl text-xs font-bold transition-colors border cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700' : 'bg-white hover:bg-slate-100 text-purple-700 border-slate-300'}`}
                                                        >
                                                            Inspect Photo &rarr;
                                                        </button>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-black">Active Vehicle Registry</h2>
                                    <p className="text-xs text-slate-400 font-medium mt-0.5">Supervise all active cases, inspect documentation, and perform status overrides.</p>
                                </div>
                            </div>

                            <div className={`border rounded-2xl overflow-hidden shadow-xl ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                                {loading ? (
                                    <div className="p-16 text-center text-slate-500 font-medium">Loading vehicle inventory...</div>
                                ) : vehicles.length === 0 ? (
                                    <div className="p-16 text-center text-slate-500 font-medium">No active vehicles found in registry.</div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className={`text-[11px] uppercase font-bold tracking-wider border-b ${isDark ? 'bg-slate-950/80 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                    <th className="p-4">Plate Number</th>
                                                    <th className="p-4">Make / Model / Year</th>
                                                    <th className="p-4">Status</th>
                                                    <th className="p-4">Intake Cost</th>
                                                    <th className="p-4">Market Value</th>
                                                    <th className="p-4 text-right">Admin Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className={`divide-y text-xs font-medium ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-100 text-slate-700'}`}>
                                                {vehicles.map((v) => (
                                                    <tr key={v.id} className={`transition-colors ${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                                                        <td className="p-4 font-bold text-purple-400">{v.plate_number}</td>
                                                        <td className="p-4">{v.make_model_year}</td>
                                                        <td className="p-4">
                                                            <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase bg-purple-950 text-purple-300 border border-purple-800/60">
                                                                {v.status.replace(/_/g, ' ')}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 font-bold">RM {v.intake_cost?.toLocaleString()}</td>
                                                        <td className="p-4 font-bold">RM {v.market_value?.toLocaleString()}</td>
                                                        <td className="p-4 text-right">
                                                            <div className="flex justify-end gap-2">
                                                                <button
                                                                    onClick={() => setSelectedVehicle(v)}
                                                                    className="bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800/80 px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer"
                                                                >
                                                                    Inspect Case &rarr;
                                                                </button>
                                                                <button
                                                                    onClick={() => requestSoftDeleteVehicle(v)}
                                                                    className="bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-900 px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer"
                                                                >
                                                                    Archive
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                )}

                {activeTab === 'staff' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-2xl font-black">Staff Account Governance</h2>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">Manage staff authority roles (`admin`, `front_desk`, `technician`, `bidder`).</p>
                            </div>
                        </div>

                        <div className={`border rounded-2xl overflow-hidden shadow-xl ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className={`text-[11px] uppercase font-bold tracking-wider border-b ${isDark ? 'bg-slate-950/80 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                            <th className="p-4">Staff Member</th>
                                            <th className="p-4">Username</th>
                                            <th className="p-4">Email</th>
                                            <th className="p-4">Current Role</th>
                                            <th className="p-4">Change Role Authority</th>
                                        </tr>
                                    </thead>
                                    <tbody className={`divide-y text-xs font-medium ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-100 text-slate-700'}`}>
                                        {staffUsers.map((u) => (
                                            <tr key={u.id} className={`transition-colors ${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                                                <td className="p-4 font-bold">{u.full_name || 'Staff Member'}</td>
                                                <td className="p-4 text-purple-400 font-mono">{u.username}</td>
                                                <td className="p-4">{u.email || 'N/A'}</td>
                                                <td className="p-4">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${u.role === 'admin'
                                                            ? 'bg-purple-950 text-purple-300 border-purple-800'
                                                            : u.role === 'technician'
                                                                ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                                                : 'bg-blue-950 text-blue-300 border-blue-800'
                                                        }`}>
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td className="p-4">
                                                    <select
                                                        value={u.role}
                                                        onChange={(e) => requestRoleChange(u.id, e.target.value, u.username)}
                                                        className={`border text-xs font-bold rounded-xl px-3 py-1.5 focus:outline-none cursor-pointer ${isDark ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'}`}
                                                    >
                                                        <option value="admin">Admin</option>
                                                        <option value="front_desk">Front Desk</option>
                                                        <option value="technician">Technician</option>
                                                        <option value="bidder">Bidder</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'trash' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-2xl font-black">Archived Vehicles Trash Bin</h2>
                                <p className="text-xs text-slate-400 font-medium mt-0.5">Soft-deleted vehicles are stored here and can be restored anytime.</p>
                            </div>
                        </div>

                        <div className={`border rounded-2xl overflow-hidden shadow-xl ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                            {deletedVehicles.length === 0 ? (
                                <div className="p-16 text-center text-slate-500 font-medium">Trash bin is clean. No archived vehicles.</div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className={`text-[11px] uppercase font-bold tracking-wider border-b ${isDark ? 'bg-slate-950/80 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                <th className="p-4">Plate Number</th>
                                                <th className="p-4">Make / Model / Year</th>
                                                <th className="p-4">Last Known Status</th>
                                                <th className="p-4 text-right">Restore Action</th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y text-xs font-medium ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-100 text-slate-700'}`}>
                                            {deletedVehicles.map((v) => (
                                                <tr key={v.id} className={`transition-colors ${isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}`}>
                                                    <td className="p-4 font-bold text-rose-400">{v.plate_number}</td>
                                                    <td className="p-4">{v.make_model_year}</td>
                                                    <td className="p-4 capitalize text-slate-400">{v.status.replace(/_/g, ' ')}</td>
                                                    <td className="p-4 text-right">
                                                        <button
                                                            onClick={() => executeRestoreVehicle(v.id)}
                                                            className="bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 px-3 py-1.5 rounded-xl font-bold transition-colors cursor-pointer"
                                                        >
                                                            Restore Vehicle ↺
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    )
}