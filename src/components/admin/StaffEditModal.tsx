"use client"

import { useState } from 'react'
import { ROLE_OPTIONS } from '@/lib/roles'
import ChangePasswordButton from '@/components/ui/ChangePasswordButton'

export type StaffEditPayload = {
    fullName: string
    username: string
    role: string
    technicianType?: string
    specialty?: string
    companyId?: string | null
}

type StaffEditModalProps = {
    isDark: boolean
    user: {
        id: string
        username: string
        email?: string
        full_name: string
        role: string
        is_suspended?: boolean
        company_id?: string | null
        technician_type?: string | null
        specialty?: string | null
    }
    title?: string
    subtitle?: string
    allowRoles?: string[]
    companies?: { id: string; name: string }[]
    fixedCompanyId?: string
    showCompany?: boolean
    onSubmit: (payload: StaffEditPayload) => Promise<{ ok: boolean; error?: string }>
    onClose: () => void
}

export default function StaffEditModal({
    isDark,
    user,
    title = 'Edit Staff Account',
    subtitle = 'Update account details, role, and credentials.',
    allowRoles = ['front_desk', 'technician'],
    companies = [],
    fixedCompanyId,
    showCompany = false,
    onSubmit,
    onClose,
}: StaffEditModalProps) {
    const roleOptions = ROLE_OPTIONS.filter(r => allowRoles.includes(r.value))

    const [fullName, setFullName] = useState(user.full_name || '')
    const [username, setUsername] = useState(user.username || '')
    const [role, setRole] = useState(roleOptions.some(r => r.value === user.role) ? user.role : roleOptions[0]?.value || 'front_desk')
    const [technicianType, setTechnicianType] = useState<string>(user.technician_type || 'inhouse')
    const [specialty, setSpecialty] = useState(user.specialty || '')
    const [companyId, setCompanyId] = useState<string>(fixedCompanyId || user.company_id || '')
    const [error, setError] = useState('')
    const [saving, setSaving] = useState(false)

    const inputClass = `w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`
    const labelClass = `block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        if (!username.trim() || !fullName.trim()) {
            setError('Full name and username are required.')
            return
        }
        setSaving(true)
        const result = await onSubmit({
            fullName: fullName.trim(),
            username: username.trim().toLowerCase(),
            role,
            technicianType,
            specialty: role === 'technician' ? specialty.trim() : undefined,
            companyId: showCompany ? (companyId || null) : undefined,
        })
        setSaving(false)
        if (result.ok) onClose()
        else setError(result.error || 'Failed to update staff account.')
    }

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
            <div className={`border rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                <div className="flex justify-between items-center mb-5">
                    <div>
                        <h3 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
                        <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>
                    </div>
                    <button onClick={onClose} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                        <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Account</label>
                        <div className="flex flex-wrap gap-2">
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${isDark ? 'bg-slate-900 text-slate-200 border-slate-700' : 'bg-white text-slate-700 border-slate-200'}`}>
                                {ROLE_OPTIONS.find(r => r.value === user.role)?.label || user.role.replace('_', ' ')}
                            </span>
                            {user.email && (
                                <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${isDark ? 'bg-slate-900 text-slate-300 border-slate-700' : 'bg-white text-slate-600 border-slate-200'}`}>
                                    ✉️ {user.email}
                                </span>
                            )}
                            <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide border ${user.is_suspended
                                ? isDark ? 'bg-rose-950 text-rose-300 border-rose-800' : 'bg-rose-50 text-rose-700 border-rose-200'
                                : isDark ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}>
                                {user.is_suspended ? 'Suspended' : 'Active'}
                            </span>
                        </div>
                    </div>

                    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                        <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>User Details</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className={labelClass}>Full Name *</label>
                                <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Username (Login Handle) *</label>
                                <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
                            </div>
                        </div>
                    </div>

                    <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                        <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{showCompany ? 'Role & Company' : 'Role'}</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className={labelClass}>Role</label>
                                <select value={role} onChange={(e) => setRole(e.target.value)} className={`${inputClass} cursor-pointer`}>
                                    {roleOptions.map(r => (
                                        <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                </select>
                            </div>
                            {showCompany && companies.length > 0 && (
                                <div>
                                    <label className={labelClass}>Company</label>
                                    <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${inputClass} cursor-pointer`}>
                                        <option value="">— None —</option>
                                        {companies.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        {role === 'technician' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                                <div>
                                    <label className={labelClass}>Technician Type</label>
                                    <select value={technicianType} onChange={(e) => setTechnicianType(e.target.value)} className={`${inputClass} cursor-pointer`}>
                                        <option value="inhouse">In-House Technician (vehicle repairs)</option>
                                        <option value="third_party">Third-Party Technician (specialist)</option>
                                    </select>
                                </div>
                                {technicianType === 'third_party' && (
                                    <div>
                                        <label className={labelClass}>Specialty</label>
                                        <input type="text" placeholder="e.g. ECU Tuning" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={inputClass} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <ChangePasswordButton isDark={isDark} accent="purple" />

                    {error && (
                        <div className={`px-4 py-3 rounded-2xl border text-xs font-bold ${isDark ? 'bg-rose-950 border-rose-800 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                            ⚠️ {error}
                        </div>
                    )}

                    <div className={`flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                        <button type="button" onClick={onClose} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}>Cancel</button>
                        <button type="submit" disabled={saving} className="px-5 py-2.5 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-60 bg-purple-600 hover:bg-purple-500">
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
