"use client"

type PhotoEvidenceCellProps = {
    isDark: boolean
    phase: 'before' | 'after'
    isCaptured: boolean
    onView: () => void
    onRemove: () => void
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    inputId: string
}

export default function PhotoEvidenceCell({ isDark, phase, isCaptured, onView, onRemove, onFileChange, inputId }: PhotoEvidenceCellProps) {
    const phaseTitle = phase === 'before' ? 'Before Repair' : 'After Repair'
    const phaseColor = phase === 'before' ? 'text-amber-400' : 'text-blue-400'
    const viewColor = phase === 'before'
        ? (isDark ? 'bg-slate-900 text-emerald-400 border-slate-700' : 'bg-white text-emerald-600 border-slate-200')
        : (isDark ? 'bg-slate-900 text-blue-400 border-slate-700' : 'bg-white text-blue-600 border-slate-200')

    return (
        <div className={`border rounded-xl p-3 flex flex-col justify-between ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
            <div>
                <p className={`text-[10px] font-bold uppercase ${phaseColor} mb-1`}>{phaseTitle}</p>
                <p className={`text-[11px] mb-3 font-semibold ${isCaptured ? 'text-emerald-400' : 'text-slate-500'}`}>{isCaptured ? '✓ Captured' : 'Pending'}</p>
            </div>
            <div className="space-y-2">
                {isCaptured && (
                    <>
                        <button onClick={onView} className={`w-full py-2 rounded-lg text-xs font-bold border cursor-pointer ${viewColor}`}>
                            View Photo
                        </button>
                        <button onClick={onRemove} className={`w-full py-2 rounded-lg text-xs font-bold border cursor-pointer ${isDark ? 'bg-rose-950 text-rose-300 border-rose-800' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                            Remove
                        </button>
                    </>
                )}
                <label htmlFor={inputId} className="w-full block text-center py-2 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow">
                    {isCaptured ? 'Retake' : 'Upload'}
                </label>
                <input id={inputId} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
            </div>
        </div>
    )
}
