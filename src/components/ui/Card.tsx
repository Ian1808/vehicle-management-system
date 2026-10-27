"use client"

type CardProps = {
    isDark: boolean
    children: React.ReactNode
    className?: string
    onClick?: () => void
}

export default function Card({ isDark, children, className = '', onClick }: CardProps) {
    return (
        <div
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
            onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
            className={`border rounded-3xl ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'} ${className}`}
        >
            {children}
        </div>
    )
}
