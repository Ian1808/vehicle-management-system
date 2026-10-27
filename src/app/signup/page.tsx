"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTheme } from '@/lib/theme'
import Link from 'next/link'

type Toast = { message: string; type: 'success' | 'error' }

export default function SignupPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [username, setUsername] = useState('')
    const [role, setRole] = useState('front_desk')
    const [loading, setLoading] = useState(false)
    const [toast, setToast] = useState<Toast | null>(null)
    const { setTheme, isDark } = useTheme()

    const supabase = createClient()

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    async function handleSignup(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        })

        if (authError || !authData.user) {
            showToast(authError?.message || 'Registration failed.', 'error')
            setLoading(false)
            return
        }

        const { error: profileError } = await supabase.from('users').insert([
            {
                id: authData.user.id,
                email,
                username,
                full_name: fullName,
                role,
            }
        ])

        if (profileError) {
            showToast(profileError.message, 'error')
            setLoading(false)
            return
        }

        showToast('Account registered successfully! Redirecting...', 'success')
        setTimeout(() => {
            window.location.href = '/login'
        }, 1500)
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
                    <div className={`px-5 py-3 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-3 border ${toast.type === 'success' ? isDark
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
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-black tracking-tight text-blue-500">Staff Registration</h1>
                    <p className={`text-xs mt-1 uppercase tracking-wider font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Create Workshop Account</p>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Full Name</label>
                        <input type="text" required placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} className={`w-full border rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium ${inputClass}`} />
                    </div>

                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Username</label>
                        <input type="text" required placeholder="johndoe" value={username} onChange={(e) => setUsername(e.target.value)} className={`w-full border rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium ${inputClass}`} />
                    </div>

                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Email Address</label>
                        <input type="email" required placeholder="staff@workshop.com" value={email} onChange={(e) => setEmail(e.target.value)} className={`w-full border rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium ${inputClass}`} />
                    </div>

                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Password</label>
                        <input type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className={`w-full border rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium ${inputClass}`} />
                    </div>

                    <div>
                        <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${labelClass}`}>Role Assignment</label>
                        <select value={role} onChange={(e) => setRole(e.target.value)} className={`w-full border rounded-xl p-3 text-sm font-bold cursor-pointer ${inputClass}`}>
                            <option value="front_desk">Front Desk Staff</option>
                            <option value="technician">Workshop Technician</option>
                            <option value="admin">Administrator</option>
                        </select>
                    </div>

                    <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 px-4 rounded-xl text-sm shadow-md transition-all mt-2 disabled:opacity-50 cursor-pointer">
                        {loading ? 'Registering...' : 'Complete Registration'}
                    </button>
                </form>

                <div className={`mt-6 text-center text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Already have an account?{' '}
                    <Link href="/login" className="text-blue-500 hover:underline font-bold">Sign In</Link>
                </div>
            </div>
        </main>
    )
}