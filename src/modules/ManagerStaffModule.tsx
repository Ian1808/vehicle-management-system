"use client"

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTheme } from '@/lib/theme'
import Toast from '@/components/ui/Toast'
import ConfirmModal from '@/components/ui/ConfirmModal'
import Card from '@/components/ui/Card'
import SectionHeading from '@/components/ui/SectionHeading'
import EmptyState from '@/components/ui/EmptyState'
import ResponsiveTable from '@/components/ui/ResponsiveTable'
import StaffUserModal, { type StaffUserPayload } from '@/components/admin/StaffUserModal'
import ChangePasswordModal from '@/components/admin/ChangePasswordModal'

type Toast = { message: string; type: 'success' | 'error' } | null
type Confirm = {
    title: string
    message: string
    confirmText: string
    confirmVariant: 'danger' | 'success'
    onConfirm: () => void
} | null

type CompanyStaff = {
    id: string
    username: string
    email?: string
    full_name: string
    role: string
    is_suspended?: boolean
    last_login?: string
    created_at?: string
    technician_type?: string | null
    specialty?: string | null
}

export default function ManagerStaffModule({ embedded = false }: { embedded?: boolean }) {
    const { isDark } = useTheme()
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState<Toast>(null)
    const [confirmModal, setConfirmModal] = useState<Confirm>(null)
    const [staff, setStaff] = useState<CompanyStaff[]>([])
    const [companyName, setCompanyName] = useState('')
    const [companyId, setCompanyId] = useState<string | null>(null)
    const [showUserModal, setShowUserModal] = useState(false)
    const [editingPasswordUser, setEditingPasswordUser] = useState<CompanyStaff | null>(null)

    const supabase = useMemo(() => createClient(), [])

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    useEffect(() => {
        async function init() {
            try {
                const { data: { user }, error: authError } = await supabase.auth.getUser()
                if (!user || authError) {
                    window.location.href = '/login'
                    return
                }

                const { data: userData } = await supabase
                    .from('users')
                    .select('role, company_id')
                    .eq('id', user.id)
                    .single()

                if (!userData || (userData.role !== 'manager' && userData.role !== 'admin')) {
                    showToast('Access Denied: Managers and Admins only.', 'error')
                    setTimeout(() => { window.location.href = '/' }, 1500)
                    return
                }

                setCompanyId(userData.company_id || null)

                if (userData.company_id) {
                    const { data: company } = await supabase
                        .from('companies')
                        .select('name')
                        .eq('id', userData.company_id)
                        .single()
                    setCompanyName(company?.name || '')
                }

                await fetchStaff(userData.company_id || null)
            } catch (err: unknown) {
                showToast(err instanceof Error ? err.message : 'Initialization failed', 'error')
            } finally {
                setLoading(false)
            }
        }
        init()
    }, [supabase])

    async function fetchStaff(scopeCompanyId: string | null) {
        if (!scopeCompanyId) {
            setStaff([])
            return
        }
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .eq('company_id', scopeCompanyId)
            .in('role', ['front_desk', 'technician'])
            .order('full_name', { ascending: true })

        if (error) showToast(error.message, 'error')
        else setStaff(data || [])
    }

    async function handleCreateStaffUser(payload: StaffUserPayload): Promise<boolean> {
        if (!payload.username.trim() || !payload.email.trim() || !payload.password.trim() || !payload.fullName.trim()) return false

        try {
            const cleanUsername = payload.username.trim().toLowerCase()
            const cleanEmail = payload.email.trim().toLowerCase()

            const { data, error } = await supabase.auth.signUp({
                email: cleanEmail,
                password: payload.password.trim(),
                options: {
                    data: {
                        full_name: payload.fullName.trim(),
                        username: cleanUsername,
                        role: payload.role,
                    },
                },
            })

            if (error) throw error

            if (data.user) {
                const upsertPayload: Record<string, unknown> = {
                    id: data.user.id,
                    username: cleanUsername,
                    email: cleanEmail,
                    full_name: payload.fullName.trim(),
                    role: payload.role,
                    company_id: companyId,
                    technician_type: payload.role === 'technician' ? (payload.technicianType || 'inhouse') : null,
                    specialty: payload.role === 'technician' && payload.technicianType === 'third_party' ? (payload.specialty?.trim() || null) : null,
                    is_suspended: false,
                }

                const { error: upsertErr } = await supabase.from('users').upsert(upsertPayload)
                if (upsertErr) {
                    // technician_type/specialty columns may not exist yet if the DB
                    // migration hasn't been run — retry without them.
                    if (upsertErr.message.includes('technician_type') || upsertErr.message.includes('specialty')) {
                        console.warn('[ManagerStaffModule] technician_type column missing — staff created without tech profile until DB migration runs')
                        delete upsertPayload.technician_type
                        delete upsertPayload.specialty
                        const retry = await supabase.from('users').upsert(upsertPayload)
                        if (retry.error) throw retry.error
                    } else {
                        throw upsertErr
                    }
                }
            }

            showToast('Staff member registered to your company successfully!', 'success')
            await fetchStaff(companyId)
            return true
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to create staff account.', 'error')
            return false
        }
    }

    async function handleToggleSuspendUser(userId: string, currentStatus: boolean, name: string) {
        const newStatus = !currentStatus
        setConfirmModal({
            title: newStatus ? 'Confirm Account Suspension' : 'Confirm Account Reactivation',
            message: `Are you sure you want to ${newStatus ? 'suspend' : 'reactivate'} staff account "${name}"?`,
            confirmText: newStatus ? 'Suspend Account' : 'Reactivate Account',
            confirmVariant: newStatus ? 'danger' : 'success',
            onConfirm: async () => {
                setConfirmModal(null)
                const { error } = await supabase
                    .from('users')
                    .update({ is_suspended: newStatus })
                    .eq('id', userId)

                if (error) {
                    showToast('Error updating account status: ' + error.message, 'error')
                } else {
                    showToast(`Staff account successfully ${newStatus ? 'suspended' : 'reactivated'}.`, 'success')
                    await fetchStaff(companyId)
                }
            }
        })
    }

    async function handleDeleteUser(userId: string, name: string) {
        setConfirmModal({
            title: 'Confirm Account Removal',
            message: `Are you sure you want to remove staff account "${name}" from your company? This action cannot be undone.`,
            confirmText: 'Remove Staff',
            confirmVariant: 'danger',
            onConfirm: async () => {
                setConfirmModal(null)
                const { error } = await supabase
                    .from('users')
                    .delete()
                    .eq('id', userId)

                if (error) {
                    showToast('Error removing user: ' + error.message, 'error')
                } else {
                    showToast('Staff account removed successfully.', 'success')
                    await fetchStaff(companyId)
                }
            }
        })
    }

    async function handleUpdateUserRole(userId: string, newRole: string) {
        if (newRole !== 'front_desk' && newRole !== 'technician') return
        setConfirmModal({
            title: 'Confirm Role Change',
            message: `Are you sure you want to change this user's role to "${newRole.toUpperCase()}"?`,
            confirmText: 'Update Role',
            confirmVariant: 'success',
            onConfirm: async () => {
                setConfirmModal(null)
                const { error } = await supabase
                    .from('users')
                    .update({ role: newRole })
                    .eq('id', userId)

                if (error) {
                    showToast('Error updating role: ' + error.message, 'error')
                } else {
                    showToast('User role updated successfully!', 'success')
                    await fetchStaff(companyId)
                }
            }
        })
    }

    const innerCard = isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'

    return (
        <div className={`min-h-screen ${embedded ? '' : 'pb-24 lg:pb-16 '}relative selection:bg-purple-500 selection:text-white ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            {toast && <Toast message={toast.message} type={toast.type} isDark={isDark} />}

            {confirmModal && (
                <ConfirmModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    confirmText={confirmModal.confirmText}
                    confirmVariant={confirmModal.confirmVariant}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal(null)}
                    isDark={isDark}
                />
            )}

            {showUserModal && (
                <StaffUserModal
                    isDark={isDark}
                    title="Register Company Staff"
                    subtitle="Create front desk or technician credentials under your company."
                    submitLabel="Create Staff Account"
                    companies={[{ id: companyId || '', name: companyName || 'My Company' }]}
                    fixedCompanyId={companyId}
                    allowRoles={['front_desk', 'technician']}
                    onSubmit={handleCreateStaffUser}
                    onClose={() => setShowUserModal(false)}
                />
            )}

            {editingPasswordUser && (
                <ChangePasswordModal
                    isDark={isDark}
                    userName={editingPasswordUser.full_name}
                    onSubmit={async () => {
                        showToast('Password reset instructions or update requested.', 'success')
                        return true
                    }}
                    onClose={() => setEditingPasswordUser(null)}
                />
            )}

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <SectionHeading
                    isDark={isDark}
                    title={`Company Staff — ${companyName || 'My Company'}`}
                    subtitle="Manage the front desk and technician accounts under your company."
                />

                {!companyId ? (
                    <Card isDark={isDark} className="p-8">
                        <EmptyState isDark={isDark} message="Your account is not assigned to a company yet. Ask an administrator to assign your company." />
                    </Card>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                            <div className={`border rounded-2xl px-4 py-3 ${innerCard}`}>
                                <p className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Staff under your company</p>
                                <p className="text-2xl font-black text-purple-400">{staff.length}</p>
                            </div>
                            <button
                                onClick={() => setShowUserModal(true)}
                                className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 py-2.5 rounded-xl text-xs shadow-md transition-all cursor-pointer"
                            >
                                + Add Staff Member
                            </button>
                        </div>

                        {loading ? (
                            <EmptyState isDark={isDark} message="Loading staff list..." />
                        ) : staff.length === 0 ? (
                            <EmptyState isDark={isDark} message="No front desk or technician accounts under your company yet." />
                        ) : (
                            <>
                                <div className="hidden md:block">
                                    <ResponsiveTable isDark={isDark} minWidth="min-w-[760px]">
                                        <thead>
                                            <tr className={`border-b text-xs font-extrabold uppercase tracking-wider ${isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                                                <th className="p-4">Full Name & Username</th>
                                                <th className="p-4">Status</th>
                                                <th className="p-4">Role</th>
                                                <th className="p-4">Last Login</th>
                                                <th className="p-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y text-xs font-medium ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-200 text-slate-700'}`}>
                                            {staff.map((u) => (
                                                <tr key={u.id} className={`transition-colors ${isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'}`}>
                                                    <td className="p-4">
                                                        <p className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.full_name || 'N/A'}</p>
                                                        <p className="text-slate-400 text-[11px] font-mono mt-0.5">@{u.username} {u.email ? `• ${u.email}` : ''}</p>
                                                    </td>
                                                    <td className="p-4">
                                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${u.is_suspended
                                                            ? 'bg-rose-950 text-rose-300 border-rose-800'
                                                            : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                                            }`}>
                                                            {u.is_suspended ? 'Suspended' : 'Active'}
                                                        </span>
                                                    </td>
                                                    <td className="p-4">
                                                        <select
                                                            value={u.role}
                                                            onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                                            className={`border rounded-xl p-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer capitalize ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                                                        >
                                                            <option value="front_desk">Front Desk</option>
                                                            <option value="technician">Technician</option>
                                                        </select>
                                                        {u.role === 'technician' && (
                                                            <p className={`text-[10px] font-bold mt-1 ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>
                                                                {u.technician_type === 'third_party' ? `3rd-Party • ${u.specialty || 'No specialty'}` : 'In-House'}
                                                            </p>
                                                        )}
                                                    </td>
                                                    <td className="p-4 text-slate-400 text-[11px]">
                                                        {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never logged in'}
                                                    </td>
                                                    <td className="p-4 text-right">
                                                        <div className="flex flex-wrap gap-2 justify-end">
                                                            <button
                                                                onClick={() => setEditingPasswordUser(u)}
                                                                className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-purple-950 hover:bg-purple-900 text-purple-300 border-purple-800' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'}`}
                                                                title="Change Password"
                                                            >
                                                                🔑 Password
                                                            </button>
                                                            <button
                                                                onClick={() => handleToggleSuspendUser(u.id, Boolean(u.is_suspended), u.full_name)}
                                                                className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${u.is_suspended
                                                                    ? isDark ? 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-800' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                                                    : isDark ? 'bg-amber-950 hover:bg-amber-900 text-amber-300 border-amber-800' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                                                                    }`}
                                                                title={u.is_suspended ? 'Reactivate Account' : 'Suspend Account'}
                                                            >
                                                                {u.is_suspended ? '🟢 Activate' : '🟡 Suspend'}
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteUser(u.id, u.full_name)}
                                                                className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border-rose-900' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}
                                                                title="Remove Account"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </ResponsiveTable>
                                </div>

                                <div className="md:hidden space-y-3">
                                    {staff.map((u) => (
                                        <div key={u.id} className={`border rounded-2xl p-4 flex flex-col gap-3 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className={`font-black text-sm truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.full_name || 'N/A'}</p>
                                                    <p className={`text-[11px] font-mono truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>@{u.username} {u.email ? `• ${u.email}` : ''}</p>
                                                </div>
                                                <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${u.is_suspended
                                                    ? isDark ? 'bg-rose-950 text-rose-300 border-rose-800' : 'bg-rose-50 text-rose-700 border-rose-200'
                                                    : isDark ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    }`}>
                                                    {u.is_suspended ? 'Suspended' : 'Active'}
                                                </span>
                                            </div>
                                            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                Last login: {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never logged in'}
                                            </p>
                                            <select
                                                value={u.role}
                                                onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                                className={`w-full border rounded-xl p-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer capitalize ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                                            >
                                                <option value="front_desk">Front Desk</option>
                                                <option value="technician">Technician</option>
                                            </select>
                                            {u.role === 'technician' && (
                                                <p className={`text-[10px] font-bold ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>
                                                    {u.technician_type === 'third_party' ? `3rd-Party • ${u.specialty || 'No specialty'}` : 'In-House'}
                                                </p>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    onClick={() => setEditingPasswordUser(u)}
                                                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-purple-950 hover:bg-purple-900 text-purple-300 border-purple-800' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'}`}
                                                    title="Change Password"
                                                >
                                                    🔑 Password
                                                </button>
                                                <button
                                                    onClick={() => handleToggleSuspendUser(u.id, Boolean(u.is_suspended), u.full_name)}
                                                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${u.is_suspended
                                                        ? isDark ? 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-800' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                                        : isDark ? 'bg-amber-950 hover:bg-amber-900 text-amber-300 border-amber-800' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                                                        }`}
                                                    title={u.is_suspended ? 'Reactivate Account' : 'Suspend Account'}
                                                >
                                                    {u.is_suspended ? '🟢 Activate' : '🟡 Suspend'}
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteUser(u.id, u.full_name)}
                                                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border-rose-900' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}
                                                    title="Remove Account"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}
            </main>
        </div>
    )
}
