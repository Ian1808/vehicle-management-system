"use client"

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTheme } from '@/lib/theme'
import ConfirmModal from '@/components/ui/ConfirmModal'
import AccountSettingsModal, { type AccountSettingsPayload } from '@/components/ui/AccountSettingsModal'
import FrontDeskModule from '@/modules/FrontDeskModule'
import TechnicianModule from '@/modules/TechnicianModule'
import AdminModule from '@/modules/AdminModule'
import ManagerStaffModule from '@/modules/ManagerStaffModule'
import ManagerDashboardModule from '@/modules/ManagerDashboardModule'
import ManagerPanelBanksModule from '@/modules/ManagerPanelBanksModule'

type Role = 'admin' | 'manager' | 'front_desk' | 'technician' | 'bidder'

const ROLE_MODULES: Record<string, string> = {
    admin: 'admin',
    manager: 'manager',
    front_desk: 'frontdesk',
    technician: 'technician',
}

const ALLOWED_TABS: Record<string, string[]> = {
    admin: ['admin'], // Admin manages all modules from within the Admin page (no module nav bar)
    manager: ['manager', 'panels', 'staff', 'frontdesk', 'technician'],
    front_desk: ['frontdesk'],
    technician: ['technician'],
}

const TAB_META: Record<string, { label: string; icon: string }> = {
    admin: { label: 'Admin Hub', icon: '🛡️' },
    manager: { label: 'Manager Dashboard', icon: '🏢' },
    panels: { label: 'Panel Banks & Insurance', icon: '🏦' },
    staff: { label: 'Company Staff', icon: '👥' },
    frontdesk: { label: 'Front Desk', icon: '📋' },
    technician: { label: 'Technician Portal', icon: '🔧' },
}

// Compact labels for the mobile bottom tab bar (short enough to never truncate)
const MOBILE_TAB_LABELS: Record<string, string> = {
    admin: 'Admin',
    manager: 'Manager',
    panels: 'Panels',
    staff: 'Staff',
    frontdesk: 'Front Desk',
    technician: 'Technician',
}

