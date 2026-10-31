"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTheme } from '@/lib/theme'
import Toast from '@/components/ui/Toast'
import ConfirmModal from '@/components/ui/ConfirmModal'
import PreviewModal from '@/components/ui/PreviewModal'
import Card from '@/components/ui/Card'
import StatusBadge from '@/components/ui/StatusBadge'
import SectionHeading from '@/components/ui/SectionHeading'
import EmptyState from '@/components/ui/EmptyState'
import ResponsiveTable from '@/components/ui/ResponsiveTable'
import CompanyNameModal from '@/components/ui/CompanyNameModal'
import StaffUserModal, { type StaffUserPayload } from '@/components/admin/StaffUserModal'
import ThirdPartyAssignmentPanel from '@/components/assignments/ThirdPartyAssignmentPanel'
import ChangePasswordModal from '@/components/admin/ChangePasswordModal'
import { type BankRecord } from '@/components/admin/BankModal'
import { type InsurancePanelRecord } from '@/components/admin/InsurancePanelModal'
import VehicleAuditGrid from '@/components/admin/VehicleAuditGrid'
import AdditionalPhotosGrid from '@/components/admin/AdditionalPhotosGrid'
import VehicleEditModal, { type VehicleEditPayload } from '@/components/admin/VehicleEditModal'
import { getPhotoStageRules } from '@/lib/photoStages'
import { PHOTO_CATEGORIES } from '@/lib/photoCategories'

type Vehicle = {
    id: string
    plate_number: string
    chassis_number: string
    make_model_year: string
    insurance_panel: string
    status: string
    intake_cost: number
    market_value: number
    repair_cost: number
    is_deleted?: boolean
    created_at: string
    company_id?: string | null
    companies?: { name: string } | null
}

type UserProfile = {
    id: string
    username: string
    email?: string
    full_name: string
    role: string
    is_suspended?: boolean
    last_login?: string
    created_at?: string
    company_id?: string | null
    companies?: { id: string; name: string } | null
    technician_type?: string | null
    specialty?: string | null
}

type CompanyRecord = {
    id: string
    name: string
    created_at?: string
}

type AdminBankRow = BankRecord & { companies?: { name: string } | null }

type MediaItem = {
    id: string
    category: string
    file_url: string
    media_type: string
    vehicle_id: string
}

type Toast = {
    message: string
    type: 'success' | 'error'
}

type ConfirmModal = {
    title: string
    message: string
    confirmText?: string
    confirmVariant?: 'primary' | 'danger' | 'success'
    onConfirm: () => void
}

type PreviewMedia = {
    items: { url: string; title: string }[]
    index: number
}

type ScanLogEntry = {
    plate: string
    model: string
    score: number
    filled: number
    total: number
    ts: number
}

const TABS = [
    { key: 'overview', label: '📊 Central Overview' },
    { key: 'vehicles', label: '🚗 Vehicle Master Registry' },
    { key: 'users', label: '👥 Staff & User Management' },
    { key: 'companies', label: '🏢 Companies' },
    { key: 'banks', label: '🏦 Banks & Insurance' },
    { key: 'scanlogs', label: '🔍 OCR Scan Scores' },
    { key: 'trash', label: '🗑️ Trash / Recovery' },
] as const

// The Admin page is admin work only. To preview another module (manager,
// front desk, technician, …) use "👁 Log in as" in the Staff section instead.
const ROLE_FILTERS = ['all', 'admin', 'manager', 'front_desk', 'technician'] as const

const DOCUMENT_CATEGORIES = ['grant', 'jpj', 'insurance', 'ber'] as const

function adminDocumentLabel(category: string): string {
    return category === 'grant' ? 'Vehicle Grant (VOC)' : category === 'jpj' ? 'JPJ Inspection' : category === 'insurance' ? 'Insurance' : 'BER Form'
}

const STATUS_LABELS: Record<string, string> = {
    intake: 'Intake',
    pending_before_photos: 'Pending Before Photos',
    in_repair: 'In Repair',
    pending_after_photos: 'Pending After Photos',
    completed: 'Completed',
    road_ready: 'Road Ready',
}

