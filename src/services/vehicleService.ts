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
}) {
    const { error } = await supabase.from('vehicles').insert([
        {
            ...vehicleData,
            status: 'intake',
            repair_cost: 0,
        }
    ])

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