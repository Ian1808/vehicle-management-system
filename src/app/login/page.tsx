"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

type Toast = {
    message: string
    type: 'success' | 'error'
}

export default function LoginPage() {
    const [identifier, setIdentifier] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [toast, setToast] = useState<Toast | null>(null)

    const supabase = createClient()

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()

        if (!identifier.trim() || !password) {
            showToast('Please enter both username/email and password.', 'error')
            return
        }

        setLoading(true)
        const input = identifier.trim().toLowerCase()
        let loginEmail = input

        // 1. Resolve Username to Email if no '@' provided
        if (!input.includes('@')) {
            const { data: userProfile, error: profileError } = await supabase
                .from('users')
                .select('email')
                .eq('username', input)
                .maybeSingle()

            if (profileError || !userProfile?.email) {
                showToast('Username not found. Please check your username or use your email.', 'error')
                setLoading(false)
                return
            }

            loginEmail = userProfile.email
        }

        // 2. Authenticate user
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password,
        })

        if (authError || !authData.user) {
            showToast(authError?.message || 'Invalid credentials. Please check your password.', 'error')
            setLoading(false)
            return
        }

        // 3. Fetch User Role & Route
        const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', authData.user.id)
            .maybeSingle()

        setLoading(false)
        const userRole = userData?.role || authData.user.user_metadata?.role || 'front_desk'

        showToast('Login successful! Redirecting...', 'success')

        setTimeout(() => {
            if (userRole === 'admin') {
                window.location.href = '/admin'
            } else if (userRole === 'technician') {
                window.location.href = '/technician'
            } else {
                window.location.href = '/'
            }
        }, 1000)
    }

    return (
        <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative">
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

            <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl max-w-md w-full p-8 text-slate-100">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-black tracking-tight text-blue-400">Vehicle Management System</h1>
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-bold">Staff Access Portal</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">Username or Email *</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. johndoe or john@workshop.com"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
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
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
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

                <div className="mt-6 text-center text-xs text-slate-400 font-medium">
                    Need a staff account?{' '}
                    <Link href="/signup" className="text-blue-400 hover:underline font-bold">
                        Register here
                    </Link>
                </div>
            </div>
        </main>
    )
}