"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTheme } from '@/lib/theme'
import Link from 'next/link'

type Toast = {
    message: string
    type: 'success' | 'error'
}

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [toast, setToast] = useState<Toast | null>(null)
    const { setTheme, isDark } = useTheme()

    const supabase = createClient()

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)

        const identifier = email.trim()
        let loginEmail = identifier

        // Allow login by username: resolve the username to the account email first.
        if (!identifier.includes('@')) {
            const safePattern = identifier.replace(/[\\%_]/g, '\\$&')
            const { data: userProfile, error: profileErr } = await supabase
                .from('users')
                .select('email')
                .ilike('username', safePattern)
                .maybeSingle()

            if (profileErr || !userProfile?.email) {
                showToast('Username not found. Please check your username.', 'error')
                setLoading(false)
                return
            }
            loginEmail = userProfile.email
        }

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password,
        })

        if (authError || !authData.user) {
            showToast(authError?.message || 'Invalid email or password.', 'error')
            setLoading(false)
            return
        }

        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', authData.user.id)
            .single()

        if (userError || !userData) {
            showToast('User role profile not found in database.', 'error')
            setLoading(false)
            return
        }

        showToast('Login successful! Redirecting...', 'success')

        setTimeout(() => {
            window.location.href = '/'
        }, 1000)
    }

    const bgClass = isDark ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    const cardClass = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900 shadow-xl'
    const inputClass = isDark ? 'bg-slate-950 border-slate-800 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
    const labelClass = isDark ? 'text-slate-400' : 'text-slate-600'

    return (
        <main className={`min-h-screen flex items-center justify-center p-4 relative transition-colors duration-200 ${bgClass}`}>
            <button
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                className={`absolute top-6 right-6 p-2.5 rounded-xl text-xs font-bold border shadow-md cursor-pointer ${isDark ? 'border-slate-700 bg-slate-800 text-amber-300' : 'border-slate-200 bg-white text-amber-600'}`}
            >
                {isDark ? '☀️ Day Mode' : '🌙 Night Mode'}
            </button>

            {toast && (
                <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 animate-bounce">
                    <div className={`px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-3 border ${toast.type === 'success'
                            ? isDark
                                ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
                                : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : isDark
                                ? 'bg-rose-900 text-rose-100 border-rose-700'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                        }`}>
                        <span>{toast.type === 'success' ? '✨' : '⚠️'}</span>
                        <span>{toast.message}</span>
                    </div>
                </div>
            )}

            <div className={`border rounded-3xl p-8 max-w-md w-full ${cardClass}`}>
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-black tracking-tight text-blue-500">Vehicle Management System</h1>
                    <p className={`text-xs mt-1 uppercase tracking-wider font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Staff Access Portal</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Email or Username</label>
                        <input
                            type="text"
                            required
                            placeholder="staff@workshop.com or username"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className={`w-full border rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium ${inputClass}`}
                        />
                    </div>

                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Password</label>
                        <input
                            type="password"
                            required
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={`w-full border rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium ${inputClass}`}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 px-4 rounded-xl text-sm shadow-md transition-all mt-2 disabled:opacity-50 cursor-pointer"
                    >
                        {loading ? 'Authenticating...' : 'Sign In'}
                    </button>
                </form>

                <div className={`mt-6 text-center text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Need a staff account?{' '}
                    <Link href="/signup" className="text-blue-500 hover:underline font-bold">
                        Register here
                    </Link>
                </div>
            </div>
        </main>
    )
}