"use client"

type SearchFieldProps = {
    isDark: boolean
    value: string
    onChange: (value: string) => void
    placeholder?: string
    accent?: 'blue' | 'purple' | 'emerald'
    resultLabel?: string
    className?: string
}

const ACCENTS = {
    blue: {
        ring: 'focus:border-blue-500 focus:ring-blue-500/30',
        text: 'text-blue-500',
    },
    purple: {
        ring: 'focus:border-purple-500 focus:ring-purple-500/30',
        text: 'text-purple-400',
    },
    emerald: {
        ring: 'focus:border-emerald-500 focus:ring-emerald-500/30',
        text: 'text-emerald-400',
    },
} as const

export default function SearchField({
    isDark,
    value,
    onChange,
    placeholder = 'Search by plate, model, chassis, panel or status…',
    accent = 'blue',
    resultLabel,
    className = '',
}: SearchFieldProps) {
    const tone = ACCENTS[accent]
    return (
        <div className={`mb-5 ${className}`}>
            <div className="relative">
                <span className={`pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base ${isDark ? 'text-slate-500' : 'text-slate-400'}`} aria-hidden="true">
                    🔍
                </span>
                <input
                    type="text"
                    role="searchbox"
                    aria-label="Search vehicles"
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={placeholder}
                    className={`w-full h-11 pl-11 pr-11 rounded-xl border text-sm font-semibold outline-none transition-all focus:ring-2 ${tone.ring} ${isDark ? 'bg-slate-900 border-slate-700 text-white placeholder:text-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400'}`}
                />
                {value.length > 0 && (
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        aria-label="Clear search"
                        className={`absolute right-2.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg text-xs font-bold transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
                    >
                        ✕
                    </button>
                )}
            </div>
            {value.trim().length > 0 && resultLabel && (
                <p className={`mt-2 text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{resultLabel}</p>
            )}
        </div>
    )
}
