// Shared vehicle search helpers so every role's fleet list behaves the same way.

export type SearchableVehicle = {
    plate_number?: string | null
    make_model_year?: string | null
    chassis_number?: string | null
    insurance_panel?: string | null
    status?: string | null
    companies?: { name?: string | null } | null
}

const STATUS_WORDS: Record<string, string> = {
    intake: 'intake',
    pending_before_photos: 'pending before photos',
    in_repair: 'in repair',
    pending_after_photos: 'pending after photos',
    completed: 'completed',
    road_ready: 'road ready released collected',
}

// Lowercase and drop everything that is not a letter or digit, so "BKE 8213"
// still matches "BKE8213" and "pending-before" matches "Pending Before Photos".
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '')

export function vehicleSearchHaystack(vehicle: SearchableVehicle): string {
    const statusLabel = vehicle.status ? STATUS_WORDS[vehicle.status] || vehicle.status.replace(/_/g, ' ') : ''
    return normalize(
        [
            vehicle.plate_number || '',
            vehicle.make_model_year || '',
            vehicle.chassis_number || '',
            vehicle.insurance_panel || '',
            statusLabel,
            vehicle.companies?.name || '',
        ].join(' '),
    )
}

export function matchesVehicleQuery(vehicle: SearchableVehicle, query: string): boolean {
    const tokens = normalize(query).length
        ? query
              .toLowerCase()
              .split(/\s+/)
              .map(normalize)
              .filter(Boolean)
        : []
    if (tokens.length === 0) return true
    const haystack = vehicleSearchHaystack(vehicle)
    return tokens.every((token) => haystack.includes(token))
}

export function filterVehicles<T extends SearchableVehicle>(vehicles: T[], query: string): T[] {
    if (!query.trim()) return vehicles
    return vehicles.filter((vehicle) => matchesVehicleQuery(vehicle, query))
}
