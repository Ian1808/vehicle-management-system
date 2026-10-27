"use client"

type StatusBadgeProps = {
    status: string
    className?: string
}

const STATUS_STYLES: Record<string, string> = {
    pending_before_photos: 'bg-amber-950 text-amber-300 border-amber-800',
    in_repair: 'bg-blue-950 text-blue-300 border-blue-800',
    pending_after_photos: 'bg-violet-950 text-violet-300 border-violet-800',
    completed: 'bg-emerald-950 text-emerald-300 border-emerald-800',
    road_ready: 'bg-emerald-950 text-emerald-300 border-emerald-800',
}

export default function StatusBadge({ status, className = '' }: StatusBadgeProps) {
    return (
        <span className={`px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border capitalize ${STATUS_STYLES[status] || 'bg-slate-800 text-slate-300 border-slate-700'} ${className}`}>
            {status.replace(/_/g, ' ')}
        </span>
    )
}
