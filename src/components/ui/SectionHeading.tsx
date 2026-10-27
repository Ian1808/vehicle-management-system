"use client"

type SectionHeadingProps = {
    isDark: boolean
    title: string
    subtitle?: string
    right?: React.ReactNode
    className?: string
}

export default function SectionHeading({ isDark, title, subtitle, right, className = '' }: SectionHeadingProps) {
    return (
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 ${className}`}>
            <div>
                <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{title}</h2>
                {subtitle && <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>}
            </div>
            {right && <div className="shrink-0">{right}</div>}
        </div>
    )
}
