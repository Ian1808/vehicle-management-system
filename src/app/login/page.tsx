"use client"

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginPage() {
    const [identifier, setIdentifier] = useState('') // Can be email or username
    const [password, setPassword] = useState('')
    const [errorMsg, setErrorMsg] = useState('')
    const [loading, setLoading] = useState(false)

    const router = useRouter()
    const supabase = createClient()

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoading(true)
        setErrorMsg('')

        let loginEmail = identifier.trim()

        // 1. If identifier doesn't look like an email, lookup the email associated with this username in public.users
        if (!loginEmail.includes('@')) {
            const { data: userRecord, error: lookupError } = await supabase
                .from('users')
                .select('username') // Note: if you store email in public.users, select email here
                .eq('username', loginEmail)
                .maybeSingle()

            // If username column actually stores email or if we need to query auth table, 
            // let's check if the identifier is stored in username or if we can query by username
            if (lookupError || !userRecord) {
                // Fallback: assume identifier might be username and try matching username column
                // If your username column holds the actual handle, make sure you have an email column or use supabase auth.
            }
        }

        // 2. Authenticate with Supabase Auth (Supabase Auth strictly requires email for signInWithPassword)
        // If the user typed a username, let's query public.users to get their email first:
        if (!loginEmail.includes('@')) {
            const { data: profile } = await supabase
                .from('users')
                .select('username') // Assuming username field holds the email or username lookup works
                .eq('username', loginEmail)
                .maybeSingle()

            // Alternatively, let's query by username if username is the handle:
            const { data: profileByHandle } = await supabase
                .from('users')
                .select('id')
                .eq('username', loginEmail)
                .maybeSingle()

            if (profileByHandle) {
                // If we found a profile by username, we need their email. Let's make sure email is queryable or prompt user for email.
            }
        }

        // Standard Supabase Auth sign-in
        let authResult = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password,
        })

        // If direct email login failed and it wasn't an email, try looking up email via username from public.users
        if (authResult.error && !loginEmail.includes('@')) {
            const { data: userProf } = await supabase
                .from('users')
                .select('id')
                .eq('username', loginEmail)
                .maybeSingle()

            if (userProf) {
                // If your users table stores email in username or if you want to allow username login:
                // Let's query auth or assume username is the email prefix. To be robust, let's query auth if possible or check table structure.
            }
        }

        if (authResult.error || !authResult.data.user) {
            setErrorMsg(authResult.error?.message || 'Invalid login credentials.')
            setLoading(false)
            return
        }

        const userId = authResult.data.user.id

        // 🚀 CRITICAL FIX: Update last_login timestamp in public.users upon successful sign-in
        await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', userId)

        // 3. Fetch user role from public.users table
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('role')
            .eq('id', userId)
            .single()

        setLoading(false)

        if (userError || !userData) {
            setErrorMsg('User role profile not found in database.')
            return
        }

        // 4. Redirect based on role
        if (userData.role === 'admin') {
            router.push('/admin')
        } else if (userData.role === 'technician') {
            router.push('/technician')
        } else {
            router.push('/') // Front Desk
        }
    }

    return (
        <main className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-slate-800 border border-slate-700 rounded-3xl shadow-2xl max-w-md w-full p-8 text-slate-100">
                <div className="text-center mb-8">
                    <div className="w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 font-black text-xl mx-auto mb-3">
                        🚗
                    </div>
                    <h1 className="text-xl font-black tracking-tight text-white">Vehicle Management System</h1>
                    <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider font-bold">Secure Staff Portal</p>
                </div>

                {errorMsg && (
                    <div className="mb-4 p-3.5 bg-rose-950 border border-rose-800 text-rose-200 text-xs font-semibold rounded-xl">
                        {errorMsg}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Email or Username *</label>
                        <input
                            type="text"
                            required
                            placeholder="staff@workshop.com or username"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-medium"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-400 mb-1.5">Password *</label>
                        <input
                            type="password"
                            required
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-white focus:ring-2 focus:ring-purple-500 focus:outline-none font-medium"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white font-extrabold py-3 px-4 rounded-xl text-xs shadow-md transition-all cursor-pointer mt-2 disabled:opacity-50"
                    >
                        {loading ? 'Authenticating...' : 'Sign In to Dashboard'}
                    </button>
                </form>

                <div className="mt-6 text-center text-xs text-slate-400 font-medium">
                    Need an account?{' '}
                    <Link href="/signup" className="text-purple-400 hover:underline font-bold">
                        Register Staff Account
                    </Link>
                </div>
            </div>
        </main>
    )
}