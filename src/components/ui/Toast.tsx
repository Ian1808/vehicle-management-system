"use client"

type ToastProps = {
    message: string
    type: 'success' | 'error'
    isDark?: boolean
}

export default function Toast({ message, type, isDark = true }: ToastProps) {
    return (
        <div className="fixed top-6 right-6 z-[100] animate-bounce">
            <div className={`px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 border ${type === 'success'
                    ? isDark
                        ? 'bg-emerald-950 text-emerald-200 border-emerald-700/80 shadow-emerald-950/50'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-emerald-100/60'
                    : isDark
                        ? 'bg-rose-950 text-rose-200 border-rose-700/80 shadow-rose-950/50'
                        : 'bg-rose-100 text-rose-800 border-rose-300 shadow-rose-100/60'
                }`}>
                <span>{type === 'success' ? '✨' : '⚠️'}</span>
                <span>{message}</span>
            </div>
        </div>
    )
}
