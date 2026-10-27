"use client"

import { useState } from 'react'

export type StaffUserPayload = {
    fullName: string
    username: string
    email: string
    password: string
    role: string
}

type StaffUserModalProps = {
    isDark: boolean
    onSubmit: (payload: StaffUserPayload) => Promise<boolean>
    onClose: () => void
}

export default function StaffUserModal({ isDark, onSubmit, onClose }: StaffUserModalProps) {
    const [fullName, setFullName] = useState('')
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [role, setRole] = useState('front_desk')
    const [saving, setSaving] = useState(false)

    const inputClass = `w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`
    const labelClass = `block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        const ok = await onSubmit({ fullName, username, email, password, role })
        setSaving(false)
        if (ok) onClose()
    }

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
            <div className={`border rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Register New Staff Member</h3>
                        <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Create credentials and assign initial operational permissions.</p>
                    </div>
                    <button onClick={onClose} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className={labelClass}>Full Name *</label>
                        <input type="text" required placeholder="e.g. Ahmad bin Ali" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
                    </div>

                    <div>
                        <label className={labelClass}>Username *</label>
                        <input type="text" required placeholder="e.g. ahmad" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
                    </div>

                    <div>
                        <label className={labelClass}>Staff Email *</label>
                        <input type="email" required placeholder="staff@workshop.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
                    </div>

                    <div>
                        <label className={labelClass}>Temporary Password *</label>
                        <input type="password" required placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} />
                    </div>

                    <div>
                        <label className={labelClass}>Role Assignment *</label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className={`w-full border rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer capitalize ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                        >
                            <option value="front_desk">Front Desk</option>
                            <option value="technician">Technician</option>
                            <option value="admin">Administrator</option>
                            <option value="bidder">Bidder</option>
                        </select>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}>Cancel</button>
                        <button type="submit" disabled={saving} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-60">
                            {saving ? 'Creating…' : 'Create Staff Account'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
