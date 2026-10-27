"use client"

type ResponsiveTableProps = {
    isDark: boolean
    children: React.ReactNode
    minWidth?: string
    className?: string
}

export default function ResponsiveTable({ isDark, children, minWidth = 'min-w-[640px]', className = '' }: ResponsiveTableProps) {
    return (
        <div className={`rounded-3xl border shadow-xl overflow-hidden ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'} ${className}`}>
            <div className="overflow-x-auto">
                <table className={`w-full text-left border-collapse ${minWidth}`}>{children}</table>
            </div>
        </div>
    )
}
