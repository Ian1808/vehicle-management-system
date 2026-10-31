"use client"

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { createClient } from '@/utils/supabase/client'

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

type ChangePasswordButtonProps = {
    isDark: boolean
    accent?: 'blue' | 'purple'
    onToast?: (message: string, type: 'success' | 'error') => void
}

/**
 * Universal Change Password button + modal.
 * Works anywhere: it always changes the CURRENTLY LOGGED IN user's password.
 * Verifies the current password by signing in, then updates the auth password.
 */
export default function ChangePasswordButton({ isDark, accent = 'blue', onToast }: ChangePasswordButtonProps) {
    const accentStyles = ACCENT_STYLES[accent]
    const [open, setOpen] = useState(false)
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showText, setShowText] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState(false)
    const [saving, setSaving] = useState(false)

    const inputClass = `w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 ${accentStyles.ring} focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`
    const labelClass = `block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`

    function reset() {
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        setShowText(false)
        setError('')
        setSuccess(false)
    }

    function close() {
        reset()
        setOpen(false)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        // This modal is rendered inside other modals' <form> elements in the React tree;
        // stop the synthetic submit event from bubbling up and triggering the parent form.
        e.stopPropagation()
        setError('')
        setSuccess(false)
        if (!currentPassword.trim()) {
            setError('Enter your current password.')
            return
        }
        if (!newPassword.trim()) {
            setError('Enter a new password.')
            return
        }
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.')
            return
        }
        setSaving(true)
        try {
            const supabase = createClient()
            const { data: { user }, error: userError } = await supabase.auth.getUser()
            if (userError || !user?.email) {
                setError('Not signed in.')
                setSaving(false)
                return
            }
            // Verify the current password before allowing the change.
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: user.email,
                password: currentPassword.trim(),
            })
            if (signInError) {
                setError('Incorrect current password.')
                setSaving(false)
                return
            }
            const { error: updateError } = await supabase.auth.updateUser({ password: newPassword.trim() })
            if (updateError) {
                setError(updateError.message)
                setSaving(false)
                return
            }
            setSaving(false)
            setSuccess(true)
            onToast?.('Password updated successfully.', 'success')
            setTimeout(() => close(), 900)
        } catch (err) {
            setSaving(false)
            setError(err instanceof Error ? err.message : 'Failed to update password.')
        }
    }

    return (
        <>
            <button
                type="button"
                onClick={() => { reset(); setOpen(true) }}
                className={`w-full border-2 border-dashed rounded-2xl px-4 py-3 text-xs font-bold transition-colors cursor-pointer ${isDark ? 'border-slate-700 text-slate-300 hover:border-purple-500 hover:text-purple-300 bg-slate-950' : 'border-slate-200 text-slate-600 hover:border-purple-400 hover:text-purple-600 bg-slate-50'}`}
            >
                🔑 Change Password
            </button>

            {open && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[70] overflow-y-auto py-10">
                    <div className={`border rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>🔑 Change Password</h3>
                                <p className={`text-xs mt-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Changes the password for the account you are signed in as.</p>
                            </div>
                            <button onClick={close} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}>&times;</button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-3">
                            <div>
                                <label className={labelClass}>Current Password</label>
                                <div className="relative">
                                    <input
                                        type={showText ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className={`${inputClass} pr-10`}
                                        autoFocus
                                    />
                                    <button type="button" onClick={() => setShowText(!showText)} className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer ${isDark ? 'text-slate-400 ' + accentStyles.hover : 'text-slate-500 ' + accentStyles.hover}`}>
                                        {showText ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>New Password</label>
                                <div className="relative">
                                    <input
                                        type={showText ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className={`${inputClass} pr-10`}
                                    />
                                    <button type="button" onClick={() => setShowText(!showText)} className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs cursor-pointer ${isDark ? 'text-slate-400 ' + accentStyles.hover : 'text-slate-500 ' + accentStyles.hover}`}>
                                        {showText ? '🙈' : '👁️'}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Confirm New Password</label>
                                <input type={showText ? 'text' : 'password'} placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={inputClass} />
                            </div>

                            {error && (
                                <div className={`px-4 py-3 rounded-2xl border text-xs font-bold ${isDark ? 'bg-rose-950 border-rose-800 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                                    ⚠️ {error}
                                </div>
                            )}
                            {success && (
                                <div className={`px-4 py-3 rounded-2xl border text-xs font-bold ${isDark ? 'bg-emerald-950 border-emerald-800 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
                                    ✅ Password updated successfully.
                                </div>
                            )}

                            <div className={`flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                                <button type="button" onClick={close} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}>Cancel</button>
                                <button type="submit" disabled={saving} className={`px-5 py-2.5 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-60 ${accentStyles.active}`}>
                                    {saving ? 'Updating…' : 'Update Password'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>,
                document.body
            )}
        </>
    )
}
