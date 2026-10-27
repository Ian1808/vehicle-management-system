"use client"

type ToastProps = {
    message: string
    type: 'success' | 'error'
}

export default function Toast({ message, type }: ToastProps) {
    return (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
            <div className={`px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 border ${type === 'success'
                    ? 'bg-emerald-950 text-emerald-200 border-emerald-700/80 shadow-emerald-950/50'
                    : 'bg-rose-950 text-rose-200 border-rose-700/80 shadow-rose-950/50'
                }`}>
                <span>{type === 'success' ? '✨' : '⚠️'}</span>
                <span>{message}</span>
            </div>
        </div>
    )
}