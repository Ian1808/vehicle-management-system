"use client"

type EmptyStateProps = {
    isDark: boolean
    message: string
    className?: string
}

export default function EmptyState({ isDark, message, className = '' }: EmptyStateProps) {
    return (
        <div className={`p-16 text-center rounded-3xl border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'} ${className}`}>
            {message}
        </div>
    )
}
