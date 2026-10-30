import { createClient } from '@/utils/supabase/client'

const supabase = createClient()

export type VehicleAssignment = {
    id: string
    vehicle_id: string
    technician_id: string
    specialty: string | null
    status: 'assigned' | 'completed'
    created_at: string
    completed_at: string | null
    users?: { full_name: string | null; specialty: string | null; technician_type: string | null } | null
    vehicles?: { plate_number: string; make_model_year: string; status: string; company_id: string | null } | null
}

// Third-party technician accounts (role=technician + technician_type='third_party').
export async function fetchThirdPartyTechnicians(companyId?: string | null, isAdmin = false) {
    let query = supabase
        .from('users')
        .select('id, full_name, username, specialty, technician_type, company_id')
        .eq('role', 'technician')
        .eq('technician_type', 'third_party')
        .order('full_name', { ascending: true })

    if (!isAdmin && companyId) query = query.eq('company_id', companyId)

    const { data, error } = await query

    if (error) {
        // technician_type/specialty columns may not exist yet if the DB migration hasn't been run.
        if (error.message.includes('technician_type') || error.message.includes('specialty')) {
            console.warn('[assignmentService] technician columns missing — third-party list disabled until DB migration runs')
            return []
        }
        throw new Error(error.message)
    }
    return data || []
}

export async function fetchAssignmentsForVehicle(vehicleId: string) {
    const { data, error } = await supabase
        .from('vehicle_assignments')
        .select('*, users(full_name, specialty, technician_type)')
        .eq('vehicle_id', vehicleId)
        .order('created_at', { ascending: false })

    if (error) {
        if (error.message.includes('vehicle_assignments')) {
            console.warn('[assignmentService] vehicle_assignments table missing — assignments disabled until DB migration runs')
            return []
        }
        throw new Error(error.message)
    }
    return (data || []) as VehicleAssignment[]
}

export async function createAssignment(vehicleId: string, technicianId: string, specialty: string | null) {
    const { error } = await supabase
        .from('vehicle_assignments')
        .insert([{
            vehicle_id: vehicleId,
            technician_id: technicianId,
            specialty: specialty || null,
            status: 'assigned',
        }])

    if (error) throw new Error(error.message)
    return true
}

export async function completeAssignment(assignmentId: string) {
    const { error } = await supabase
        .from('vehicle_assignments')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', assignmentId)

    if (error) throw new Error(error.message)
    return true
}

export async function deleteAssignment(assignmentId: string) {
    const { error } = await supabase
        .from('vehicle_assignments')
        .delete()
        .eq('id', assignmentId)

    if (error) throw new Error(error.message)
    return true
}

// The queue a third-party technician sees: only vehicles assigned to them.
export async function fetchMyAssignments(technicianId: string) {
    const { data, error } = await supabase
        .from('vehicle_assignments')
        .select('*, vehicles(plate_number, make_model_year, status, company_id)')
        .eq('technician_id', technicianId)
        .order('created_at', { ascending: false })

    if (error) {
        if (error.message.includes('vehicle_assignments')) {
            console.warn('[assignmentService] vehicle_assignments table missing — assignments disabled until DB migration runs')
            return []
        }
        throw new Error(error.message)
    }
    return (data || []) as VehicleAssignment[]
}
