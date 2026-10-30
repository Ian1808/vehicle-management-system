"use client"

import { useState } from 'react'

export type AccountSettingsPayload = {
    fullName: string
    username: string
    oldPassword: string
    newPassword: string
    confirmPassword: string
}

type AccountSettingsModalProps = {
    isDark: boolean
    theme: 'dark' | 'light'
    setTheme: (t: 'dark' | 'light') => void
    title: string
    subtitle: string
    email: string
    username: string
    fullName: string
    accent?: 'blue' | 'purple'
    role?: string
    companyName?: string
    showLandingModule?: boolean
    onClose: () => void
    onSave: (payload: AccountSettingsPayload) => Promise<{ ok: boolean; error?: string }>
}

const ACCENT_STYLES = {
    blue: {
        active: 'bg-blue-600 text-white border-blue-500 shadow-md',
        ring: 'focus:ring-blue-500',
        hover: 'hover:text-blue-500',
    },
    purple: {
        active: 'bg-purple-600 text-white border-purple-500 shadow-md',
        ring: 'focus:ring-purple-500',
        hover: 'hover:text-purple-500',
    },
} as const

export default function AccountSettingsModal({
    isDark,
    theme,
    setTheme,
    title,
    subtitle,
    email,
    username,
    fullName,
    accent = 'blue',
    role,
    companyName,
    showLandingModule = false,
    onClose,
    onSave,
}: AccountSettingsModalProps) {
    const accentStyles = ACCENT_STYLES[accent]

    const [fullNameInput, setFullNameInput] = useState(fullName)
    const [usernameInput, setUsernameInput] = useState(username)
    const [landingModule, setLandingModule] = useState(() => (typeof window !== 'undefined' ? window.localStorage.getItem('vms-landing-module') || '' : ''))
    const [oldPassword, setOldPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmNewPassword, setConfirmNewPassword] = useState('')
    const [showOldPassword, setShowOldPassword] = useState(false)
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const inputClass = `w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 ${accentStyles.ring} focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`
    const disabledClass = `w-full border rounded-xl p-3 text-xs font-medium cursor-not-allowed ${isDark ? 'bg-slate-950 border-slate-800 text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-500'}`
    const labelClass = `block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`
    const smallLabelClass = `block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        if (newPassword.trim() && newPassword !== confirmNewPassword) {
            setError('New passwords do not match.')
            return
        }
        setSaving(true)
        const result = await onSave({
            fullName: fullNameInput,
            username: usernameInput.trim(),
            oldPassword,
            newPassword,
            confirmPassword: confirmNewPassword,
        })
        setSaving(false)
        if (result.ok) {
            if (showLandingModule) {
                window.localStorage.setItem('vms-landing-module', landingModule)
            }
            onClose()
        }
        else setError(result.error || 'Failed to update settings.')
    }

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
            <div className={`border rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
                        <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>
                    </div>
                    <button onClick={onClose} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {(role || companyName) && (
                        <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Signed In As</label>
                            <div className="flex flex-wrap gap-2">
                                {role && (
                                    <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${isDark ? 'bg-slate-900 text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-slate-200'}`}>
                                        {role.replace('_', ' ')}
                                    </span>
                                )}
                                {companyName && (
                                    <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${isDark ? 'bg-slate-900 text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-slate-200'}`}>
                                        🏢 {companyName}
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                        <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Interface Theme Mode</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setTheme('light')}
                                className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'light' ? accentStyles.active : isDark ? 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                            >
                                ☀️ Day Mode
                            </button>
                            <button
                                type="button"
                                onClick={() => setTheme('dark')}
                                className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'dark' ? accentStyles.active : isDark ? 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                            >
                                🌙 Night Mode
                            </button>
                        </div>
                    </div>

                    {showLandingModule && (
                        <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                            <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Default Landing Module</label>
                            <p className={`text-[10px] mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Which module to open first after signing in.</p>
                            <select value={landingModule} onChange={(e) => setLandingModule(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-bold cursor-pointer ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
                                <option value="">Admin Hub (Default)</option>
                                <option value="manager">Manager Dashboard</option>
                                <option value="panels">Panel Banks & Insurance</option>
                                <option value="staff">Staff Management</option>
                                <option value="frontdesk">Front Desk</option>
                                <option value="technician">Technician Portal</option>
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className={labelClass}>Email (Locked)</label>
                            <input type="text" disabled value={email} className={disabledClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Username (Login Handle)</label>
                            <input type="text" required value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)} className={inputClass} />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>Full Name *</label>
                        <input type="text" required value={fullNameInput} onChange={(e) => setFullNameInput(e.target.value)} className={inputClass} />
                    </div>

                    <div className={`pt-4 border-t space-y-3 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Change Password (Optional)</h4>

                        <div>
                            <label className={smallLabelClass}>Current Password</label>
                            <div className="relative">
                                <input
                                    type={showOldPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={oldPassword}
                                    onChange={(e) => setOldPassword(e.target.value)}
                                    className={`${inputClass} pr-10`}
                                />
                                <button type="button" onClick={() => setShowOldPassword(!showOldPassword)} className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer ${isDark ? 'text-slate-400 ' + accentStyles.hover : 'text-slate-500 ' + accentStyles.hover}`}>
                                    {showOldPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className={smallLabelClass}>New Password</label>
                            <div className="relative">
                                <input
                                    type={showNewPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className={`${inputClass} pr-10`}
                                />
                                <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer ${isDark ? 'text-slate-400 ' + accentStyles.hover : 'text-slate-500 ' + accentStyles.hover}`}>
                                    {showNewPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className={smallLabelClass}>Confirm New Password</label>
                            <div className="relative">
                                <input
                                    type={showConfirmPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    value={confirmNewPassword}
                                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                                    className={`${inputClass} pr-10`}
                                />
                                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer ${isDark ? 'text-slate-400 ' + accentStyles.hover : 'text-slate-500 ' + accentStyles.hover}`}>
                                    {showConfirmPassword ? '🙈' : '👁️'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                        <div className="flex items-center gap-2.5 mb-2">
                            <span className="text-base">🚗</span>
                            <div>
                                <label className={`block text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>About This App</label>
                                <p className={`text-[10px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Vehicle Management System · Version 0.1.0</p>
                            </div>
                        </div>
                        <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                            Multi-company workshop operations platform for vehicle intake, photo evidence, OCR grant scanning, panel banks &amp; insurance, financial overviews and role-based dashboards — used by Admin, Manager, Staff, Front Desk and Technician.
                        </p>
                        <div className={`mt-3 pt-3 border-t flex flex-col gap-1.5 text-[11px] ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                            <div className="flex justify-between gap-2">
                                <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>Built with</span>
                                <span className={`font-semibold ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>Next.js · Supabase · Gemini OCR</span>
                            </div>
                            <div className="flex justify-between gap-2">
                                <span className={`shrink-0 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Repository</span>
                                <a
                                    href="https://github.com/Ian1808/vehicle-management-system"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`font-semibold truncate underline decoration-dotted underline-offset-2 ${accent === 'blue' ? 'text-blue-400' : 'text-purple-400'} hover:opacity-80`}
                                >
                                    github.com/Ian1808/vehicle-management-system
                                </a>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className={`px-4 py-3 rounded-2xl border text-xs font-bold ${isDark ? 'bg-rose-950 border-rose-800 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                            ⚠️ {error}
                        </div>
                    )}

                    <div className={`flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <button type="button" onClick={onClose} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}>Cancel</button>
                        <button type="submit" disabled={saving} className={`px-5 py-2.5 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-60 ${accent === 'blue' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'}`}>
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
