"use client"

import {
    activeFilterCount,
    DEFAULT_VEHICLE_FILTERS,
    SORT_OPTIONS,
    statusChipLabel,
    statusOptionsFor,
    type FilterableVehicle,
    type SortKey,
    type VehicleFilters,
} from '@/lib/vehicleFilters'

type VehicleToolbarProps = {
    isDark: boolean
    vehicles: FilterableVehicle[]
    query: string
    onQueryChange: (value: string) => void
    filters: VehicleFilters
    onFiltersChange: (next: VehicleFilters) => void
    shown: number
    total: number
    accent?: 'blue' | 'purple' | 'emerald'
    placeholder?: string
    className?: string
}

const ACCENTS = {
    blue: {
        ring: 'focus:border-blue-500 focus:ring-blue-500/30',
        text: 'text-blue-500',
        chip: 'bg-blue-600 text-white',
    },
    purple: {
        ring: 'focus:border-purple-500 focus:ring-purple-500/30',
        text: 'text-purple-400',
        chip: 'bg-purple-600 text-white',
    },
    emerald: {
        ring: 'focus:border-emerald-500 focus:ring-emerald-500/30',
        text: 'text-emerald-400',
        chip: 'bg-emerald-600 text-white',
    },
} as const

export default function VehicleToolbar({
    isDark,
    vehicles,
    query,
    onQueryChange,
    filters,
    onFiltersChange,
    shown,
    total,
    accent = 'blue',
    placeholder = 'Search plate, model, VIN, panel…',
    className = '',
}: VehicleToolbarProps) {
    const tone = ACCENTS[accent]
    const statuses = statusOptionsFor(vehicles)
    const active = activeFilterCount(filters)

    const fieldBase = `h-10 w-full rounded-xl border text-[11.5px] font-bold outline-none transition-all focus:ring-2 ${tone.ring} ${
        isDark
            ? 'bg-slate-950 border-slate-700 text-white placeholder:text-slate-500'
            : 'bg-white border-slate-200 text-slate-800 placeholder:text-slate-400'
    }`

    return (
        <div
            className={`mb-5 rounded-2xl border p-2.5 sm:p-3 ${
                isDark ? 'border-slate-800 bg-slate-900/50' : 'border-slate-200 bg-white shadow-sm'
            } ${className}`}
        >
            {/* Search */}
            <div className="relative">
                <span
                    className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                    aria-hidden="true"
                >
                    🔍
                </span>
                <input
                    type="text"
                    role="searchbox"
                    aria-label="Search vehicles"
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    placeholder={placeholder}
                    className={`${fieldBase} pl-9 pr-9`}
                />
                {query.length > 0 && (
                    <button
                        type="button"
                        onClick={() => onQueryChange('')}
                        aria-label="Clear search"
                        className={`absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                        }`}
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Status + sort dropdowns, count/reset beside them on wide screens */}
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
                    <div className="relative sm:w-52">
                        <select
                            aria-label="Filter by status"
                            value={filters.status}
                            onChange={(e) => onFiltersChange({ ...filters, status: e.target.value })}
                            className={`${fieldBase} appearance-none cursor-pointer pl-3 pr-7`}
                        >
                            <option value="all">Status: All ({total})</option>
                            {statuses.map((status) => (
                                <option key={status} value={status}>
                                    Status: {statusChipLabel(status)} ({vehicles.filter((v) => v.status === status).length})
                                </option>
                            ))}
                        </select>
                        <span
                            className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                            aria-hidden="true"
                        >
                            ▼
                        </span>
                    </div>

                    <div className="relative sm:w-52">
                        <select
                            aria-label="Sort vehicles"
                            value={filters.sort}
                            onChange={(e) => onFiltersChange({ ...filters, sort: e.target.value as SortKey })}
                            className={`${fieldBase} appearance-none cursor-pointer pl-3 pr-7`}
                        >
                            {SORT_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <span
                            className={`pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}
                            aria-hidden="true"
                        >
                            ▼
                        </span>
                    </div>
                </div>

                <div className={`flex w-full items-center justify-between gap-3 text-[11px] font-bold sm:ml-auto sm:w-auto sm:justify-end ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    <span>
                        Showing <span className={tone.text}>{shown}</span> of {total}
                    </span>
                    {active > 0 && (
                        <button
                            type="button"
                            onClick={() => onFiltersChange(DEFAULT_VEHICLE_FILTERS)}
                            className={`shrink-0 underline underline-offset-2 cursor-pointer ${tone.text}`}
                        >
                            Reset
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
