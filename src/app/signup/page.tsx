"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

type Toast = {
    message: string
    type: 'success' | 'error'
}

export default function SignupPage() {
    const [fullName, setFullName] = useState('')
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [role, setRole] = useState('front_desk')
    const [loading, setLoading] = useState(false)
    const [toast, setToast] = useState<Toast | null>(null)

    const supabase = createClient()

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    async function handleSignup(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)

        const cleanUsername = username.trim().toLowerCase()
        const cleanEmail = email.trim().toLowerCase()

        // 1. Check if username is already taken in database
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('username', cleanUsername)
            .single()

        if (existingUser) {
            showToast('Username is already taken. Please choose another.', 'error')
            setLoading(false)
            return
        }

        // 2. Register user with Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: cleanEmail,
            password,
            options: {
                data: {
                    full_name: fullName,
                    username: cleanUsername,
                    role: role,
                },
            },
        })

        if (authError || !authData.user) {
            showToast(authError?.message || 'Registration failed.', 'error')
            setLoading(false)
            return
        }

        // 3. Save profile details into public.users table
        const { error: dbError } = await supabase
            .from('users')
            .upsert({
                id: authData.user.id,
                username: cleanUsername,
                email: cleanEmail,
                full_name: fullName,
                role: role,
            })

        if (dbError) {
            showToast('Failed to save user profile: ' + dbError.message, 'error')
            setLoading(false)
            return
        }

        showToast('Account created successfully! Redirecting to login...', 'success')
        setLoading(false)

        setTimeout(() => {
            window.location.href = '/login'
        }, 1500)
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
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-bold">Staff Registration Portal</p>
                </div>

                <form onSubmit={handleSignup} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">Full Name *</label>
                        <input
                            type="text"
                            required
                            placeholder="John Doe"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">Username *</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. johndoe"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">Staff Email *</label>
                        <input
                            type="email"
                            required
                            placeholder="john@workshop.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
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

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">Assigned Role *</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none capitalize font-medium cursor-pointer"
                        >
                            <option value="front_desk">Front Desk</option>
                            <option value="technician">Technician</option>
                            <option value="admin">Admin</option>
                            <option value="bidder">Bidder</option>
                        </select>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 px-4 rounded-xl text-sm shadow-md transition-all mt-2 disabled:opacity-50 cursor-pointer"
                    >
                        {loading ? 'Creating Account...' : 'Register Staff Account'}
                    </button>
                </form>

                <div className="mt-6 text-center text-xs text-slate-400 font-medium">
                    Already have an account?{' '}
                    <Link href="/login" className="text-blue-400 hover:underline font-bold">
                        Sign In here
                    </Link>
                </div>
            </div>
        </main>
    )
}