export default function MainDashboard() {
    const [role, setRole] = useState<Role | null>(null)
    const [state, setState] = useState<'loading' | 'ready' | 'denied'>('loading')
    const [tab, setTab] = useState<string>('')
    const { isDark, theme, setTheme } = useTheme()
    const [showSettingsModal, setShowSettingsModal] = useState(false)
    const [confirmSignOut, setConfirmSignOut] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)
    const [currentUserEmail, setCurrentUserEmail] = useState('')
    const [settingsUsername, setSettingsUsername] = useState('')
    const [settingsFullName, setSettingsFullName] = useState('')
    const [currentCompanyName, setCurrentCompanyName] = useState('')

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
                setCurrentUserId(user.id)
                setCurrentUserEmail(user.email || '')

                const { data: userData } = await supabase
                    .from('users')
                    .select('role, full_name, username, company_id')
                    .eq('id', user.id)
                    .single()

                const userRole = userData?.role as Role | undefined
                if (!userRole || !ALLOWED_TABS[userRole]) {
                    if (!cancelled) setState('denied')
                    return
                }

                setSettingsFullName(userData?.full_name || '')
                setSettingsUsername(userData?.username || '')
                if (userData?.company_id) {
                    const { data: company } = await supabase
                        .from('companies')
                        .select('name')
                        .eq('id', userData.company_id)
                        .maybeSingle()
                    setCurrentCompanyName(company?.name || '')
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

    async function handleSettingsSave(payload: AccountSettingsPayload): Promise<{ ok: boolean; error?: string }> {
        if (!currentUserId) return { ok: false, error: 'Not authenticated.' }

        try {
            if (!payload.username.trim()) {
                return { ok: false, error: 'Username cannot be empty.' }
            }

            const { data: existingUsername } = await supabase
                .from('users')
                .select('id')
                .eq('username', payload.username)
                .neq('id', currentUserId)
                .maybeSingle()

            if (existingUsername) {
                return { ok: false, error: 'That username is already taken.' }
            }

            const { error: profileError } = await supabase
                .from('users')
                .update({ full_name: payload.fullName, username: payload.username })
                .eq('id', currentUserId)

            if (profileError) throw profileError

            if (payload.newPassword.trim()) {
                if (!payload.oldPassword.trim()) {
                    return { ok: false, error: 'Please enter your current password.' }
                }

                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: currentUserEmail,
                    password: payload.oldPassword.trim(),
                })

                if (signInError) {
                    return { ok: false, error: 'Incorrect old password.' }
                }

                const { error: passwordError } = await supabase.auth.updateUser({ password: payload.newPassword.trim() })
                if (passwordError) throw passwordError
            }

            setSettingsFullName(payload.fullName)
            setSettingsUsername(payload.username)
            return { ok: true }
        } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : 'Failed to update settings.' }
        }
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
            {/* Global top bar — shared across all roles */}
            <header className={`border-b backdrop-blur-md lg:sticky lg:top-0 z-40 ${isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-slate-200'}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-2xl border flex items-center justify-center text-base font-black shrink-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>🚗</div>
                        <div className="min-w-0">
                            <h1 className="text-base font-extrabold tracking-tight truncate">Vehicle Management System</h1>
                            <p className={`text-[11px] truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{TAB_META[tab]?.icon} {TAB_META[tab]?.label}</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={`h-9 w-9 flex items-center justify-center rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'border-slate-700 bg-slate-800 text-amber-300' : 'border-slate-200 bg-slate-100 text-amber-600'}`}>
                            {isDark ? '☀️' : '🌙'}
                        </button>
                        <button onClick={() => setShowSettingsModal(true)} className={`h-9 px-3.5 font-semibold rounded-xl text-xs border cursor-pointer transition-colors ${isDark ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>⚙️ Settings</button>
                        <button onClick={() => setConfirmSignOut(true)} className={`h-9 px-3.5 font-bold rounded-xl text-xs border cursor-pointer transition-colors ${isDark ? 'border-rose-900 bg-rose-950 text-rose-300 hover:bg-rose-900/50' : 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100'}`}>Sign Out</button>
                    </div>
                </div>
                {tabs.length > 1 && (
                    <div className={`hidden lg:block border-t max-w-7xl mx-auto px-2 sm:px-6 py-2 flex items-center gap-2 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <span className={`text-[11px] font-extrabold uppercase tracking-wider mr-1 hidden sm:inline ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Modules:</span>
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar flex-1 px-1 -mx-1">
                            {tabs.map((key) => (
                                <button
                                    key={key}
                                    onClick={() => selectTab(key)}
                                    className={`shrink-0 whitespace-nowrap px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${tab === key
                                        ? 'bg-purple-600 text-white shadow-lg'
                                        : (isDark ? 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100')}`}
                                >
                                    {TAB_META[key].icon} {TAB_META[key].label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </header>

            {/* Mobile: app-style bottom tab bar */}
            {tabs.length > 1 && (
                <nav className={`lg:hidden fixed bottom-0 inset-x-0 z-50 border-t backdrop-blur-md pb-[env(safe-area-inset-bottom)] ${isDark ? 'bg-slate-950/95 border-slate-800' : 'bg-white/95 border-slate-200'}`}>
                    <div className="flex items-stretch">
                        {tabs.map((key) => (
                            <button
                                key={key}
                                onClick={() => selectTab(key)}
                                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-w-0 transition-colors cursor-pointer ${tab === key
                                    ? isDark ? 'text-purple-300' : 'text-purple-600'
                                    : isDark ? 'text-slate-400' : 'text-slate-500'}`}
                            >
                                <span className={`text-base leading-none ${tab === key ? 'scale-110' : ''} transition-transform`}>{TAB_META[key].icon}</span>
                                <span className="w-full px-1 text-[10px] font-bold leading-tight text-center truncate">{MOBILE_TAB_LABELS[key] || TAB_META[key].label}</span>
                            </button>
                        ))}
                    </div>
                </nav>
            )}

            {tab === 'admin' && <AdminModule />}
            {tab === 'manager' && <ManagerDashboardModule />}
            {tab === 'panels' && <ManagerPanelBanksModule />}
            {tab === 'staff' && <ManagerStaffModule />}
            {tab === 'frontdesk' && <FrontDeskModule />}
            {tab === 'technician' && <TechnicianModule />}

            {showSettingsModal && (
                <AccountSettingsModal
                    isDark={isDark}
                    theme={theme}
                    setTheme={setTheme}
                    title="User Account Settings"
                    subtitle="Manage appearance, profile, and security credentials."
                    email={currentUserEmail}
                    username={settingsUsername}
                    fullName={settingsFullName}
                    accent="purple"
                    role={role || undefined}
                    companyName={role === 'admin' ? 'All Companies' : currentCompanyName || undefined}
                    showLandingModule={role !== 'admin'}
                    onClose={() => setShowSettingsModal(false)}
                    onSave={handleSettingsSave}
                />
            )}

            {confirmSignOut && (
                <ConfirmModal
                    title="Confirm Sign Out"
                    message="Are you sure you want to sign out of the Vehicle Management System?"
                    confirmText="Sign Out"
                    confirmVariant="danger"
                    isDark={isDark}
                    onConfirm={signOut}
                    onCancel={() => setConfirmSignOut(false)}
                />
            )}
        </div>
    )
}
