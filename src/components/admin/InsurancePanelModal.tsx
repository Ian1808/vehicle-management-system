"use client"

import { useState } from 'react'

export type InsurancePanelPayload = {
    name: string
    notes: string
}

export type InsurancePanelRecord = {
    id: string
    name: string
    notes: string | null
    updated_at: string
    company_id?: string | null
    companies?: { name: string } | null
}

type InsurancePanelModalProps = {
    isDark: boolean
    editing: InsurancePanelRecord | null
    onSubmit: (payload: InsurancePanelPayload) => Promise<boolean>
    onClose: () => void
}

export default function InsurancePanelModal({ isDark, editing, onSubmit, onClose }: InsurancePanelModalProps) {
    const [name, setName] = useState(editing?.name || '')
    const [notes, setNotes] = useState(editing?.notes || '')
    const [saving, setSaving] = useState(false)

    const inputClass = `w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`
    const labelClass = `block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        const ok = await onSubmit({ name, notes })
        setSaving(false)
        if (ok) onClose()
    }

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
            <div className={`border rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {editing ? 'Edit Insurance Panel' : 'Add New Insurance Panel'}
                    </h3>
                    <button onClick={onClose} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className={labelClass}>Insurance Panel Name *</label>
                        <input type="text" required placeholder="e.g. Allianz / Etiqa / Zurich" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
                    </div>

                    <div>
                        <label className={labelClass}>Internal Notes / Criteria</label>
                        <textarea rows={3} placeholder="e.g. Prefers in-house assessment before approval..." value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}>Cancel</button>
                        <button type="submit" disabled={saving} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-60">
                            {saving ? 'Saving…' : 'Save Panel'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
