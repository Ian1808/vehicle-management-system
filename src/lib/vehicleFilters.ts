// Shared vehicle filtering + sorting helpers, used by every role's fleet list.
// Status filters the list; plate / status / model / panel re-order it.

export type FilterableVehicle = {
    plate_number?: string | null
    make_model_year?: string | null
    insurance_panel?: string | null
    status?: string | null
}

export type SortKey = 'default' | 'plate_asc' | 'plate_desc' | 'status' | 'model' | 'panel'

export type VehicleFilters = {
    status: string
    sort: SortKey
}

export const DEFAULT_VEHICLE_FILTERS: VehicleFilters = {
    status: 'all',
    sort: 'default',
}

export const STATUS_ORDER = [
    'intake',
    'pending_before_photos',
    'in_repair',
    'pending_after_photos',
    'completed',
    'road_ready',
] as const

export const STATUS_LABELS: Record<string, string> = {
    intake: 'Intake',
    pending_before_photos: 'Pending Before Photos',
    in_repair: 'In Repair',
    pending_after_photos: 'Pending After Photos',
    completed: 'Completed',
    road_ready: 'Road Ready',
}

// Short chip captions so six statuses still fit on a phone without clipping.
export const STATUS_CHIP_LABELS: Record<string, string> = {
    intake: 'Intake',
    pending_before_photos: 'Before Photos',
    in_repair: 'In Repair',
    pending_after_photos: 'After Photos',
    completed: 'Completed',
    road_ready: 'Road Ready',
}

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: 'default', label: 'Sort: Default' },
    { value: 'plate_asc', label: 'Sort: Plate A → Z' },
    { value: 'plate_desc', label: 'Sort: Plate Z → A' },
    { value: 'status', label: 'Sort: Status (stage order)' },
    { value: 'model', label: 'Sort: Model A → Z' },
    { value: 'panel', label: 'Sort: Insurance panel A → Z' },
]

export const NO_PANEL = 'None Assigned'

export function statusLabel(status?: string | null): string {
    if (!status) return '—'
    return STATUS_LABELS[status] || status.replace(/_/g, ' ')
}

export function statusChipLabel(status: string): string {
    return STATUS_CHIP_LABELS[status] || statusLabel(status)
}

// "PERODUA MYVI (Standard) - 2020" -> "PERODUA MYVI"
// "PERODUA BEZZA - 1.3 (A) - 2021" -> "PERODUA BEZZA"
export function modelBase(makeModelYear?: string | null): string {
    if (!makeModelYear) return ''
    const head = makeModelYear.split(' - ')[0]
    return head.replace(/\(.*$/, '').trim().toUpperCase()
}

export function panelOf(vehicle: FilterableVehicle): string {
    return (vehicle.insurance_panel || '').trim() || NO_PANEL
}

const statusRank = (status?: string | null): number => {
    const i = STATUS_ORDER.indexOf((status || '') as (typeof STATUS_ORDER)[number])
    return i === -1 ? STATUS_ORDER.length : i
}

const byPlate = (a: FilterableVehicle, b: FilterableVehicle) =>
    (a.plate_number || '').toUpperCase().localeCompare((b.plate_number || '').toUpperCase())

const byModel = (a: FilterableVehicle, b: FilterableVehicle) =>
    modelBase(a.make_model_year).localeCompare(modelBase(b.make_model_year)) || byPlate(a, b)

// Statuses actually present in this list, in canonical stage order.
export function statusOptionsFor<T extends FilterableVehicle>(list: T[]): string[] {
    return Array.from(new Set(list.map((v) => v.status).filter(Boolean) as string[])).sort(
        (a, b) => statusRank(a) - statusRank(b),
    )
}

export function activeFilterCount(filters: VehicleFilters): number {
    let n = 0
    if (filters.status !== 'all') n += 1
    if (filters.sort !== 'default') n += 1
    return n
}

export function applyVehicleFilters<T extends FilterableVehicle>(list: T[], filters: VehicleFilters): T[] {
    const out = filters.status === 'all' ? list : list.filter((v) => v.status === filters.status)

    switch (filters.sort) {
        case 'plate_asc':
            return [...out].sort(byPlate)
        case 'plate_desc':
            return [...out].sort((a, b) => byPlate(b, a))
        case 'status':
            return [...out].sort((a, b) => statusRank(a.status) - statusRank(b.status) || byPlate(a, b))
        case 'model':
            return [...out].sort(byModel)
        case 'panel':
            return [...out].sort((a, b) => panelOf(a).localeCompare(panelOf(b)) || byPlate(a, b))
        default:
            return out
    }
}
