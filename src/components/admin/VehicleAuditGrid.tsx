"use client"

import { PHOTO_CATEGORIES } from '@/lib/photoCategories'

type MediaItem = {
    id: string
    category: string
    file_url: string
    media_type: string
    vehicle_id: string
}

type VehicleAuditGridProps = {
    isDark: boolean
    title: string
    mediaItems: MediaItem[]
    phase: 'before' | 'after'
    vehiclePlate: string
    onView: (url: string, title: string) => void
}

export default function VehicleAuditGrid({ isDark, title, mediaItems, phase, vehiclePlate, onView }: VehicleAuditGridProps) {
    const mediaType = phase === 'before' ? 'photo_before' : 'photo_after'
    const capturedTextColor = phase === 'before' ? 'text-emerald-400' : 'text-blue-400'
    const missingTextColor = phase === 'before' ? 'text-rose-400' : 'text-slate-500'
    const missingLabel = phase === 'before' ? 'Missing' : 'Pending / Not Yet Captured'
    const buttonColor = phase === 'before'
        ? (isDark ? 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700' : 'bg-white hover:bg-slate-100 text-purple-600 border-slate-200')
        : (isDark ? 'bg-slate-800 hover:bg-slate-700 text-blue-300 border-slate-700' : 'bg-white hover:bg-slate-100 text-blue-600 border-slate-200')

    return (
        <div className={`rounded-3xl border p-6 sm:p-8 shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
            <h3 className={`text-sm font-extrabold uppercase tracking-wider mb-6 pb-4 border-b ${isDark ? 'border-slate-800/50' : 'border-slate-200'}`}>
                {title}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {PHOTO_CATEGORIES.map((cat) => {
                    const uploaded = mediaItems.find(m => m.category === cat.key && m.media_type === mediaType)
                    return (
                        <div key={cat.key} className={`border rounded-2xl p-4 flex flex-col justify-between ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                            <div>
                                <p className="text-xs font-extrabold uppercase tracking-wider mb-1">{cat.label}</p>
                                <p className={`text-xs font-semibold mb-4 ${uploaded ? capturedTextColor : missingTextColor}`}>
                                    {uploaded ? '✓ Captured' : missingLabel}
                                </p>
                            </div>
                            {uploaded && (
                                <button
                                    type="button"
                                    onClick={() => onView(uploaded.file_url, `${vehiclePlate} - ${cat.label} (${phase === 'before' ? 'Before' : 'After'})`)}
                                    className={`w-full text-center py-2 rounded-xl text-xs font-bold transition-colors border cursor-pointer ${buttonColor}`}
                                >
                                    View Photo
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
