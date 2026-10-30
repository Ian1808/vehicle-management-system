"use client"

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTheme } from '@/lib/theme'
import FrontDeskModule from '@/modules/FrontDeskModule'
import TechnicianModule from '@/modules/TechnicianModule'
import AdminModule from '@/modules/AdminModule'
import ManagerStaffModule from '@/modules/ManagerStaffModule'
import ManagerDashboardModule from '@/modules/ManagerDashboardModule'

type Role = 'admin' | 'manager' | 'front_desk' | 'technician' | 'bidder'

const ROLE_MODULES: Record<string, string> = {
    admin: 'admin',
    manager: 'manager',
    front_desk: 'frontdesk',
    technician: 'technician',
}

const ALLOWED_TABS: Record<string, string[]> = {
    admin: ['admin', 'frontdesk', 'technician'],
    manager: ['manager', 'staff', 'frontdesk', 'technician'],
    front_desk: ['frontdesk'],
    technician: ['technician'],
}

const TAB_META: Record<string, { label: string; icon: string }> = {
    admin: { label: 'Admin Hub', icon: '🛡️' },
    manager: { label: 'Manager Dashboard', icon: '🏢' },
    staff: { label: 'Company Staff', icon: '👥' },
    frontdesk: { label: 'Front Desk', icon: '📋' },
    technician: { label: 'Technician Portal', icon: '🔧' },
}

export default function MainDashboard() {
    const [role, setRole] = useState<Role | null>(null)
    const [state, setState] = useState<'loading' | 'ready' | 'denied'>('loading')
    const [tab, setTab] = useState<string>('')
    const { isDark } = useTheme()

    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        let cancelled = false

        async function init() {
            try {
                const { data: { user }, error } = await supabase.auth.getUser()
                if (!user || error) {
                    window.location.replace('/login')
                    return
                }

                const { data: userData } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', user.id)
                    .single()

                const userRole = userData?.role as Role | undefined
                if (!userRole || !ALLOWED_TABS[userRole]) {
                    if (!cancelled) setState('denied')
                    return
                }

                const params = new URLSearchParams(window.location.search)
                const requested = params.get('tab') || window.localStorage.getItem('vms-landing-module') || ''
                const allowed = ALLOWED_TABS[userRole]
                const initial = allowed.includes(requested) ? requested : ROLE_MODULES[userRole]

                if (!cancelled) {
                    setRole(userRole)
                    setTab(initial)
                    setState('ready')
                }
            } catch {
                if (!cancelled) setState('denied')
            }
        }

        init()
        return () => { cancelled = true }
    }, [supabase])

    function selectTab(next: string) {
        setTab(next)
        const url = new URL(window.location.href)
        url.searchParams.set('tab', next)
        window.history.replaceState(null, '', url.pathname + url.search)
    }

    async function signOut() {
        await supabase.auth.signOut()
        window.location.replace('/login')
    }

    if (state === 'loading') {
        return (
            <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
                <div className="text-center">
                    <div className="text-3xl mb-3">🚗</div>
                    <p className="text-sm font-semibold text-slate-400">Loading your dashboard…</p>
                </div>
            </div>
        )
    }

    if (state === 'denied') {
        return (
            <div className={`min-h-screen flex items-center justify-center p-4 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
                <div className={`max-w-md w-full rounded-3xl border p-8 text-center shadow-xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <div className="text-4xl mb-4">🔒</div>
                    <h1 className="text-lg font-black mb-2">Access Restricted</h1>
                    <p className="text-sm text-slate-400 mb-6">Your account does not have access to any dashboard module. Please contact an administrator.</p>
                    <button onClick={signOut} className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-lg cursor-pointer">Sign Out</button>
                </div>
            </div>
        )
    }

    const tabs = ALLOWED_TABS[role as string] || []

    return (
        <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
            {tabs.length > 1 && (
                <nav className={`border-b sticky top-0 z-50 backdrop-blur-md ${isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-slate-200'}`}>
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-2">
                        <span className={`text-[11px] font-extrabold uppercase tracking-wider mr-1 sm:mr-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Modules:</span>
                        {tabs.map((key) => (
                            <button
                                key={key}
                                onClick={() => selectTab(key)}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${tab === key
                                    ? 'bg-purple-600 text-white shadow-lg'
                                    : (isDark ? 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100')}`}
                            >
                                {TAB_META[key].icon} {TAB_META[key].label}
                            </button>
                        ))}
                    </div>
                </nav>
            )}
            {tab === 'admin' && <AdminModule />}
            {tab === 'manager' && <ManagerDashboardModule />}
            {tab === 'staff' && <ManagerStaffModule />}
            {tab === 'frontdesk' && <FrontDeskModule />}
            {tab === 'technician' && <TechnicianModule />}
        </div>
    )
}
