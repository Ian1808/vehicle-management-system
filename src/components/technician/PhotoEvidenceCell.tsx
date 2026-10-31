"use client"

import PhotoThumb from '@/components/ui/PhotoThumb'

type PhotoEvidenceCellProps = {
    isDark: boolean
    phase: 'before' | 'after'
    isCaptured: boolean
    photoUrl?: string
    readonly?: boolean
    onView: () => void
    onRemove: () => void
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    inputId: string
}

export default function PhotoEvidenceCell({ isDark, phase, isCaptured, photoUrl, readonly = false, onView, onRemove, onFileChange, inputId }: PhotoEvidenceCellProps) {
    const phaseTitle = phase === 'before' ? 'Before Repair' : 'After Repair'
    const phaseColor = phase === 'before' ? 'text-amber-400' : 'text-blue-400'

    return (
        <div className={`border rounded-2xl p-4 flex flex-col justify-between ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
            <div>
                <p className={`text-[11px] font-bold uppercase ${phaseColor} mb-1`}>{phaseTitle}</p>
                <p className={`text-[11px] mb-3 font-semibold ${isCaptured ? 'text-emerald-400' : 'text-slate-500'}`}>{isCaptured ? '✓ Captured' : 'Pending'}</p>
            </div>
            <div className="space-y-2">
                {isCaptured && (photoUrl ? (
                    <PhotoThumb url={photoUrl} alt={`${phaseTitle} photo`} onClick={onView} className="h-32 sm:h-40" />
                ) : (
                    <button onClick={onView} className={`w-full py-2 rounded-lg text-xs font-bold border cursor-pointer ${phase === 'before'
                        ? (isDark ? 'bg-slate-900 text-emerald-400 border-slate-700' : 'bg-white text-emerald-600 border-slate-200')
                        : (isDark ? 'bg-slate-900 text-blue-400 border-slate-700' : 'bg-white text-blue-600 border-slate-200')
                        }`}>
                        View Photo
                    </button>
                ))}
                {!readonly && isCaptured && (
                    <button onClick={onRemove} className={`w-full py-2 rounded-lg text-xs font-bold border cursor-pointer ${isDark ? 'bg-rose-950 text-rose-300 border-rose-800' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                        Remove
                    </button>
                )}
                {!readonly && (
                    <div className="grid grid-cols-2 gap-2">
                        <label htmlFor={inputId} className="block text-center py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow">
                            {isCaptured ? 'Retake' : 'Upload'}
                        </label>
                        <input id={inputId} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
                        <label htmlFor={`${inputId}-cam`} className={`block text-center py-2 rounded-lg text-xs font-bold text-white cursor-pointer shadow ${isDark ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-600 hover:bg-slate-500'}`}>
                            📷 {isCaptured ? 'Retake' : 'Take Photo'}
                        </label>
                        <input id={`${inputId}-cam`} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChange} />
                    </div>
                )}
            </div>
        </div>
    )
}
