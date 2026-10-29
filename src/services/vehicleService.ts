import { createClient } from '@/utils/supabase/client'

const supabase = createClient()

export async function fetchActiveVehicles() {
    const { data, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)
    return data || []
}

export async function fetchVehicleMedia(vehicleId: string) {
    const { data, error } = await supabase
        .from('vehicle_media')
        .select('*')
        .eq('vehicle_id', vehicleId)

    if (error) throw new Error(error.message)
    return data || []
}

export async function insertVehicle(vehicleData: {
    plate_number: string
    chassis_number: string
    make_model_year: string
    insurance_panel?: string
    intake_cost?: number
    market_value?: number
    created_by?: string | null
    // UI-only payload keys carried by the intake modal; never sent to PostgREST.
    grantFile?: File | null
    ocrScan?: object | null
}): Promise<string | null> {
    // Build the payload explicitly from known columns only — spreading vehicleData
    // would leak grantFile/ocrScan into PostgREST and fail with
    // "Could not find the 'grantFile' column of 'vehicles' in the schema cache".
    const { data, error } = await supabase.from('vehicles').insert([
        {
            plate_number: vehicleData.plate_number,
            chassis_number: vehicleData.chassis_number,
            make_model_year: vehicleData.make_model_year,
            insurance_panel: vehicleData.insurance_panel,
            intake_cost: vehicleData.intake_cost,
            market_value: vehicleData.market_value,
            created_by: vehicleData.created_by,
            status: 'intake',
            repair_cost: 0,
        }
    ]).select('id').single()

    if (error) throw new Error(error.message)
    return data?.id ?? null
}

export async function updateVehicleStatus(vehicleId: string, newStatus: string) {
    const { error } = await supabase
        .from('vehicles')
        .update({ status: newStatus })
        .eq('id', vehicleId)

    if (error) throw new Error(error.message)
    return true
}

export async function deleteDocumentRecord(vehicleId: string, category: string) {
    const { error } = await supabase
        .from('vehicle_media')
        .delete()
        .eq('vehicle_id', vehicleId)
        .eq('category', category)
        .eq('media_type', 'document')

    if (error) throw new Error(error.message)
}