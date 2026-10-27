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
    is_deleted?: boolean
    created_at: string
}

type UserProfile = {
    id: string
    username: string
    full_name: string
    role: string
    last_sign_in_at?: string
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

export default function AdminHub() {
    const [activeTab, setActiveTab] = useState<'vehicles' | 'users' | 'trash'>('vehicles')
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [deletedVehicles, setDeletedVehicles] = useState<Vehicle[]>([])
    const [users, setUsers] = useState<UserProfile[]>([])
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
                showToast('Access Denied: Restricted to system administrators.', 'error')
                setTimeout(() => { window.location.href = '/' }, 1500)
                return
            }

            setSettingsFullName(userData.full_name || '')
            setSettingsUsername(userData.username || '')

            fetchAllData()
        }
        checkAdminAccess()
    }, [])

    async function fetchAllData() {
        setLoading(true)
        await Promise.all([
            fetchVehicles(),
            fetchDeletedVehicles(),
            fetchUsers()
        ])
        setLoading(false)
    }

    async function fetchVehicles() {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })

        if (error) showToast(error.message, 'error')
        else setVehicles(data || [])
    }

    async function fetchDeletedVehicles() {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .eq('is_deleted', true)
            .order('created_at', { ascending: false })

        if (error) showToast(error.message, 'error')
        else setDeletedVehicles(data || [])
    }

    async function fetchUsers() {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('full_name', { ascending: true })

        if (error) showToast(error.message, 'error')
        else setUsers(data || [])
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

            showToast('Admin settings & security updated successfully!', 'success')
            setShowSettingsModal(false)
        } catch (err: any) {
            showToast(err.message || 'Failed to update settings.', 'error')
        }
    }

    async function handleUpdateUserRole(userId: string, newRole: string) {
        setConfirmModal({
            title: 'Confirm Role Change',
            message: `Are you sure you want to change this user's role to "${newRole.toUpperCase()}"?`,
            confirmText: 'Update Role',
            confirmVariant: 'success',
            onConfirm: async () => {
                setConfirmModal(null)
                const { error } = await supabase
                    .from('users')
                    .update({ role: newRole })
                    .eq('id', userId)

                if (error) {
                    showToast('Error updating role: ' + error.message, 'error')
                } else {
                    showToast('User role updated successfully!', 'success')
                    fetchUsers()
                }
            }
        })
    }

    async function handleStatusOverride(vehicleId: string, newStatus: string) {
        const { error } = await supabase
            .from('vehicles')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', vehicleId)

        if (error) {
            showToast('Error overriding status: ' + error.message, 'error')
        } else {
            showToast(`Status overridden to: ${newStatus.replace(/_/g, ' ').toUpperCase()}`, 'success')
            if (selectedVehicle) {
                setSelectedVehicle({ ...selectedVehicle, status: newStatus })
            }
            fetchVehicles()
        }
    }

    async function handleSoftDelete(vehicleId: string, plate: string) {
        setConfirmModal({
            title: 'Confirm Soft Delete',
            message: `Are you sure you want to move vehicle "${plate}" to trash?`,
            confirmText: 'Move to Trash',
            confirmVariant: 'danger',
            onConfirm: async () => {
                setConfirmModal(null)
                const { error } = await supabase
                    .from('vehicles')
                    .update({ is_deleted: true })
                    .eq('id', vehicleId)

                if (error) {
                    showToast('Error deleting vehicle: ' + error.message, 'error')
                } else {
                    showToast('Vehicle moved to trash.', 'success')
                    if (selectedVehicle?.id === vehicleId) setSelectedVehicle(null)
                    fetchAllData()
                }
            }
        })
    }

    async function handleRestoreVehicle(vehicleId: string) {
        const { error } = await supabase
            .from('vehicles')
            .update({ is_deleted: false })
            .eq('id', vehicleId)

        if (error) {
            showToast('Error restoring vehicle: ' + error.message, 'error')
        } else {
            showToast('Vehicle restored successfully!', 'success')
            fetchAllData()
        }
    }

    async function handleDownload(url: string, title: string) {
        try {
            showToast('Preparing download...', 'success')
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

    function requestLogout() {
        setConfirmModal({
            title: 'Confirm Sign Out',
            message: 'Are you sure you want to sign out of the Admin Hub?',
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

    const isDark = theme === 'dark'

    return (
        <div className={`min-h-screen pb-16 relative selection:bg-purple-500 selection:text-white ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
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

            {/* Settings Modal */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
                    <div className={`border rounded-3xl shadow-2xl max-w-md w-full p-8 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Admin Account Settings</h3>
                                <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Manage appearance, profile, and master credentials.</p>
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
                                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
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
                        <div className="w-9 h-9 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 font-black text-base">
                            👑
                        </div>
                        <div>
                            <h1 className="text-base font-extrabold tracking-tight">System Admin Control Hub</h1>
                            <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Master Supervision, Financials & Staff Governance</p>
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
                        <Link
                            href="/technician"
                            className={`font-bold px-3.5 py-2 rounded-xl text-xs border transition-all ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-emerald-300 border-slate-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'}`}
                        >
                            🔧 Technician Portal &rarr;
                        </Link>
                        <button
                            onClick={() => setShowSettingsModal(true)}
                            className={`font-semibold px-3.5 py-2 rounded-xl text-xs border transition-all cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'}`}
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
                {/* Navigation Tabs */}
                <div className="flex gap-3 mb-8 border-b pb-4 border-slate-800/40">
                    <button
                        onClick={() => { setActiveTab('vehicles'); setSelectedVehicle(null); }}
                        className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer border ${activeTab === 'vehicles'
                                ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                                : isDark ? 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                    >
                        🚗 Vehicle Master Registry ({vehicles.length})
                    </button>
                    <button
                        onClick={() => { setActiveTab('users'); setSelectedVehicle(null); }}
                        className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer border ${activeTab === 'users'
                                ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                                : isDark ? 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                    >
                        👥 Staff & User Management ({users.length})
                    </button>
                    <button
                        onClick={() => { setActiveTab('trash'); setSelectedVehicle(null); }}
                        className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer border ${activeTab === 'trash'
                                ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                                : isDark ? 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                    >
                        🗑️ Trash / Recovery ({deletedVehicles.length})
                    </button>
                </div>

                {/* TAB 1: VEHICLES MANAGEMENT */}
                {activeTab === 'vehicles' && !selectedVehicle && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Vehicle Fleet Supervisory Registry</h2>
                                <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Click any vehicle to inspect financials, technician before/after photo evidence, and perform status overrides.</p>
                            </div>
                        </div>

                        {loading ? (
                            <div className="p-16 text-center text-slate-500 font-medium">Loading fleet database...</div>
                        ) : vehicles.length === 0 ? (
                            <div className={`p-16 text-center rounded-3xl border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'}`}>
                                No vehicles found in the master registry.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {vehicles.map((v) => (
                                    <div
                                        key={v.id}
                                        onClick={() => selectVehicle(v)}
                                        className={`border rounded-3xl p-6 cursor-pointer transition-all hover:shadow-xl flex flex-col justify-between ${isDark
                                                ? 'bg-slate-950 border-slate-800 hover:border-purple-500/80'
                                                : 'bg-white border-slate-200 hover:border-purple-500/80 hover:shadow-md'
                                            }`}
                                    >
                                        <div>
                                            <div className="flex justify-between items-start mb-3">
                                                <h3 className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-blue-950'}`}>{v.plate_number}</h3>
                                                <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-950 text-purple-300 border border-purple-800/60">
                                                    {v.status.replace(/_/g, ' ')}
                                                </span>
                                            </div>
                                            <p className={`text-xs font-semibold mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{v.make_model_year}</p>

                                            <div className="grid grid-cols-2 gap-2 mb-4">
                                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400">Intake Cost</p>
                                                    <p className="text-xs font-black text-rose-400">RM {Number(v.intake_cost || 0).toLocaleString()}</p>
                                                </div>
                                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400">Market Value</p>
                                                    <p className="text-xs font-black text-emerald-400">RM {Number(v.market_value || 0).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                                            >
                                                Inspect Case File &rarr;
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleSoftDelete(v.id, v.plate_number); }}
                                                className="bg-rose-950 hover:bg-rose-900 text-rose-300 px-3 py-2.5 rounded-xl text-xs font-bold border border-rose-900 cursor-pointer"
                                                title="Move to Trash"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* VEHICLE DETAIL & EVIDENCE AUDIT INSPECTOR */}
                {activeTab === 'vehicles' && selectedVehicle && (
                    <div>
                        <button
                            onClick={() => setSelectedVehicle(null)}
                            className={`mb-6 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer px-3.5 py-2 rounded-xl border w-fit shadow-xs ${isDark ? 'bg-slate-950 text-purple-400 hover:text-purple-300 border-slate-800' : 'bg-white text-purple-600 hover:text-purple-700 border-slate-200'}`}
                        >
                            &larr; Back to Fleet Registry
                        </button>

                        {/* Vehicle Header Overview & Admin Status Override */}
                        <div className={`rounded-3xl border p-8 mb-8 shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="text-3xl font-black tracking-tight">{selectedVehicle.plate_number}</h2>
                                        <span className="px-3.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-950 text-purple-300 border border-purple-800/60">
                                            {selectedVehicle.status.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                    <p className="text-xs font-semibold text-slate-400 mt-1">{selectedVehicle.make_model_year} • VIN: {selectedVehicle.chassis_number}</p>
                                </div>

                                {/* Admin Status Override Selector */}
                                <div className={`p-4 rounded-2xl border flex items-center gap-3 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                    <span className="text-xs font-black uppercase text-purple-400">Admin Override Status:</span>
                                    <select
                                        value={selectedVehicle.status}
                                        onChange={(e) => handleStatusOverride(selectedVehicle.id, e.target.value)}
                                        className={`border rounded-xl p-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                                    >
                                        <option value="pending_before_photos">Pending Before Photos</option>
                                        <option value="in_repair">In Repair</option>
                                        <option value="pending_after_photos">Pending After Photos</option>
                                        <option value="road_ready">Road Ready</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Evidence & Photo Audit Grids */}
                        <div className="space-y-8">
                            {/* BEFORE PHOTOS */}
                            <div className={`rounded-3xl border p-8 shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                                <h3 className="text-sm font-extrabold uppercase tracking-wider mb-6 pb-4 border-b border-slate-800/50">
                                    Technician "Before" Photos ({mediaItems.filter(m => m.media_type === 'photo_before').length}/8 Captured)
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {PHOTO_CATEGORIES.map((cat) => {
                                        const uploaded = mediaItems.find(m => m.category === cat.key && m.media_type === 'photo_before')
                                        return (
                                            <div key={cat.key} className={`border rounded-2xl p-4 flex flex-col justify-between ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                <div>
                                                    <p className="text-xs font-extrabold uppercase tracking-wider mb-1">{cat.label}</p>
                                                    <p className={`text-xs font-semibold mb-4 ${uploaded ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {uploaded ? '✓ Captured' : 'Missing'}
                                                    </p>
                                                </div>
                                                {uploaded && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewMedia({ url: uploaded.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (Before)` })}
                                                        className="w-full text-center bg-slate-800 hover:bg-slate-700 text-purple-300 py-2 rounded-xl text-xs font-bold transition-colors border border-slate-700 cursor-pointer"
                                                    >
                                                        View Photo
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* AFTER PHOTOS */}
                            <div className={`rounded-3xl border p-8 shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                                <h3 className="text-sm font-extrabold uppercase tracking-wider mb-6 pb-4 border-b border-slate-800/50">
                                    Technician "After" Photos ({mediaItems.filter(m => m.media_type === 'photo_after').length}/8 Captured)
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {PHOTO_CATEGORIES.map((cat) => {
                                        const uploaded = mediaItems.find(m => m.category === cat.key && m.media_type === 'photo_after')
                                        return (
                                            <div key={cat.key} className={`border rounded-2xl p-4 flex flex-col justify-between ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                <div>
                                                    <p className="text-xs font-extrabold uppercase tracking-wider mb-1">{cat.label}</p>
                                                    <p className={`text-xs font-semibold mb-4 ${uploaded ? 'text-blue-400' : 'text-slate-500'}`}>
                                                        {uploaded ? '✓ Captured' : 'Pending / Not Yet Captured'}
                                                    </p>
                                                </div>
                                                {uploaded && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewMedia({ url: uploaded.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (After)` })}
                                                        className="w-1/2 text-center bg-slate-800 hover:bg-slate-700 text-blue-300 py-2 rounded-xl text-xs font-bold transition-colors border border-slate-700 cursor-pointer"
                                                    >
                                                        View Photo
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB 2: USER & STAFF MANAGEMENT */}
                {activeTab === 'users' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Staff Account & Role Governance</h2>
                                <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Modify staff roles between Administrator, Front Desk, and Workshop Technician.</p>
                            </div>
                        </div>

                        <div className={`rounded-3xl border overflow-hidden shadow-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className={`border-b text-xs font-extrabold uppercase tracking-wider ${isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                                            <th className="p-4">Full Name</th>
                                            <th className="p-4">Username / ID</th>
                                            <th className="p-4">Current Role</th>
                                            <th className="p-4 text-right">Change Role</th>
                                        </tr>
                                    </thead>
                                    <tbody className={`divide-y text-xs font-medium ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-200 text-slate-700'}`}>
                                        {users.map((u) => (
                                            <tr key={u.id} className={`transition-colors ${isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'}`}>
                                                <td className={`p-4 font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.full_name || 'N/A'}</td>
                                                <td className="p-4 font-mono text-slate-400">{u.username || u.id}</td>
                                                <td className="p-4">
                                                    <span className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-purple-950 text-purple-300 border border-purple-800/60">
                                                        {u.role}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-right">
                                                    <select
                                                        value={u.role}
                                                        onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                                        className={`border rounded-xl p-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                                                    >
                                                        <option value="admin">admin</option>
                                                        <option value="front_desk">front_desk</option>
                                                        <option value="technician">technician</option>
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

                {/* TAB 3: TRASH / RECOVERY */}
                {activeTab === 'trash' && (
                    <div>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Archived / Deleted Vehicles</h2>
                                <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Restore accidentally deleted vehicle cases back into the active fleet registry.</p>
                            </div>
                        </div>

                        {deletedVehicles.length === 0 ? (
                            <div className={`p-16 text-center rounded-3xl border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'}`}>
                                Trash is completely empty.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {deletedVehicles.map((v) => (
                                    <div key={v.id} className={`border rounded-3xl p-6 flex flex-col justify-between ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                                        <div>
                                            <h3 className={`text-lg font-black tracking-tight mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{v.plate_number}</h3>
                                            <p className={`text-xs font-semibold mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{v.make_model_year}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRestoreVehicle(v.id)}
                                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                                        >
                                            Restore Vehicle &rarr;
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}