"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Toast = {
    message: string
    type: 'success' | 'error'
}

export default function LoginPage() {
    const [identifier, setIdentifier] = useState('') // Accepts Email or Username
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [toast, setToast] = useState<Toast | null>(null)

    const router = useRouter()
    const supabase = createClient()

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()

        if (!identifier.trim() || !password) {
            showToast('Please enter your username/email and password.', 'error')
            return
        }

        setLoading(true)
        const input = identifier.trim()
        let loginEmail = input

        // 1. If input is NOT an email (no '@'), resolve username to email from public.users
        if (!input.includes('@')) {
            const { data: userProfile, error: profileError } = await supabase
                .from('users')
                .select('username') // Assuming username field holds the email or you store email separately
                .eq('username', input)
                .maybeSingle()

            if (profileError || !userProfile) {
                showToast('Username not found. Please check your username or use your email.', 'error')
                setLoading(false)
                return
            }

            // If your username field in public.users stores the email address:
            loginEmail = userProfile.username
        }

        // 2. Authenticate with Supabase Auth using the resolved email
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password,
        })

        if (authError || !authData.user) {
            showToast(authError?.message || 'Invalid credentials. Please check your password.', 'error')
            setLoading(false)
            return
        }

        const userId = authData.user.id

        // 3. Record the exact last_login timestamp in public.users
        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', userId)

        // 4. Fetch user role to determine portal routing
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .maybeSingle()

        setLoading(false)

        const userRole = userData?.role || authData.user.user_metadata?.role || 'front_desk'

        showToast('Login successful! Redirecting...', 'success')

        setTimeout(() => {
            if (userRole === 'admin') {
                router.push('/admin')
            } else if (userRole === 'technician') {
                router.push('/technician')
            } else {
                router.push('/') // Front Desk
            }
        }, 800)
    }

    return (
        <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative selection:bg-purple-500 selection:text-white">
            {/* Toast Notification */}
            {toast && (
                <div className="fixed top-6 right-6 z-50 animate-bounce">
                    <div className={`px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 border ${toast.type === 'success'
                            ? 'bg-emerald-950 text-emerald-200 border-emerald-700/80'
                            : 'bg-rose-950 text-rose-200 border-rose-700/80'
                        }`}>
                        <span>{toast.type === 'success' ? '✨' : '⚠️'}</span>
                        <span>{toast.message}</span>
                    </div>
                </div>
            )}

            <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-8 text-slate-100">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 font-black text-xl mx-auto mb-3">
                        🚗
                    </div>
                    <h1 className="text-xl font-black tracking-tight text-white">Vehicle Management System</h1>
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-bold">Secure Staff Portal</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">Username or Email *</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. admin@workshop.com or username"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-medium"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">Password *</label>
                        <input
                            type="password"
                            required
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-medium"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white font-extrabold py-3.5 px-4 rounded-xl text-xs shadow-md transition-all mt-2 disabled:opacity-50 cursor-pointer"
                    >
                        {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
                    </button>
                </form>

                <div className="mt-6 text-center text-xs text-slate-400 font-medium">
                    Need a staff account?{' '}
                    <Link href="/signup" className="text-purple-400 hover:underline font-bold">
                        Register Staff Account
                    </Link>
                </div>
            </div>
        </main>
    )
}