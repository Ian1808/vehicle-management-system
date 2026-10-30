"use client"

import { useState } from 'react'

type CompanyNameModalProps = {
    title: string
    initialName: string
    isDark: boolean
    accent?: 'purple' | 'blue'
    onSave: (name: string) => void
    onClose: () => void
}

export default function CompanyNameModal({ title, initialName, isDark, accent = 'purple', onSave, onClose }: CompanyNameModalProps) {
    const [name, setName] = useState(initialName)

    const accentText = accent === 'blue' ? 'text-blue-400' : 'text-purple-400'
    const accentButton = accent === 'blue' ? 'bg-blue-600 hover:bg-blue-500' : 'bg-purple-600 hover:bg-purple-500'

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className={`absolute inset-0 ${isDark ? 'bg-black/70' : 'bg-black/40'} backdrop-blur-sm`} onClick={onClose} />
            <div className={`relative w-full max-w-sm rounded-3xl shadow-2xl border p-6 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                <h3 className={`text-base font-black tracking-tight mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>{title}</h3>
                <input
                    type="text"
                    value={name}
                    autoFocus
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onSave(name.trim()) }}
                    placeholder="Company name"
                    className={`w-full border rounded-2xl px-4 py-2.5 text-sm font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-700 text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'}`}
                />
                <div className="flex gap-2 mt-5">
                    <button
                        onClick={() => onSave(name.trim())}
                        disabled={!name.trim()}
                        className={`flex-1 ${accentButton} disabled:opacity-40 text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-lg transition-all cursor-pointer`}
                    >
                        Save
                    </button>
                    <button
                        onClick={onClose}
                        className={`flex-1 px-4 py-2.5 rounded-2xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}
                    >
                        Cancel
                    </button>
                </div>
                <p className={`mt-3 text-[10px] font-semibold ${accentText}`}>Changing the name updates it everywhere it is shown.</p>
            </div>
        </div>
    )
}
