"use client"

import { useState } from 'react'

export type BankPayload = {
    bankName: string
    acceptsBer: boolean
    acceptsRefinance: boolean
    notes: string
}

export type BankRecord = {
    id: string
    bank_name: string
    accepts_ber: boolean
    accepts_refinance: boolean
    notes: string
    updated_at: string
}

type BankModalProps = {
    isDark: boolean
    editingBank: BankRecord | null
    onSubmit: (payload: BankPayload) => Promise<boolean>
    onClose: () => void
}

export default function BankModal({ isDark, editingBank, onSubmit, onClose }: BankModalProps) {
    const [bankName, setBankName] = useState(editingBank?.bank_name || '')
    const [acceptsBer, setAcceptsBer] = useState(Boolean(editingBank?.accepts_ber))
    const [acceptsRefinance, setAcceptsRefinance] = useState(Boolean(editingBank?.accepts_refinance))
    const [notes, setNotes] = useState(editingBank?.notes || '')
    const [saving, setSaving] = useState(false)

    const inputClass = `w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-purple-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`
    const labelClass = `block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        const ok = await onSubmit({ bankName, acceptsBer, acceptsRefinance, notes })
        setSaving(false)
        if (ok) onClose()
    }

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
            <div className={`border rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-8 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {editingBank ? 'Edit Bank Policy' : 'Add New Panel Bank'}
                    </h3>
                    <button onClick={onClose} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className={labelClass}>Bank Name *</label>
                        <input type="text" required placeholder="e.g. Maybank / CIMB" value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClass} />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <label className={`flex items-center gap-2.5 p-3 rounded-2xl border cursor-pointer ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                            <input type="checkbox" checked={acceptsBer} onChange={(e) => setAcceptsBer(e.target.checked)} className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer" />
                            <span className="text-xs font-bold">Accepts BER</span>
                        </label>
                        <label className={`flex items-center gap-2.5 p-3 rounded-2xl border cursor-pointer ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                            <input type="checkbox" checked={acceptsRefinance} onChange={(e) => setAcceptsRefinance(e.target.checked)} className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer" />
                            <span className="text-xs font-bold">Accepts Refinance</span>
                        </label>
                    </div>

                    <div>
                        <label className={labelClass}>Internal Admin Notes / Criteria</label>
                        <textarea rows={3} placeholder="e.g. Requires 3 months seasoning and original grant..." value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}>Cancel</button>
                        <button type="submit" disabled={saving} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-60">
                            {saving ? 'Saving…' : 'Save Bank Record'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}
