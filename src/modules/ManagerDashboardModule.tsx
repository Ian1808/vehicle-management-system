"use client"

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTheme } from '@/lib/theme'
import Toast from '@/components/ui/Toast'
import Card from '@/components/ui/Card'
import SectionHeading from '@/components/ui/SectionHeading'
import EmptyState from '@/components/ui/EmptyState'
import StatusBadge from '@/components/ui/StatusBadge'

type ToastState = { message: string; type: 'success' | 'error' } | null

type CompanyVehicle = {
    id: string
    plate_number: string
    make_model_year: string
    status: string
    intake_cost?: number | null
    market_value?: number | null
}

type CompanyStaff = {
    id: string
    full_name: string
    role: string
    technician_type?: string | null
    specialty?: string | null
}

const STATUS_FLOW_LABELS: Record<string, string> = {
    intake: 'Intake',
    pending_before_photos: 'Pending Before Photos',
    in_repair: 'In Repair',
    pending_after_photos: 'Pending After Photos',
    completed: 'Completed',
    road_ready: 'Road Ready',
}

export default function ManagerDashboardModule() {
    const { isDark } = useTheme()
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState<ToastState>(null)
    const [companyName, setCompanyName] = useState('')
    const [companyId, setCompanyId] = useState<string | null>(null)
    const [vehicles, setVehicles] = useState<CompanyVehicle[]>([])
    const [staff, setStaff] = useState<CompanyStaff[]>([])

    const supabase = useMemo(() => createClient(), [])

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    useEffect(() => {
        async function init() {
            try {
                const { data: { user }, error: authError } = await supabase.auth.getUser()
                if (!user || authError) {
                    window.location.href = '/login'
                    return
                }

                const { data: userData } = await supabase
                    .from('users')
                    .select('role, company_id')
                    .eq('id', user.id)
                    .single()

                if (!userData || userData.role !== 'manager') {
                    showToast('Access Denied: Managers only.', 'error')
                    setTimeout(() => { window.location.href = '/' }, 1500)
                    return
                }

                setCompanyId(userData.company_id || null)

                if (userData.company_id) {
                    const { data: company } = await supabase
                        .from('companies')
                        .select('name')
                        .eq('id', userData.company_id)
                        .single()
                    setCompanyName(company?.name || '')
                }

                const [vehRes, staffRes] = await Promise.all([
                    supabase
                        .from('vehicles')
                        .select('id, plate_number, make_model_year, status, intake_cost, market_value')
                        .eq('company_id', userData.company_id || '')
                        .eq('is_deleted', false),
                    supabase
                        .from('users')
                        .select('id, full_name, role, technician_type, specialty')
                        .eq('company_id', userData.company_id || ''),
                ])

                if (vehRes.error) console.warn('[ManagerDashboard] vehicles fetch:', vehRes.error.message)
                else setVehicles(vehRes.data || [])
                if (staffRes.error) console.warn('[ManagerDashboard] staff fetch:', staffRes.error.message)
                else setStaff(staffRes.data || [])
            } catch (err: unknown) {
                showToast(err instanceof Error ? err.message : 'Initialization failed', 'error')
            } finally {
                setLoading(false)
            }
        }
        init()
    }, [supabase])

    // ---- Company metrics ----
    const intake = vehicles.reduce((a, v) => a + Number(v.intake_cost || 0), 0)
    const market = vehicles.reduce((a, v) => a + Number(v.market_value || 0), 0)
    const repair = 0 // repair outlay is tracked per vehicle during the flow; keep visible as RM 0 until wired
    const profit = market - (intake + repair)

    const fleetStats = {
        total: vehicles.length,
        in_repair: vehicles.filter(v => v.status === 'in_repair').length,
        pending_photos: vehicles.filter(v => v.status === 'pending_before_photos' || v.status === 'pending_after_photos').length,
        completed: vehicles.filter(v => v.status === 'completed').length,
    }

    const staffStats = {
        total: staff.length,
        front_desk: staff.filter(u => u.role === 'front_desk').length,
        inhouse: staff.filter(u => u.role === 'technician' && u.technician_type !== 'third_party').length,
        third_party: staff.filter(u => u.role === 'technician' && u.technician_type === 'third_party').length,
    }

    const maxStaffCount = Math.max(1, staffStats.front_desk, staffStats.inhouse, staffStats.third_party)

    return (
        <div className={`min-h-screen transition-colors duration-200 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            {toast && <Toast message={toast.message} type={toast.type} isDark={isDark} />}

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <SectionHeading
                    isDark={isDark}
                    title={`Company Overview — ${companyName || 'My Company'}`}
                    subtitle="Your company's fleet, staff, and financials at a glance. Work is split across Front Desk, Technicians, and Staff Management."
                />

                {loading ? (
                    <EmptyState isDark={isDark} message="Loading your company dashboard..." />
                ) : !companyId ? (
                    <Card isDark={isDark} className="p-8">
                        <EmptyState isDark={isDark} message="Your account is not assigned to a company yet. Ask an administrator to assign your company." />
                    </Card>
                ) : (
                    <>
                        {/* Financial summary */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            {[
                                { label: 'Total Intake Cost', value: intake, color: 'text-rose-400' },
                                { label: 'Repair Outlay', value: repair, color: 'text-amber-400' },
                                { label: 'Market Value', value: market, color: 'text-blue-400' },
                                { label: 'Projected Net Profit', value: profit, color: 'text-emerald-400' },
                            ].map((s) => (
                                <Card key={s.label} isDark={isDark} className="p-5 shadow-lg">
                                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">{s.label}</p>
                                    <p className={`text-xl font-black ${s.color}`}>RM {s.value.toLocaleString()}</p>
                                </Card>
                            ))}
                        </div>

                        {/* Operational + staff KPI strip */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                            {[
                                { label: 'Total Vehicles', value: fleetStats.total, icon: '🚗' },
                                { label: 'In Repair', value: fleetStats.in_repair, icon: '🔧' },
                                { label: 'Pending Photos', value: fleetStats.pending_photos, icon: '📷' },
                                { label: 'Completed', value: fleetStats.completed, icon: '✅' },
                            ].map((s) => (
                                <Card key={s.label} isDark={isDark} className="p-5 shadow-lg">
                                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">{s.label}</p>
                                    <p className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{s.icon} {s.value}</p>
                                </Card>
                            ))}
                        </div>

                        {/* Staff overview + quick actions */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                            <Card isDark={isDark} className="p-6 shadow-lg">
                                <h3 className={`text-sm font-black tracking-tight mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>👥 Your Staff</h3>
                                <div className="space-y-3">
                                    {[
                                        { label: 'Front Desk', value: staffStats.front_desk, color: 'bg-emerald-500' },
                                        { label: 'In-House Technicians', value: staffStats.inhouse, color: 'bg-amber-500' },
                                        { label: 'Third-Party Technicians', value: staffStats.third_party, color: 'bg-rose-500' },
                                    ].map((r) => (
                                        <div key={r.label}>
                                            <div className="flex justify-between items-baseline mb-1">
                                                <span className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{r.label}</span>
                                                <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{r.value}</span>
                                            </div>
                                            <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                                                <div className={`h-full rounded-full ${r.color}`} style={{ width: `${(r.value / maxStaffCount) * 100}%` }} />
                                            </div>
                                        </div>
                                    ))}
                                    <p className={`pt-3 text-[11px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                        {staffStats.total} staff member{staffStats.total === 1 ? '' : 's'} under your company.
                                    </p>
                                </div>
                            </Card>

                            <Card isDark={isDark} className="p-6 shadow-lg flex flex-col">
                                <h3 className={`text-sm font-black tracking-tight mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>⚡ Manager Quick Actions</h3>
                                <div className="grid grid-cols-2 gap-3">
                                    <button onClick={() => window.location.href = '/?tab=frontdesk'} className={`px-4 py-3.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-left ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}>
                                        📋 Front Desk Work<br /><span className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Intake & vehicle queue</span>
                                    </button>
                                    <button onClick={() => window.location.href = '/?tab=staff'} className={`px-4 py-3.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-left ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}>
                                        👥 Manage Staff<br /><span className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Add / edit / suspend accounts</span>
                                    </button>
                                    <button onClick={() => window.location.href = '/?tab=technician'} className={`px-4 py-3.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-left ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}>
                                        🔧 Technician Portal<br /><span className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Workshop photo queue</span>
                                    </button>
                                    <button onClick={() => window.location.href = '/?tab=frontdesk'} className={`px-4 py-3.5 rounded-2xl text-xs font-bold border transition-all cursor-pointer text-left ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-white border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}>
                                        🚗 New Vehicle Intake<br /><span className={`text-[10px] font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Register a new vehicle</span>
                                    </button>
                                </div>
                            </Card>
                        </div>

                        {/* Active company vehicles */}
                        <h3 className={`text-sm font-black tracking-tight mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>🚗 Company Fleet ({fleetStats.total})</h3>
                        {vehicles.length === 0 ? (
                            <EmptyState isDark={isDark} message="No active vehicles under your company yet. Register one from Front Desk Work." />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {vehicles.map((v) => (
                                    <Card key={v.id} isDark={isDark} className="p-6 shadow-xl">
                                        <div className="flex justify-between items-start gap-2 mb-3">
                                            <h4 className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-blue-950'}`}>{v.plate_number}</h4>
                                            <StatusBadge status={v.status} />
                                        </div>
                                        <p className={`text-xs font-semibold mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{v.make_model_year || '—'}</p>
                                        <div className={`text-[11px] font-semibold space-y-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                            <p>Stage: {STATUS_FLOW_LABELS[v.status] || v.status}</p>
                                            <p>Intake: RM {Number(v.intake_cost || 0).toLocaleString()} · Market: RM {Number(v.market_value || 0).toLocaleString()}</p>
                                        </div>
                                        <button
                                            onClick={() => window.location.href = '/?tab=frontdesk'}
                                            className="mt-4 w-full bg-purple-600 hover:bg-purple-500 text-white px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                        >
                                            Open in Front Desk →
                                        </button>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    )
}