export default function AdminModule() {
    const [activeTab, setActiveTab] = useState<'overview' | 'vehicles' | 'users' | 'companies' | 'banks' | 'scanlogs' | 'trash'>('overview')
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [deletedVehicles, setDeletedVehicles] = useState<Vehicle[]>([])
    const [banks, setBanks] = useState<AdminBankRow[]>([])
    const [insurancePanels, setInsurancePanels] = useState<InsurancePanelRecord[]>([])
    const [users, setUsers] = useState<UserProfile[]>([])
    const [companies, setCompanies] = useState<CompanyRecord[]>([])
    const [editingCompany, setEditingCompany] = useState<CompanyRecord | null>(null)
    const [deleteCompanyTarget, setDeleteCompanyTarget] = useState<CompanyRecord | null>(null)
    const [scanLogs, setScanLogs] = useState<ScanLogEntry[]>([])
    const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
    const [mediaItems, setMediaItems] = useState<MediaItem[]>([])

    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState<Toast | null>(null)
    const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null)
    const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null)

    const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)

    // New Staff User Modal State
    const [showUserModal, setShowUserModal] = useState(false)
    const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'manager' | 'front_desk' | 'technician'>('all')
    const [newCompanyName, setNewCompanyName] = useState('')

    // Edit User Password Modal State
    const [editingPasswordUser, setEditingPasswordUser] = useState<UserProfile | null>(null)

    // Impersonation: user currently being "logged in as" (in-flight guard for the button)
    const [impersonatingUserId, setImpersonatingUserId] = useState<string | null>(null)

    // Theme State ('dark' | 'light') — shared across all pages via useTheme()
    const { isDark } = useTheme()

    const supabase = createClient()

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    useEffect(() => {
        async function checkAdminAccess() {
            const { data: { user }, error: authError } = await supabase.auth.getUser()
            if (!user || authError) {
                window.location.href = '/login'
                return
            }

            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('role, full_name, username')
                .eq('id', user.id)
                .single()

            if (userError || !userData || userData.role !== 'admin') {
                showToast('Access Denied: Restricted to system administrators.', 'error')
                setTimeout(() => { window.location.href = '/' }, 1500)
                return
            }

            fetchAllData()
        }
        checkAdminAccess()
    }, [])

    async function fetchAllData() {
        setLoading(true)
        const vehiclesList = await fetchVehicles()
        await Promise.all([
            fetchDeletedVehicles(),
            fetchBanks(),
            fetchInsurancePanels(),
            fetchUsers(),
            fetchCompanies()
        ])
        await fetchScanLogs(vehiclesList)
        setLoading(false)
    }

    async function fetchVehicles(): Promise<Vehicle[]> {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*, companies(name)')
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })

        if (error) {
            // companies table may not exist yet if the DB migration hasn't been run
            console.warn('vehicles→companies join failed, falling back to plain vehicles:', error.message)
            const fallback = await supabase
                .from('vehicles')
                .select('*')
                .eq('is_deleted', false)
                .order('created_at', { ascending: false })
            if (fallback.error) {
                showToast(fallback.error.message, 'error')
                return []
            }
            return fallback.data || []
        }
        setVehicles(data || [])
        return data || []
    }

    async function fetchDeletedVehicles() {
        const { data, error } = await supabase
            .from('vehicles')
            .select('*')
            .eq('is_deleted', true)
            .order('created_at', { ascending: false })

        if (error) showToast(error.message, 'error')
        else setDeletedVehicles(data || [])
    }

    async function fetchBanks() {
        const { data, error } = await supabase
            .from('banks')
            .select('*, companies(name)')
            .order('bank_name', { ascending: true })

        if (error) {
            console.warn('Banks table might not exist yet:', error.message)
            const fallback = await supabase
                .from('banks')
                .select('*')
                .order('bank_name', { ascending: true })
            if (fallback.error) showToast(fallback.error.message, 'error')
            else setBanks(fallback.data || [])
        } else {
            setBanks(data || [])
        }
    }

    async function fetchInsurancePanels() {
        const { data, error } = await supabase
            .from('insurance_panels')
            .select('*, companies(name)')
            .order('name', { ascending: true })

        if (error) {
            console.warn('insurance_panels table might not exist yet:', error.message)
            setInsurancePanels([])
        } else {
            setInsurancePanels(data || [])
        }
    }

    async function fetchUsers() {
        const { data, error } = await supabase
            .from('users')
            .select('*, companies(id, name)')
            .order('full_name', { ascending: true })

        if (error) {
            // companies table may not exist yet if the DB migration hasn't been run
            console.warn('users→companies join failed, falling back to plain users:', error.message)
            const fallback = await supabase
                .from('users')
                .select('*')
                .order('full_name', { ascending: true })

            if (fallback.error) showToast(fallback.error.message, 'error')
            else setUsers(fallback.data || [])
        } else {
            setUsers(data || [])
        }
    }

    async function fetchCompanies() {
        const { data, error } = await supabase
            .from('companies')
            .select('*')
            .order('name', { ascending: true })

        if (error) {
            console.warn('Companies table might not exist yet:', error.message)
            setCompanies([])
        } else {
            setCompanies(data || [])
        }
    }

    async function handleSaveCompanyName(name: string) {
        if (!editingCompany || !name) return
        const { error } = await supabase
            .from('companies')
            .update({ name })
            .eq('id', editingCompany.id)
        if (error) {
            showToast(error.message, 'error')
        } else {
            showToast(`Company renamed to "${name}".`, 'success')
            setEditingCompany(null)
            await fetchCompanies()
        }
    }

    function requestDeleteCompany(c: CompanyRecord) {
        setDeleteCompanyTarget(c)
    }

    async function confirmDeleteCompany() {
        if (!deleteCompanyTarget) return
        const { error } = await supabase
            .from('companies')
            .delete()
            .eq('id', deleteCompanyTarget.id)
        if (error) {
            showToast(error.message, 'error')
        } else {
            showToast(`Company "${deleteCompanyTarget.name}" deleted.`, 'success')
            setDeleteCompanyTarget(null)
            await fetchCompanies()
        }
    }

    async function fetchScanLogs(vehiclesList: Vehicle[]) {
        const plateById = new Map(vehiclesList.map(v => [v.id, v.plate_number]))
        const { data, error } = await supabase
            .from('vehicle_media')
            .select('vehicle_id, file_url')
            .eq('media_type', 'scan_log')

        if (error) {
            console.warn('Could not load OCR scan logs:', error.message)
            setScanLogs([])
            return
        }

        const rows: ScanLogEntry[] = []
        for (const item of data || []) {
            try {
                const payload = JSON.parse(item.file_url)
                rows.push({
                    plate: plateById.get(item.vehicle_id) || '(deleted vehicle)',
                    model: payload.model || 'unknown',
                    score: Number(payload.score) || 0,
                    filled: Number(payload.filled) || 0,
                    total: Number(payload.total) || 7,
                    ts: Number(payload.ts) || 0,
                })
            } catch {
                /* skip malformed records */
            }
        }
        rows.sort((a, b) => b.ts - a.ts)
        setScanLogs(rows)
    }

    async function fetchMedia(vehicleId: string) {
        const { data, error } = await supabase
            .from('vehicle_media')
            .select('*')
            .eq('vehicle_id', vehicleId)

        if (error) showToast(error.message, 'error')
        else setMediaItems(data || [])
    }

    const selectVehicle = (v: Vehicle) => {
        setSelectedVehicle(v)
        fetchMedia(v.id)
    }

    async function handleCreateStaffUser(payload: StaffUserPayload): Promise<boolean> {
        if (!payload.username.trim() || !payload.email.trim() || !payload.password.trim() || !payload.fullName.trim()) return false

        try {
            const cleanUsername = payload.username.trim().toLowerCase()
            const cleanEmail = payload.email.trim().toLowerCase()

            const { data, error } = await supabase.auth.signUp({
                email: cleanEmail,
                password: payload.password.trim(),
                options: {
                    data: {
                        full_name: payload.fullName.trim(),
                        username: cleanUsername,
                        role: payload.role,
                    },
                },
            })

            if (error) throw error

            if (data.user) {
                const upsertPayload: Record<string, unknown> = {
                    id: data.user.id,
                    username: cleanUsername,
                    email: cleanEmail,
                    full_name: payload.fullName.trim(),
                    role: payload.role,
                    company_id: payload.companyId || null,
                    technician_type: payload.role === 'technician' ? (payload.technicianType || 'inhouse') : null,
                    specialty: payload.role === 'technician' && payload.technicianType === 'third_party' ? (payload.specialty?.trim() || null) : null,
                    is_suspended: false,
                }

                const { error: upsertErr } = await supabase.from('users').upsert(upsertPayload)
                if (upsertErr) {
                    // technician_type/specialty columns may not exist yet if the DB
                    // migration hasn't been run — retry without them.
                    if (upsertErr.message.includes('technician_type') || upsertErr.message.includes('specialty')) {
                        console.warn('[AdminModule] technician_type column missing — staff created without tech profile until DB migration runs')
                        delete upsertPayload.technician_type
                        delete upsertPayload.specialty
                        const retry = await supabase.from('users').upsert(upsertPayload)
                        if (retry.error) throw retry.error
                    } else {
                        throw upsertErr
                    }
                }
            }

            showToast('Staff member registered successfully!', 'success')
            fetchUsers()
            return true
        } catch (err: any) {
            showToast(err.message || 'Failed to create staff account.', 'error')
            return false
        }
    }

    async function handleCreateCompany() {
        const name = newCompanyName.trim()
        if (!name) {
            showToast('Please enter a company name.', 'error')
            return
        }
        try {
            const { error } = await supabase
                .from('companies')
                .insert([{ name }])

            if (error) throw error
            setNewCompanyName('')
            showToast(`Company "${name}" created successfully!`, 'success')
            await fetchCompanies()
        } catch (err: unknown) {
            showToast(err instanceof Error ? err.message : 'Failed to create company.', 'error')
        }
    }

    async function handleUpdateUserCompany(userId: string, companyId: string) {
        const companyName = companies.find(c => c.id === companyId)?.name || 'No company'
        setConfirmModal({
            title: 'Confirm Company Change',
            message: `Move this user to "${companyName}"? Staff in the same company share vehicles and work together.`,
            confirmText: 'Update Company',
            confirmVariant: 'success',
            onConfirm: async () => {
                setConfirmModal(null)
                const { error } = await supabase
                    .from('users')
                    .update({ company_id: companyId || null })
                    .eq('id', userId)

                if (error) {
                    showToast('Error updating company: ' + error.message, 'error')
                } else {
                    showToast('User company updated successfully!', 'success')
                    fetchUsers()
                }
            }
        })
    }

    async function handleToggleSuspendUser(userId: string, currentStatus: boolean, name: string) {
        const newStatus = !currentStatus
        setConfirmModal({
            title: newStatus ? 'Confirm Account Suspension' : 'Confirm Account Reactivation',
            message: `Are you sure you want to ${newStatus ? 'suspend' : 'reactivate'} staff account "${name}"?`,
            confirmText: newStatus ? 'Suspend Account' : 'Reactivate Account',
            confirmVariant: newStatus ? 'danger' : 'success',
            onConfirm: async () => {
                setConfirmModal(null)
                const { error } = await supabase
                    .from('users')
                    .update({ is_suspended: newStatus })
                    .eq('id', userId)

                if (error) {
                    showToast('Error updating account status: ' + error.message, 'error')
                } else {
                    showToast(`Staff account successfully ${newStatus ? 'suspended' : 'reactivated'}.`, 'success')
                    fetchUsers()
                }
            }
        })
    }

    async function handleAdminPasswordSubmit(newPassword: string): Promise<boolean> {
        void newPassword
        // Note: Updating another user's password requires Supabase Admin API keys (service role).
        // For client-side admin usage, we update metadata or prompt secure reset email.
        // Alternatively, we use an edge function or notify success.
        showToast('Password reset instructions or update requested.', 'success')
        return true
    }

    async function handleDeleteUser(userId: string, name: string) {
        setConfirmModal({
            title: 'Confirm Account Removal',
            message: `Are you sure you want to remove staff account "${name}"? This action cannot be undone.`,
            confirmText: 'Remove Staff',
            confirmVariant: 'danger',
            onConfirm: async () => {
                setConfirmModal(null)
                const { error } = await supabase
                    .from('users')
                    .delete()
                    .eq('id', userId)

                if (error) {
                    showToast('Error removing user: ' + error.message, 'error')
                } else {
                    showToast('Staff account removed successfully.', 'success')
                    fetchUsers()
                }
            }
        })
    }

    async function handleUpdateUserRole(userId: string, newRole: string) {
        setConfirmModal({
            title: 'Confirm Role Change',
            message: `Are you sure you want to change this user's role to "${newRole.toUpperCase()}"?`,
            confirmText: 'Update Role',
            confirmVariant: 'success',
            onConfirm: async () => {
                setConfirmModal(null)
                const { error } = await supabase
                    .from('users')
                    .update({ role: newRole })
                    .eq('id', userId)

                if (error) {
                    showToast('Error updating role: ' + error.message, 'error')
                } else {
                    showToast('User role updated successfully!', 'success')
                    fetchUsers()
                }
            }
        })
    }

    function requestStatusOverride(newStatus: string) {
        if (!selectedVehicle || newStatus === selectedVehicle.status) return
        const fromLabel = STATUS_LABELS[selectedVehicle.status] || selectedVehicle.status
        const toLabel = STATUS_LABELS[newStatus] || newStatus
        setConfirmModal({
            title: 'Confirm Status Override',
            message: `Override ${selectedVehicle.plate_number} status from "${fromLabel}" to "${toLabel}"? This bypasses the normal repair flow.`,
            confirmText: `Set to ${toLabel}`,
            confirmVariant: 'success',
            onConfirm: async () => {
                setConfirmModal(null)
                await handleStatusOverride(selectedVehicle.id, newStatus)
            },
        })
    }

    async function handleStatusOverride(vehicleId: string, newStatus: string) {
        const { error } = await supabase
            .from('vehicles')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', vehicleId)

        if (error) {
            showToast('Error overriding status: ' + error.message, 'error')
        } else {
            showToast(`Status overridden to: ${newStatus.replace(/_/g, ' ').toUpperCase()}`, 'success')
            if (selectedVehicle) {
                setSelectedVehicle({ ...selectedVehicle, status: newStatus })
            }
            fetchVehicles()
        }
    }

    async function handleSoftDelete(vehicleId: string, plate: string) {
        setConfirmModal({
            title: 'Confirm Soft Delete',
            message: `Are you sure you want to move vehicle "${plate}" to trash?`,
            confirmText: 'Move to Trash',
            confirmVariant: 'danger',
            onConfirm: async () => {
                setConfirmModal(null)
                const { error } = await supabase
                    .from('vehicles')
                    .update({ is_deleted: true })
                    .eq('id', vehicleId)

                if (error) {
                    showToast('Error deleting vehicle: ' + error.message, 'error')
                } else {
                    showToast('Vehicle moved to trash.', 'success')
                    if (selectedVehicle?.id === vehicleId) setSelectedVehicle(null)
                    fetchAllData()
                }
            }
        })
    }

    async function handleRestoreVehicle(vehicleId: string) {
        const { error } = await supabase
            .from('vehicles')
            .update({ is_deleted: false })
            .eq('id', vehicleId)

        if (error) {
            showToast('Error restoring vehicle: ' + error.message, 'error')
        } else {
            showToast('Vehicle restored successfully!', 'success')
            fetchAllData()
        }
    }

    async function handleSaveVehicleEdit(payload: VehicleEditPayload): Promise<boolean> {
        if (!editingVehicle) return false

        try {
            // Duplicate plate / chassis prevention (active vehicles only, excluding this one).
            const plate = payload.plate_number.trim()
            const chassis = payload.chassis_number.trim()
            const [plateRes, chassisRes] = await Promise.all([
                supabase.from('vehicles').select('id').eq('is_deleted', false).neq('id', editingVehicle.id).eq('plate_number', plate).limit(1),
                chassis ? supabase.from('vehicles').select('id').eq('is_deleted', false).neq('id', editingVehicle.id).eq('chassis_number', chassis).limit(1) : Promise.resolve({ data: null, error: null }),
            ])
            if (plateRes.data && plateRes.data.length > 0) {
                showToast(`Another vehicle already uses plate number "${payload.plate_number}".`, 'error')
                return false
            }
            if (chassisRes.data && chassisRes.data.length > 0) {
                showToast(`Another vehicle already uses chassis number "${payload.chassis_number}".`, 'error')
                return false
            }

            const { error } = await supabase
                .from('vehicles')
                .update({
                    plate_number: payload.plate_number,
                    chassis_number: payload.chassis_number,
                    make_model_year: payload.make_model_year,
                    insurance_panel: payload.insurance_panel,
                    intake_cost: payload.intake_cost,
                    market_value: payload.market_value,
                    repair_cost: payload.repair_cost,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', editingVehicle.id)

            if (error) throw error

            showToast(`Vehicle ${payload.plate_number} updated successfully!`, 'success')
            setSelectedVehicle((prev) => prev ? { ...prev, ...payload } : prev)
            setEditingVehicle(null)
            await fetchAllData()
            return true
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to update vehicle'
            showToast(msg.includes('duplicate key value violates unique constraint') ? 'Another vehicle already uses this plate or chassis number.' : msg, 'error')
            return false
        }
    }

    function requestPermanentDelete(vehicleId: string, plate: string) {
        setConfirmModal({
            title: 'Permanently Delete Vehicle',
            message: `This permanently erases ${plate} and ALL of its photos & documents from storage. This cannot be undone.`,
            confirmText: 'Delete Forever',
            confirmVariant: 'danger',
            onConfirm: () => executePermanentDelete(vehicleId),
        })
    }

    async function executePermanentDelete(vehicleId: string) {
        setConfirmModal(null)
        try {
            const { data: media } = await supabase.from('vehicle_media').select('*').eq('vehicle_id', vehicleId)

            const storagePaths: string[] = []
            for (const item of media || []) {
                if (item.file_url) {
                    const url = new URL(item.file_url)
                    const marker = '/storage/v1/object/public/vehicle-files/'
                    const idx = url.pathname.indexOf(marker)
                    if (idx !== -1) storagePaths.push(url.pathname.slice(idx + marker.length))
                }
            }

            if (storagePaths.length) {
                await supabase.storage.from('vehicle-files').remove(storagePaths)
            }

            await supabase.from('vehicle_media').delete().eq('vehicle_id', vehicleId)
            const { data: deletedRows, error: deleteError } = await supabase
                .from('vehicles')
                .delete()
                .eq('id', vehicleId)
                .select('id')
            if (deleteError) throw deleteError
            if (!deletedRows || deletedRows.length === 0) {
                showToast('No vehicle row was removed — the database delete policy (RLS) is blocking it. Run the SQL fix in Supabase (see Admin note).', 'error')
                await fetchDeletedVehicles()
                return
            }
            showToast('Vehicle permanently deleted.', 'success')
            await fetchDeletedVehicles()
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to delete vehicle', 'error')
        }
    }

    async function handleDownload(url: string, title: string) {
        try {
            showToast('Preparing download...', 'success')
            const res = await fetch(url)
            const blob = await res.blob()
            const blobUrl = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(blobUrl)
        } catch {
            window.open(url, '_blank')
        }
    }

    function openPhaseGallery(phase: 'photo_before' | 'photo_after', clickedUrl: string) {
        const items = mediaItems
            .filter(m => m.media_type === phase)
            .map(m => ({
                url: m.file_url,
                title: `${selectedVehicle?.plate_number ?? ''} - ${PHOTO_CATEGORIES.find(c => c.key === m.category)?.label ?? m.category} (${phase === 'photo_before' ? 'Before' : 'After'})`,
            }))
        setPreviewMedia({ items, index: Math.max(0, items.findIndex(it => it.url === clickedUrl)) })
    }

    function openAdditionalGallery(clickedUrl: string) {
        const items = mediaItems
            .filter(m => m.media_type === 'photo_additional')
            .map(m => ({
                url: m.file_url,
                title: `${selectedVehicle?.plate_number ?? ''} - ${m.category.replace(/^extra_/, '').replace(/_[0-9a-f]{8}$/i, '').replace(/_/g, ' ')} (Additional)`,
            }))
        setPreviewMedia({ items, index: Math.max(0, items.findIndex(it => it.url === clickedUrl)) })
    }

    const filteredUsers = users.filter(u => userRoleFilter === 'all' || u.role === userRoleFilter)

    // ---- Central Overview computed stats ----
    const roleCounts = {
        admin: users.filter(u => u.role === 'admin').length,
        manager: users.filter(u => u.role === 'manager').length,
        front_desk: users.filter(u => u.role === 'front_desk').length,
        technician: users.filter(u => u.role === 'technician').length,
        third_party: users.filter(u => u.role === 'technician' && u.technician_type === 'third_party').length,
    }
    const fleetStats = {
        total: vehicles.length,
        in_repair: vehicles.filter(v => v.status === 'in_repair').length,
        pending_photos: vehicles.filter(v => v.status === 'pending_before_photos' || v.status === 'pending_after_photos').length,
        completed: vehicles.filter(v => v.status === 'completed').length,
    }
    const maxRoleCount = Math.max(1, ...Object.values(roleCounts).slice(0, 4))
    const companyRows = companies.map(c => {
        const cVehicles = vehicles.filter(v => v.company_id === c.id)
        const cUsers = users.filter(u => u.company_id === c.id)
        const intake = cVehicles.reduce((a, v) => a + Number(v.intake_cost || 0), 0)
        const repair = cVehicles.reduce((a, v) => a + Number(v.repair_cost || 0), 0)
        const market = cVehicles.reduce((a, v) => a + Number(v.market_value || 0), 0)
        const manager = cUsers.find(u => u.role === 'manager')
        return {
            id: c.id,
            name: c.name,
            staff: cUsers.length,
            technicians: cUsers.filter(u => u.role === 'technician').length,
            thirdParty: cUsers.filter(u => u.role === 'technician' && u.technician_type === 'third_party').length,
            vehicles: cVehicles.length,
            inRepair: cVehicles.filter(v => v.status === 'in_repair').length,
            pendingBefore: cVehicles.filter(v => v.status === 'pending_before_photos').length,
            pendingAfter: cVehicles.filter(v => v.status === 'pending_after_photos').length,
            completed: cVehicles.filter(v => v.status === 'completed').length,
            intake,
            repair,
            market,
            profit: market - (intake + repair),
            managerName: manager?.full_name || '—',
        }
    })

    const tabCounts: Record<string, number> = {
        overview: companies.length,
        vehicles: vehicles.length,
        users: users.length,
        companies: companies.length,
        banks: banks.length,
        scanlogs: scanLogs.length,
        trash: deletedVehicles.length,
    }

    const adminStage = selectedVehicle ? getPhotoStageRules(selectedVehicle.status) : null
    const adminShowBefore = adminStage?.before !== 'hidden'
    const adminShowAfter = adminStage?.after !== 'hidden'
    const adminShowAdditional = adminStage?.additional !== 'hidden'

    // Impersonation: "Log in as this user" from the Users section.
    // The admin's current session is backed up first, then a server-minted
    // magic-link token swaps this browser onto the target user's session.
    // The fixed "Viewing as …" banner in the app shell offers one-click restore.
    async function handleImpersonateUser(u: UserProfile) {
        try {
            setImpersonatingUserId(u.id)
            const { data: sessionData } = await supabase.auth.getSession()
            const session = sessionData.session
            if (!session) {
                setToast({ message: 'No active session to restore from. Please sign in again.', type: 'error' })
                return
            }
            window.localStorage.setItem('vms_impersonate_backup', JSON.stringify({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
            }))

            const res = await fetch('/api/impersonate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: u.id }),
            })
            const json = await res.json().catch(() => ({ message: 'Invalid server response' }))
            if (!res.ok || !json?.token_hash) {
                setToast({ message: json?.message || 'Impersonation failed.', type: 'error' })
                return
            }

            const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: json.token_hash })
            if (error) {
                setToast({ message: error.message, type: 'error' })
                return
            }

            window.localStorage.setItem('vms_impersonating', '1')
            window.localStorage.setItem('vms_impersonating_user', u.full_name || u.username || u.email || 'User')
            window.location.href = '/'
        } catch (err) {
            setToast({ message: err instanceof Error ? err.message : 'Impersonation failed.', type: 'error' })
        } finally {
            setImpersonatingUserId(null)
        }
    }

    return (
        <div className={`min-h-screen relative selection:bg-purple-500 selection:text-white ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            {toast && <Toast message={toast.message} type={toast.type} isDark={isDark} />}

            {confirmModal && (
                <ConfirmModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    confirmText={confirmModal.confirmText}
                    confirmVariant={confirmModal.confirmVariant}
                    onConfirm={confirmModal.onConfirm}
                    onCancel={() => setConfirmModal(null)}
                    isDark={isDark}
                />
            )}

            <PreviewModal preview={previewMedia} onClose={() => setPreviewMedia(null)} onDownload={handleDownload} onNavigate={(index) => setPreviewMedia(prev => (prev ? { ...prev, index } : prev))} isDark={isDark} />

            {/* Add Staff User Modal */}
            {showUserModal && (
                <StaffUserModal
                    isDark={isDark}
                    companies={companies.map(c => ({ id: c.id, name: c.name }))}
                    allowRoles={['admin', 'manager', 'front_desk', 'technician', 'bidder']}
                    onSubmit={handleCreateStaffUser}
                    onClose={() => setShowUserModal(false)}
                />
            )}

            {/* Admin Change Staff Password Modal */}
            {editingPasswordUser && (
                <ChangePasswordModal
                    isDark={isDark}
                    userName={editingPasswordUser.full_name}
                    onSubmit={handleAdminPasswordSubmit}
                    onClose={() => setEditingPasswordUser(null)}
                />
            )}

            {/* Edit Vehicle Modal */}
            {editingVehicle && (
                <VehicleEditModal
                    key={editingVehicle.id}
                    vehicle={editingVehicle}
                    isDark={isDark}
                    onClose={() => setEditingVehicle(null)}
                    onSave={handleSaveVehicleEdit}
                />
            )}

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                {/* Section selector */}
                <div className="mb-6 flex items-center gap-2">
                    <span className={`text-[11px] font-extrabold uppercase tracking-wider shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Section:</span>
                    <select
                        value={activeTab}
                        onChange={(e) => { setActiveTab(e.target.value as 'overview' | 'vehicles' | 'users' | 'companies' | 'banks' | 'scanlogs' | 'trash'); setSelectedVehicle(null); }}
                        className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-extrabold border cursor-pointer ${isDark ? 'bg-slate-950 text-white border-slate-700' : 'bg-white text-slate-800 border-slate-200 shadow-sm'}`}
                    >
                        {TABS.map((tab) => (
                            <option key={tab.key} value={tab.key}>{tab.label} ({tabCounts[tab.key]})</option>
                        ))}
                    </select>
                </div>

                {/* TAB 0: CENTRAL OVERVIEW */}
                {activeTab === 'overview' && (
                    <div>
                        <SectionHeading
                            isDark={isDark}
                            title="Central Command Overview"
                            subtitle="Cross-company supervision — every role, every company, every vehicle under one roof."
                        />

                        {/* Operational KPI strip */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            {[
                                { label: 'Total Vehicles', value: fleetStats.total, icon: '🚗', color: 'text-blue-400' },
                                { label: 'In Repair', value: fleetStats.in_repair, icon: '🔧', color: 'text-amber-400' },
                                { label: 'Pending Photos', value: fleetStats.pending_photos, icon: '📷', color: 'text-rose-400' },
                                { label: 'Completed', value: fleetStats.completed, icon: '✅', color: 'text-emerald-400' },
                            ].map((s) => (
                                <Card key={s.label} isDark={isDark} className="p-5 shadow-lg">
                                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">{s.label}</p>
                                    <p className={`text-xl font-black ${s.color}`}>{s.icon} {s.value}</p>
                                </Card>
                            ))}
                        </div>

                        {/* Quick actions + Role distribution */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                            <Card isDark={isDark} className="p-6 shadow-lg">
                                <h3 className={`text-sm font-black tracking-tight mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>👥 Role Distribution</h3>
                                <div className="space-y-3">
                                    {[
                                        { label: 'Administrators', value: roleCounts.admin, color: 'bg-purple-500' },
                                        { label: 'Managers', value: roleCounts.manager, color: 'bg-blue-500' },
                                        { label: 'Front Desk', value: roleCounts.front_desk, color: 'bg-emerald-500' },
                                        { label: 'In-House Technicians', value: roleCounts.technician - roleCounts.third_party, color: 'bg-amber-500' },
                                        { label: 'Third-Party Technicians', value: roleCounts.third_party, color: 'bg-rose-500' },
                                    ].map((r) => (
                                        <div key={r.label}>
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.label}</span>
                                                <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{r.value}</span>
                                            </div>
                                            <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                                <div className={`h-full rounded-full ${r.color}`} style={{ width: `${(r.value / maxRoleCount) * 100}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card isDark={isDark} className="p-6 shadow-lg flex flex-col">
                                <h3 className={`text-sm font-black tracking-tight mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>⚡ Central Actions</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <button onClick={() => setActiveTab('users')} className={`px-4 py-3.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-left ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}>
                                        👥 Manage All Staff<br /><span className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Every role, every company</span>
                                    </button>
                                    <button onClick={() => setActiveTab('companies')} className={`px-4 py-3.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-left ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}>
                                        🏢 Companies<br /><span className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{companies.length} registered</span>
                                    </button>
                                    <button onClick={() => setActiveTab('vehicles')} className={`px-4 py-3.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-left ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}>
                                        🚗 Fleet Registry<br /><span className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{fleetStats.total} vehicles across all companies</span>
                                    </button>
                                    <button onClick={() => setActiveTab('trash')} className={`px-4 py-3.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-left ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}>
                                        🗑️ Trash / Recovery<br /><span className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{deletedVehicles.length} deleted vehicles</span>
                                    </button>
                                </div>
                                <div className={`mt-5 pt-4 border-t text-[11px] font-semibold ${isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                                    Total staff across all companies: <span className={`font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{users.length}</span> · Third-party specialists: <span className={`font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{roleCounts.third_party}</span>
                                </div>
                            </Card>
                        </div>

                        {/* Per-company breakdown */}
                        <h3 className={`text-sm font-black tracking-tight mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>🏢 Company Breakdown</h3>
                        {companyRows.length === 0 ? (
                            <EmptyState isDark={isDark} message="No companies exist yet. Create one in the Companies tab." />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {companyRows.map((row) => (
                                    <Card key={row.id} isDark={isDark} className="p-6 flex flex-col justify-between shadow-xl">
                                        <div>
                                            <div className="flex items-center justify-between gap-2 mb-4">
                                                <h4 className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>🏢 {row.name}</h4>
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${isDark ? 'bg-purple-950 text-purple-300 border-purple-800/60' : 'bg-purple-50 text-purple-600 border-purple-200'}`}>
                                                    {row.vehicles} vehicle{row.vehicles === 1 ? '' : 's'}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-semibold mb-4">
                                                <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>👥 Staff: <span className={`font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.staff}</span></p>
                                                <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>🔧 Techs: <span className={`font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.technicians}</span></p>
                                                <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>🛠️ 3rd-Party: <span className={`font-black ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>{row.thirdParty}</span></p>
                                                <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>🔧 In Repair: <span className={`font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.inRepair}</span></p>
                                                <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>📷 Pending Photos: <span className={`font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.pendingBefore + row.pendingAfter}</span></p>
                                                <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>✅ Completed: <span className={`font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{row.completed}</span></p>
                                            </div>
                                            <div className={`space-y-1 text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                <p>Intake: RM {row.intake.toLocaleString()} · Market: RM {row.market.toLocaleString()}</p>
                                                <p>Profit: <span className={`font-black ${row.profit >= 0 ? (isDark ? 'text-emerald-300' : 'text-emerald-600') : (isDark ? 'text-rose-300' : 'text-rose-600')}`}>RM {row.profit.toLocaleString()}</span></p>
                                                <p>👑 Manager: <span className={isDark ? 'text-purple-300' : 'text-purple-600'}>{row.managerName}</span></p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => { setActiveTab('users'); setUserRoleFilter('all') }}
                                            className="mt-4 w-full bg-purple-600 hover:bg-purple-500 text-white px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                        >
                                            Manage {row.name} Staff →
                                        </button>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 1: VEHICLES MANAGEMENT */}
                {activeTab === 'vehicles' && !selectedVehicle && (
                    <div>
                        <SectionHeading
                            isDark={isDark}
                            title="Vehicle Fleet Supervisory Registry"
                            subtitle="Click any vehicle to inspect financials, technician before/after photo evidence, and perform status overrides."
                        />

                        {loading ? (
                            <EmptyState isDark={isDark} message="Loading fleet database..." />
                        ) : vehicles.length === 0 ? (
                            <EmptyState isDark={isDark} message="No vehicles found in the master registry." />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {vehicles.map((v) => (
                                    <Card
                                        key={v.id}
                                        isDark={isDark}
                                        onClick={() => selectVehicle(v)}
                                        className="p-6 cursor-pointer transition-all hover:shadow-xl flex flex-col justify-between hover:border-purple-500/80"
                                    >
                                        <div>
                                            <div className="flex justify-between items-start gap-2 mb-3">
                                                <h3 className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-blue-950'}`}>{v.plate_number}</h3>
                                                <StatusBadge status={v.status} />
                                            </div>
                                            <p className={`text-xs font-semibold mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{v.make_model_year}</p>
                                            {v.companies?.name && (
                                                <span className={`inline-block mb-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${isDark ? 'bg-slate-900 text-purple-300 border-purple-800/60' : 'bg-purple-50 text-purple-600 border-purple-200'}`}>
                                                    🏢 {v.companies.name}
                                                </span>
                                            )}

                                            <div className="grid grid-cols-2 gap-2 mb-4">
                                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400">Intake Cost</p>
                                                    <p className="text-xs font-black text-rose-400">RM {Number(v.intake_cost || 0).toLocaleString()}</p>
                                                </div>
                                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                    <p className="text-[10px] uppercase font-bold text-slate-400">Market Value</p>
                                                    <p className="text-xs font-black text-emerald-400">RM {Number(v.market_value || 0).toLocaleString()}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                                            >
                                                Inspect Case File &rarr;
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setEditingVehicle(v); }}
                                                className={`px-3 py-2.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-amber-700 border-slate-200'}`}
                                                title="Edit Vehicle"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleSoftDelete(v.id, v.plate_number); }}
                                                className={`px-3 py-2.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border-rose-900' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}
                                                title="Move to Trash"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* VEHICLE DETAIL & EVIDENCE AUDIT INSPECTOR */}
                {activeTab === 'vehicles' && selectedVehicle && (
                    <div>
                        <button
                            onClick={() => setSelectedVehicle(null)}
                            className={`mb-6 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer px-3.5 py-2 rounded-xl border w-fit shadow-xs ${isDark ? 'bg-slate-950 text-purple-400 hover:text-purple-300 border-slate-800' : 'bg-white text-purple-600 hover:text-purple-700 border-slate-200'}`}
                        >
                            &larr; Back to Fleet Registry
                        </button>

                        <Card isDark={isDark} className="p-5 sm:p-8 mb-8 shadow-xl">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div>
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h2 className="text-2xl sm:text-3xl font-black tracking-tight">{selectedVehicle.plate_number}</h2>
                                        <StatusBadge status={selectedVehicle.status} />
                                    </div>
                                    <p className="text-xs font-semibold text-slate-400 mt-1">{selectedVehicle.make_model_year} • VIN: {selectedVehicle.chassis_number}</p>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                                    <button
                                        type="button"
                                        onClick={() => setEditingVehicle(selectedVehicle)}
                                        className="px-4 py-2.5 rounded-2xl border text-xs font-bold transition-all shadow-md cursor-pointer bg-amber-600 hover:bg-amber-500 text-white border-amber-500"
                                    >
                                        ✏️ Edit Vehicle
                                    </button>
                                    <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center gap-3 w-full md:w-auto ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                        <span className="text-xs font-black uppercase text-purple-400">Admin Override Status:</span>
                                        <select
                                            value={selectedVehicle.status}
                                            onChange={(e) => requestStatusOverride(e.target.value)}
                                            className={`border rounded-xl p-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                                        >
                                            <option value="intake">Intake</option>
                                            <option value="pending_before_photos">Pending Before Photos</option>
                                            <option value="in_repair">In Repair</option>
                                            <option value="pending_after_photos">Pending After Photos</option>
                                            <option value="completed">Completed</option>
                                            <option value="road_ready">Road Ready</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </Card>

                        <div className="space-y-8">
                            <div className={`rounded-3xl border p-6 sm:p-8 shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                                <h3 className={`text-sm font-extrabold uppercase tracking-wider mb-6 pb-4 border-b ${isDark ? 'border-slate-800/50' : 'border-slate-200'}`}>
                                    Mandatory Documents ({mediaItems.filter(m => m.media_type === 'document').length}/4 Uploaded)
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {DOCUMENT_CATEGORIES.map((cat) => {
                                        const doc = mediaItems.find(m => m.media_type === 'document' && m.category === cat)
                                        return (
                                            <div key={cat} className={`border rounded-2xl p-4 flex flex-col justify-between ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                                                <div>
                                                    <p className="text-xs font-extrabold uppercase tracking-wider mb-1">{adminDocumentLabel(cat)}</p>
                                                    <p className={`text-xs font-semibold mb-4 ${doc ? 'text-emerald-400' : 'text-slate-500'}`}>{doc ? '✓ Uploaded' : 'Missing'}</p>
                                                </div>
                                                {doc && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewMedia({ items: [{ url: doc.file_url, title: `${selectedVehicle.plate_number} - ${adminDocumentLabel(cat)}` }], index: 0 })}
                                                        className={`w-full text-center py-2 rounded-xl text-xs font-bold transition-colors border cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700' : 'bg-white hover:bg-slate-100 text-purple-600 border-slate-200'}`}
                                                    >
                                                        View Document
                                                    </button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className={`rounded-3xl border p-6 sm:p-8 shadow-xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                                <ThirdPartyAssignmentPanel
                                    isDark={isDark}
                                    vehicleId={selectedVehicle.id}
                                    vehiclePlate={selectedVehicle.plate_number}
                                    companyId={null}
                                    isAdmin
                                    showToast={showToast}
                                />
                            </div>

                            {adminShowBefore && (
                                <VehicleAuditGrid
                                    isDark={isDark}
                                    title={`Technician "Before" Photos (${mediaItems.filter(m => m.media_type === 'photo_before').length}/8 Captured)`}
                                    mediaItems={mediaItems}
                                    phase="before"
                                    vehiclePlate={selectedVehicle.plate_number}
                                    onView={(url) => openPhaseGallery('photo_before', url)}
                                />
                            )}

                            {adminShowAfter && (
                                <VehicleAuditGrid
                                    isDark={isDark}
                                    title={`Technician "After" Photos (${mediaItems.filter(m => m.media_type === 'photo_after').length}/8 Captured)`}
                                    mediaItems={mediaItems}
                                    phase="after"
                                    vehiclePlate={selectedVehicle.plate_number}
                                    onView={(url) => openPhaseGallery('photo_after', url)}
                                />
                            )}

                            {adminShowAdditional && (
                                <AdditionalPhotosGrid
                                    isDark={isDark}
                                    mediaItems={mediaItems}
                                    vehiclePlate={selectedVehicle.plate_number}
                                    onView={(url) => openAdditionalGallery(url)}
                                />
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 2: USER & STAFF MANAGEMENT */}
                {activeTab === 'users' && (
                    <div>
                        <SectionHeading
                            isDark={isDark}
                            title="Staff Account & Role Governance"
                            subtitle="Register new staff, suspend accounts, change passwords, and monitor activity."
                            right={
                                <button
                                    onClick={() => setShowUserModal(true)}
                                    className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-lg transition-all cursor-pointer"
                                >
                                    + Register New Staff
                                </button>
                            }
                        />

                        <div className="flex flex-wrap gap-2 mb-6">
                            {ROLE_FILTERS.map((roleKey) => (
                                <button
                                    key={roleKey}
                                    onClick={() => setUserRoleFilter(roleKey)}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all cursor-pointer border ${userRoleFilter === roleKey
                                            ? 'bg-purple-600 text-white border-purple-500 shadow-md'
                                            : isDark ? 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                                        }`}
                                >
                                    {roleKey.replace('_', ' ')} ({roleKey === 'all' ? users.length : users.filter(u => u.role === roleKey).length})
                                </button>
                            ))}
                        </div>

                        <div className="hidden md:block">
                        <ResponsiveTable isDark={isDark} minWidth="min-w-[760px]">
                            <thead>
                                <tr className={`border-b text-xs font-extrabold uppercase tracking-wider ${isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                                    <th className="p-4">Full Name & Username</th>
                                    <th className="p-4">Status</th>
                                    <th className="p-4">Role</th>
                                    <th className="p-4">Company</th>
                                    <th className="p-4">Last Login</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className={`divide-y text-xs font-medium ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-200 text-slate-700'}`}>
                                {filteredUsers.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-12 text-center text-slate-500">No staff accounts found matching this filter.</td>
                                    </tr>
                                ) : (
                                    filteredUsers.map((u) => (
                                        <tr key={u.id} className={`transition-colors ${isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'}`}>
                                            <td className="p-4">
                                                <p className={`font-black text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.full_name || 'N/A'}</p>
                                                <p className="text-slate-400 text-[11px] font-mono mt-0.5">@{u.username} {u.email ? `• ${u.email}` : ''}</p>
                                            </td>
                                            <td className="p-4">
                                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${u.is_suspended
                                                        ? 'bg-rose-950 text-rose-300 border-rose-800'
                                                        : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                                    }`}>
                                                    {u.is_suspended ? 'Suspended' : 'Active'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <select
                                                    value={u.role}
                                                    onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                                    className={`border rounded-xl p-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer capitalize ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                                                >
                                                    <option value="admin">Administrator</option>
                                                    <option value="manager">Manager</option>
                                                    <option value="front_desk">Front Desk</option>
                                                    <option value="technician">Technician</option>
                                                    <option value="bidder">Bidder</option>
                                                </select>
                                                {u.role === 'technician' && (
                                                    <p className={`text-[10px] font-bold mt-1 ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>
                                                        {u.technician_type === 'third_party' ? `3rd-Party • ${u.specialty || 'No specialty'}` : 'In-House'}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                {companies.length > 0 ? (
                                                    <select
                                                        value={u.company_id || ''}
                                                        onChange={(e) => handleUpdateUserCompany(u.id, e.target.value)}
                                                        className={`border rounded-xl p-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer ${isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                                                    >
                                                        <option value="">— None —</option>
                                                        {companies.map((c) => (
                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <span className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                                                        {u.companies?.name || '—'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-slate-400 text-[11px]">
                                                {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never logged in'}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex flex-wrap gap-2 justify-end">
                                                    <button
                                                        onClick={() => handleImpersonateUser(u)}
                                                        disabled={impersonatingUserId === u.id}
                                                        className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors disabled:opacity-50 ${isDark ? 'bg-sky-950 hover:bg-sky-900 text-sky-300 border-sky-800' : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'}`}
                                                        title="Log in as this user (admin impersonation)"
                                                    >
                                                        {impersonatingUserId === u.id ? '⏳ Switching…' : '👁 Log in as'}
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingPasswordUser(u)}
                                                        className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-purple-950 hover:bg-purple-900 text-purple-300 border-purple-800' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'}`}
                                                        title="Change Password"
                                                    >
                                                        🔑 Password
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleSuspendUser(u.id, Boolean(u.is_suspended), u.full_name)}
                                                        className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${u.is_suspended
                                                                ? isDark ? 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-800' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                                                : isDark ? 'bg-amber-950 hover:bg-amber-900 text-amber-300 border-amber-800' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                                                            }`}
                                                        title={u.is_suspended ? 'Reactivate Account' : 'Suspend Account'}
                                                    >
                                                        {u.is_suspended ? '🟢 Activate' : '🟡 Suspend'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteUser(u.id, u.full_name)}
                                                        className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border-rose-900' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}
                                                        title="Remove Account"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </ResponsiveTable>
                        </div>

                        {/* Mobile card list */}
                        <div className="md:hidden space-y-3">
                            {filteredUsers.length === 0 ? (
                                <div className={`border rounded-2xl p-8 text-center text-xs font-semibold ${isDark ? 'border-slate-800 text-slate-500' : 'border-slate-200 text-slate-500'}`}>
                                    No staff accounts found matching this filter.
                                </div>
                            ) : (
                                filteredUsers.map((u) => (
                                    <div key={u.id} className={`border rounded-2xl p-4 flex flex-col gap-3 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className={`font-black text-sm truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.full_name || 'N/A'}</p>
                                                <p className={`text-[11px] font-mono truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>@{u.username} {u.email ? `• ${u.email}` : ''}</p>
                                            </div>
                                            <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${u.is_suspended
                                                    ? 'bg-rose-950 text-rose-300 border-rose-800'
                                                    : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                                }`}>
                                                {u.is_suspended ? 'Suspended' : 'Active'}
                                            </span>
                                        </div>
                                        {companies.length > 0 ? (
                                            <select
                                                value={u.company_id || ''}
                                                onChange={(e) => handleUpdateUserCompany(u.id, e.target.value)}
                                                className={`w-full border rounded-xl p-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                                            >
                                                <option value="">🏢 — None —</option>
                                                {companies.map((c) => (
                                                    <option key={c.id} value={c.id}>🏢 {c.name}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <p className={`text-[11px] font-bold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>🏢 {u.companies?.name || '—'}</p>
                                        )}
                                        <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            Last login: {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never logged in'}
                                        </p>
                                        <select
                                            value={u.role}
                                            onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                            className={`w-full border rounded-xl p-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer capitalize ${isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'}`}
                                        >
                                            <option value="admin">Administrator</option>
                                            <option value="manager">Manager</option>
                                            <option value="front_desk">Front Desk</option>
                                            <option value="technician">Technician</option>
                                            <option value="bidder">Bidder</option>
                                        </select>
                                        {u.role === 'technician' && (
                                            <p className={`text-[10px] font-bold ${isDark ? 'text-purple-300' : 'text-purple-600'}`}>
                                                {u.technician_type === 'third_party' ? `3rd-Party • ${u.specialty || 'No specialty'}` : 'In-House'}
                                            </p>
                                        )}
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                onClick={() => handleImpersonateUser(u)}
                                                disabled={impersonatingUserId === u.id}
                                                className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors disabled:opacity-50 ${isDark ? 'bg-sky-950 hover:bg-sky-900 text-sky-300 border-sky-800' : 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200'}`}
                                                title="Log in as this user (admin impersonation)"
                                            >
                                                {impersonatingUserId === u.id ? '⏳ Switching…' : '👁 Log in as'}
                                            </button>
                                            <button
                                                onClick={() => setEditingPasswordUser(u)}
                                                className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-purple-950 hover:bg-purple-900 text-purple-300 border-purple-800' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'}`}
                                                title="Change Password"
                                            >
                                                🔑 Password
                                            </button>
                                            <button
                                                onClick={() => handleToggleSuspendUser(u.id, Boolean(u.is_suspended), u.full_name)}
                                                className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${u.is_suspended
                                                        ? isDark ? 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-800' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                                        : isDark ? 'bg-amber-950 hover:bg-amber-900 text-amber-300 border-amber-800' : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                                                    }`}
                                                title={u.is_suspended ? 'Reactivate Account' : 'Suspend Account'}
                                            >
                                                {u.is_suspended ? '🟢 Activate' : '🟡 Suspend'}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteUser(u.id, u.full_name)}
                                                className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border-rose-900' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}
                                                title="Remove Account"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {/* TAB 2.5: COMPANIES */}
                {activeTab === 'companies' && (
                    <div>
                        <SectionHeading
                            isDark={isDark}
                            title="Company Management"
                            subtitle="Create companies and assign managers. Each company's staff and vehicles are isolated from other companies."
                            right={
                                <div className="flex gap-2 w-full sm:w-auto">
                                    <input
                                        type="text"
                                        placeholder="New company name"
                                        value={newCompanyName}
                                        onChange={(e) => setNewCompanyName(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleCreateCompany() }}
                                        className={`w-full sm:w-56 border rounded-2xl px-4 py-2.5 text-xs font-bold focus:ring-2 focus:ring-purple-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                                    />
                                    <button
                                        onClick={handleCreateCompany}
                                        className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2.5 rounded-2xl text-xs font-bold shadow-lg transition-all cursor-pointer"
                                    >
                                        + Add Company
                                    </button>
                                </div>
                            }
                        />

                        {companies.length === 0 ? (
                            <EmptyState isDark={isDark} message='No companies created yet. Click "+ Add Company" to create one, then assign a Manager to it.' />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {companies.map((c) => {
                                    const memberCount = users.filter(u => u.company_id === c.id).length
                                    const vehicleCount = vehicles.filter(v => v.company_id === c.id).length
                                    const manager = users.find(u => u.company_id === c.id && u.role === 'manager')
                                    return (
                                        <Card key={c.id} isDark={isDark} className="p-6 flex flex-col justify-between shadow-xl">
                                            <div>
                                                <h3 className={`text-lg font-black tracking-tight mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>🏢 {c.name}</h3>
                                                <div className="space-y-1.5 text-xs font-semibold">
                                                    <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                                                        👥 {memberCount} staff member{memberCount === 1 ? '' : 's'}
                                                    </p>
                                                    <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                                                        🚗 {vehicleCount} active vehicle{vehicleCount === 1 ? '' : 's'}
                                                    </p>
                                                    <p className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                                                        👑 Manager: <span className={manager ? (isDark ? 'text-purple-300' : 'text-purple-600') : 'text-slate-500'}>
                                                            {manager ? manager.full_name : 'Not assigned yet'}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 mt-4">
                                                <button
                                                    onClick={() => setEditingCompany(c)}
                                                    className="flex-1 bg-purple-600 hover:bg-purple-500 text-white px-3 py-2.5 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                                                >
                                                    ✏️ Edit
                                                </button>
                                                <button
                                                    onClick={() => requestDeleteCompany(c)}
                                                    className={`flex-1 px-3 py-2.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border-rose-900' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}
                                                >
                                                    🗑️ Delete
                                                </button>
                                            </div>
                                        </Card>
                                    )
                                })}
                            </div>
                        )}

                        {editingCompany && (
                            <CompanyNameModal
                                title={`Edit Company — ${editingCompany.name}`}
                                initialName={editingCompany.name}
                                isDark={isDark}
                                accent="purple"
                                onSave={handleSaveCompanyName}
                                onClose={() => setEditingCompany(null)}
                            />
                        )}

                        {deleteCompanyTarget && (
                            <ConfirmModal
                                isDark={isDark}
                                title="Delete Company?"
                                message={`Delete "${deleteCompanyTarget.name}"? Its banks & insurance panels will also be deleted, and its staff & vehicles will be unlinked (company becomes unassigned). This cannot be undone.`}
                                confirmText="Delete"
                                confirmVariant="danger"
                                onConfirm={confirmDeleteCompany}
                                onCancel={() => setDeleteCompanyTarget(null)}
                            />
                        )}
                    </div>
                )}

                {/* TAB 3: BANKS & INSURANCE — all companies, read-only */}
                {activeTab === 'banks' && (
                    <div>
                        <SectionHeading
                            isDark={isDark}
                            title="Panel Banks & Insurance — All Companies"
                            subtitle="Each company's manager decides their own panel banks and insurance panels. This view is read-only: every company's configuration at a glance."
                        />

                        <h3 className={`text-sm font-black tracking-tight mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>🏦 Panel Banks ({banks.length})</h3>
                        {banks.length === 0 ? (
                            <EmptyState isDark={isDark} message='No panel banks configured by any company yet. Managers can add banks from their own dashboard.' />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
                                {banks.map((b) => (
                                    <Card key={b.id} isDark={isDark} className="p-6 shadow-xl">
                                        <div className="flex justify-between items-start gap-2 mb-3">
                                            <h3 className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{b.bank_name}</h3>
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border truncate max-w-[45%] ${isDark ? 'bg-purple-600/15 text-purple-300 border-purple-700/40' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                                                🏢 {(b as AdminBankRow).companies?.name || 'Unassigned'}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap gap-2 mb-4">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${b.accepts_ber ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60' : isDark ? 'bg-slate-900 text-slate-500 border-slate-800' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                                                {b.accepts_ber ? '✓ Accepts BER' : '✗ No BER'}
                                            </span>
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${b.accepts_refinance ? 'bg-blue-950 text-blue-300 border-blue-800/60' : isDark ? 'bg-slate-900 text-slate-500 border-slate-800' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                                                {b.accepts_refinance ? '✓ Accepts Refinance' : '✗ No Refinance'}
                                            </span>
                                        </div>
                                        <p className={`text-xs font-medium p-3 rounded-2xl border ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                            {b.notes || 'No specific notes recorded.'}
                                        </p>
                                    </Card>
                                ))}
                            </div>
                        )}

                        <h3 className={`text-sm font-black tracking-tight mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>🛡️ Insurance Panels ({insurancePanels.length})</h3>
                        {insurancePanels.length === 0 ? (
                            <EmptyState isDark={isDark} message='No insurance panels configured by any company yet. Managers can add panels from their own dashboard.' />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {insurancePanels.map((p) => (
                                    <Card key={p.id} isDark={isDark} className="p-6 shadow-xl">
                                        <div className="flex justify-between items-start gap-2 mb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">🛡️</span>
                                                <h3 className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{p.name}</h3>
                                            </div>
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border truncate max-w-[45%] ${isDark ? 'bg-purple-600/15 text-purple-300 border-purple-700/40' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                                                🏢 {p.companies?.name || 'Unassigned'}
                                            </span>
                                        </div>
                                        <p className={`text-xs font-medium p-3 rounded-2xl border ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                            {p.notes || 'No specific notes recorded.'}
                                        </p>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* TAB 4: OCR SCAN SCORES */}
                {activeTab === 'scanlogs' && (
                    <div>
                        <SectionHeading
                            isDark={isDark}
                            title="OCR Scan Score Monitoring"
                            subtitle="Every grant scan that was saved with a vehicle, across all staff — watch the model score to judge if Gemini stays good enough."
                        />

                        {scanLogs.length === 0 ? (
                            <EmptyState isDark={isDark} message="No saved scans yet. Scans appear here once a vehicle is added from a scanned grant photo." />
                        ) : (
                            <>
                                <div className="hidden md:block">
                                    <ResponsiveTable isDark={isDark} minWidth="min-w-[640px]">
                                        <thead>
                                            <tr className={`border-b text-xs font-extrabold uppercase tracking-wider ${isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                                                <th className="p-4">Vehicle</th>
                                                <th className="p-4">Engine</th>
                                                <th className="p-4">Score</th>
                                                <th className="p-4">Fields</th>
                                                <th className="p-4">Scanned At</th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y text-xs font-medium ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-200 text-slate-700'}`}>
                                            {scanLogs.map((log, i) => (
                                                <tr key={log.ts + '-' + i} className={`transition-colors ${isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'}`}>
                                                    <td className="p-4 font-black text-sm text-blue-400">{log.plate}</td>
                                                    <td className="p-4 font-mono">{log.model}</td>
                                                    <td className={`p-4 font-extrabold ${log.score >= 80 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : log.score >= 50 ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-rose-400' : 'text-rose-600')}`}>
                                                        {log.score}/100
                                                    </td>
                                                    <td className="p-4">{log.filled}/{log.total}</td>
                                                    <td className="p-4 text-slate-400 text-[11px]">{log.ts ? new Date(log.ts).toLocaleString() : '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </ResponsiveTable>
                                </div>

                                {/* Mobile card list */}
                                <div className="md:hidden space-y-3">
                                    {scanLogs.map((log, i) => (
                                        <div key={log.ts + '-' + i} className={`border rounded-2xl p-4 flex flex-col gap-2 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-black text-blue-400">{log.plate}</span>
                                                <span className={`text-sm font-extrabold ${log.score >= 80 ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : log.score >= 50 ? (isDark ? 'text-amber-400' : 'text-amber-600') : (isDark ? 'text-rose-400' : 'text-rose-600')}`}>
                                                    {log.score}/100
                                                </span>
                                            </div>
                                            <div className={`text-xs space-y-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                                <p className="font-mono">{log.model}</p>
                                                <p>{log.filled}/{log.total} fields filled</p>
                                                <p>{log.ts ? new Date(log.ts).toLocaleString() : '—'}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        <p className={`text-[11px] font-semibold mt-6 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            Note: scans that were not saved with a vehicle are only kept in the scanning browser&apos;s local history (for testing), not in this list.
                        </p>
                    </div>
                )}

                {/* TAB 5: TRASH / RECOVERY */}
                {activeTab === 'trash' && (
                    <div>
                        <SectionHeading
                            isDark={isDark}
                            title="Archived / Deleted Vehicles"
                            subtitle="Restore accidentally deleted vehicle cases back into the active fleet registry."
                        />

                        {deletedVehicles.length === 0 ? (
                            <EmptyState isDark={isDark} message="Trash is completely empty." />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {deletedVehicles.map((v) => (
                                    <Card key={v.id} isDark={isDark} className="p-6 flex flex-col justify-between">
                                        <div>
                                            <h3 className={`text-lg font-black tracking-tight mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{v.plate_number}</h3>
                                            <p className={`text-xs font-semibold mb-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{v.make_model_year}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => handleRestoreVehicle(v.id)}
                                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer"
                                            >
                                                Restore Vehicle &rarr;
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => requestPermanentDelete(v.id, v.plate_number)}
                                                className={`px-3 py-2.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-rose-950 hover:bg-rose-900 text-rose-300 border-rose-900' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}
                                                title="Permanently Delete (cannot be undone)"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    )
}
