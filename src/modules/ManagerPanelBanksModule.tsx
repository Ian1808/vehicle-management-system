"use client"

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useTheme } from '@/lib/theme'
import Toast from '@/components/ui/Toast'
import Card from '@/components/ui/Card'
import SectionHeading from '@/components/ui/SectionHeading'
import EmptyState from '@/components/ui/EmptyState'
import ConfirmModal from '@/components/ui/ConfirmModal'
import BankModal, { type BankPayload, type BankRecord } from '@/components/admin/BankModal'
import InsurancePanelModal, { type InsurancePanelPayload, type InsurancePanelRecord } from '@/components/admin/InsurancePanelModal'

type ToastState = { message: string; type: 'success' | 'error' } | null

type DeleteTarget = { kind: 'bank' | 'insurance'; id: string; label: string } | null

export default function ManagerPanelBanksModule({ embedded = false }: { embedded?: boolean }) {
    const { isDark } = useTheme()
    const [loading, setLoading] = useState(true)
    const [toast, setToast] = useState<ToastState>(null)
    const [role, setRole] = useState<string | null>(null)
    const [viewCompanyId, setViewCompanyId] = useState<string | null>(null)
    const [companyName, setCompanyName] = useState('')
    const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])

    const [banks, setBanks] = useState<BankRecord[]>([])
    const [insurancePanels, setInsurancePanels] = useState<InsurancePanelRecord[]>([])

    const [showBankModal, setShowBankModal] = useState(false)
    const [editingBank, setEditingBank] = useState<BankRecord | null>(null)
    const [showInsuranceModal, setShowInsuranceModal] = useState(false)
    const [editingInsurance, setEditingInsurance] = useState<InsurancePanelRecord | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
    const [deleting, setDeleting] = useState(false)

    const supabase = useMemo(() => createClient(), [])
    const isAdminView = role === 'admin'

    function showToast(message: string, type: 'success' | 'error') {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    async function fetchBanks(scopeCompanyId: string) {
        const { data, error } = await supabase
            .from('banks')
            .select('*')
            .eq('company_id', scopeCompanyId)
            .order('bank_name', { ascending: true })
        if (error) {
            console.warn('[ManagerPanels] banks fetch:', error.message)
            showToast('Could not load panel banks. Did you run the SQL migration?', 'error')
            return
        }
        setBanks(data || [])
    }

    async function fetchInsurancePanels(scopeCompanyId: string) {
        const { data, error } = await supabase
            .from('insurance_panels')
            .select('*')
            .eq('company_id', scopeCompanyId)
            .order('name', { ascending: true })
        if (error) {
            console.warn('[ManagerPanels] insurance fetch:', error.message)
            showToast('Could not load insurance panels. Did you run the SQL migration?', 'error')
            return
        }
        setInsurancePanels(data || [])
    }

    async function loadCompanyData(companyId: string) {
        await Promise.all([fetchBanks(companyId), fetchInsurancePanels(companyId)])
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

                if (!userData || (userData.role !== 'manager' && userData.role !== 'admin')) {
                    showToast('Access Denied: Managers and Admins only.', 'error')
                    setTimeout(() => { window.location.href = '/' }, 1500)
                    return
                }

                setRole(userData.role)

                if (userData.role === 'manager') {
                    if (!userData.company_id) {
                        showToast('Your account is not assigned to a company yet.', 'error')
                        setTimeout(() => { window.location.href = '/' }, 1500)
                        return
                    }
                    setViewCompanyId(userData.company_id)
                    const { data: company } = await supabase
                        .from('companies')
                        .select('name')
                        .eq('id', userData.company_id)
                        .single()
                    setCompanyName(company?.name || '')
                    await loadCompanyData(userData.company_id)
                } else {
                    // Admin: read-only preview per company
                    const { data: comps, error: compErr } = await supabase
                        .from('companies')
                        .select('id, name')
                        .order('name', { ascending: true })
                    if (compErr) console.warn('[ManagerPanels] companies fetch:', compErr.message)
                    setCompanies(comps || [])
                    const first = comps?.[0] || null
                    setViewCompanyId(first?.id || null)
                    setCompanyName(first?.name || '')
                    if (first) await loadCompanyData(first.id)
                }
            } catch (err: unknown) {
                showToast(err instanceof Error ? err.message : 'Initialization failed', 'error')
            } finally {
                setLoading(false)
            }
        }
        init()
    }, [supabase])

    async function handleCompanyChange(nextId: string) {
        if (!nextId) return
        setLoading(true)
        setViewCompanyId(nextId)
        const { data: company } = await supabase
            .from('companies')
            .select('name')
            .eq('id', nextId)
            .single()
        setCompanyName(company?.name || '')
        await loadCompanyData(nextId)
        setLoading(false)
    }

    async function handleSaveBank(payload: BankPayload): Promise<boolean> {
        if (!payload.bankName.trim() || !viewCompanyId) return false

        try {
            if (editingBank) {
                const { error } = await supabase
                    .from('banks')
                    .update({
                        bank_name: payload.bankName.trim(),
                        accepts_ber: payload.acceptsBer,
                        accepts_refinance: payload.acceptsRefinance,
                        notes: payload.notes.trim(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', editingBank.id)
                if (error) throw error
                showToast('Bank criteria updated successfully!', 'success')
            } else {
                const { error } = await supabase
                    .from('banks')
                    .insert([{
                        company_id: viewCompanyId,
                        bank_name: payload.bankName.trim(),
                        accepts_ber: payload.acceptsBer,
                        accepts_refinance: payload.acceptsRefinance,
                        notes: payload.notes.trim(),
                    }])
                if (error) throw error
                showToast('New panel bank added successfully!', 'success')
            }

            fetchBanks(viewCompanyId)
            return true
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to save bank record.', 'error')
            return false
        }
    }

    async function handleSaveInsurance(payload: InsurancePanelPayload): Promise<boolean> {
        if (!payload.name.trim() || !viewCompanyId) return false

        try {
            if (editingInsurance) {
                const { error } = await supabase
                    .from('insurance_panels')
                    .update({
                        name: payload.name.trim(),
                        notes: payload.notes.trim(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', editingInsurance.id)
                if (error) throw error
                showToast('Insurance panel updated successfully!', 'success')
            } else {
                const { error } = await supabase
                    .from('insurance_panels')
                    .insert([{
                        company_id: viewCompanyId,
                        name: payload.name.trim(),
                        notes: payload.notes.trim(),
                    }])
                if (error) throw error
                showToast('New insurance panel added successfully!', 'success')
            }

            fetchInsurancePanels(viewCompanyId)
            return true
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to save insurance panel.', 'error')
            return false
        }
    }

    async function confirmDelete() {
        if (!deleteTarget) return
        setDeleting(true)
        try {
            if (deleteTarget.kind === 'bank') {
                const { error } = await supabase.from('banks').delete().eq('id', deleteTarget.id)
                if (error) throw error
                showToast('Panel bank removed.', 'success')
                if (viewCompanyId) fetchBanks(viewCompanyId)
            } else {
                const { error } = await supabase.from('insurance_panels').delete().eq('id', deleteTarget.id)
                if (error) throw error
                showToast('Insurance panel removed.', 'success')
                if (viewCompanyId) fetchInsurancePanels(viewCompanyId)
            }
            setDeleteTarget(null)
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Could not delete. It may still be referenced by vehicles.', 'error')
        } finally {
            setDeleting(false)
        }
    }

    const bankActionClass = `px-3 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`
    const dangerActionClass = `px-3 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${isDark ? 'text-rose-300 bg-rose-950/40 hover:bg-rose-900/50 border-rose-900/60' : 'text-rose-600 bg-rose-50 hover:bg-rose-100 border-rose-200'}`

    const companySelector = isAdminView ? (
        <div className="flex items-center gap-2">
            <span className={`text-[11px] font-extrabold uppercase tracking-wider ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>👁️ Viewing:</span>
            <select
                value={viewCompanyId || ''}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border cursor-pointer ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-700'}`}
            >
                {companies.length === 0 && <option value="">No companies</option>}
                {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
        </div>
    ) : undefined

    return (
        <div className={`min-h-screen ${embedded ? '' : 'pb-24 lg:pb-0 '}transition-colors duration-200 ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
            {toast && <Toast message={toast.message} type={toast.type} isDark={isDark} />}

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                <SectionHeading
                    isDark={isDark}
                    title={isAdminView ? `Panel Banks & Insurance — ${companyName || 'Select a company'}` : `Panel Banks & Insurance — ${companyName || 'My Company'}`}
                    subtitle={isAdminView
                        ? 'Admin preview (read-only). Each company\'s manager decides their own panels — manage them from their accounts, or see everything across companies in Admin Hub → Banks & Insurance.'
                        : "Decide which banks accept BER / Refinance cases and which insurance panels your company works with. These apply to your company only — the admin can see all companies' panels."}
                    right={companySelector}
                />

                {loading ? (
                    <EmptyState isDark={isDark} message="Loading your panel configuration..." />
                ) : !viewCompanyId ? (
                    <Card isDark={isDark} className="p-8">
                        <EmptyState isDark={isDark} message="No company selected. Create a company in the Admin Hub first." />
                    </Card>
                ) : (
                    <>
                        {/* ---- Panel Banks ---- */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <h3 className={`text-sm font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>🏦 Panel Banks ({banks.length})</h3>
                            {!isAdminView && (
                                <button
                                    onClick={() => { setEditingBank(null); setShowBankModal(true) }}
                                    className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-lg transition-all cursor-pointer"
                                >
                                    + Add Bank
                                </button>
                            )}
                        </div>

                        {banks.length === 0 ? (
                            <EmptyState isDark={isDark} message={isAdminView ? 'No panel banks configured for this company yet.' : 'No panel banks for your company yet. Click "+ Add Bank" to set your BER / refinance criteria.'} />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
                                {banks.map((b) => (
                                    <Card key={b.id} isDark={isDark} className="p-6 flex flex-col justify-between shadow-xl">
                                        <div>
                                            <h4 className={`text-lg font-black tracking-tight mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>{b.bank_name}</h4>
                                            <div className="flex flex-wrap gap-2 mb-4">
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${b.accepts_ber ? 'bg-emerald-950 text-emerald-300 border-emerald-800/60' : isDark ? 'bg-slate-900 text-slate-500 border-slate-800' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                                                    {b.accepts_ber ? '✓ Accepts BER' : '✗ No BER'}
                                                </span>
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${b.accepts_refinance ? 'bg-blue-950 text-blue-300 border-blue-800/60' : isDark ? 'bg-slate-900 text-slate-500 border-slate-800' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                                                    {b.accepts_refinance ? '✓ Accepts Refinance' : '✗ No Refinance'}
                                                </span>
                                            </div>
                                            <p className={`text-xs font-medium p-3 rounded-2xl border mb-6 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                                {b.notes || 'No specific notes recorded.'}
                                            </p>
                                        </div>
                                        {!isAdminView && (
                                            <div className="flex gap-2">
                                                <button onClick={() => { setEditingBank(b); setShowBankModal(true) }} className={`${bankActionClass} flex-1`}>
                                                    Edit &rarr;
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget({ kind: 'bank', id: b.id, label: b.bank_name })}
                                                    className={dangerActionClass}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </Card>
                                ))}
                            </div>
                        )}

                        {/* ---- Insurance Panels ---- */}
                        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                            <h3 className={`text-sm font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>🛡️ Insurance Panels ({insurancePanels.length})</h3>
                            {!isAdminView && (
                                <button
                                    onClick={() => { setEditingInsurance(null); setShowInsuranceModal(true) }}
                                    className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-2xl text-xs font-bold shadow-lg transition-all cursor-pointer"
                                >
                                    + Add Insurance Panel
                                </button>
                            )}
                        </div>

                        {insurancePanels.length === 0 ? (
                            <EmptyState isDark={isDark} message={isAdminView ? 'No insurance panels configured for this company yet.' : 'No insurance panels for your company yet. Click "+ Add Insurance Panel" to list the insurers you work with.'} />
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {insurancePanels.map((p) => (
                                    <Card key={p.id} isDark={isDark} className="p-6 flex flex-col justify-between shadow-xl">
                                        <div>
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="text-lg">🛡️</span>
                                                <h4 className={`text-lg font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>{p.name}</h4>
                                            </div>
                                            <p className={`text-xs font-medium p-3 rounded-2xl border mb-6 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                                                {p.notes || 'No specific notes recorded.'}
                                            </p>
                                        </div>
                                        {!isAdminView && (
                                            <div className="flex gap-2">
                                                <button onClick={() => { setEditingInsurance(p); setShowInsuranceModal(true) }} className={`${bankActionClass} flex-1`}>
                                                    Edit &rarr;
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget({ kind: 'insurance', id: p.id, label: p.name })}
                                                    className={dangerActionClass}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        )}
                                    </Card>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </main>

            {!isAdminView && showBankModal && (
                <BankModal
                    isDark={isDark}
                    editingBank={editingBank}
                    onSubmit={handleSaveBank}
                    onClose={() => { setShowBankModal(false); setEditingBank(null) }}
                />
            )}

            {!isAdminView && showInsuranceModal && (
                <InsurancePanelModal
                    isDark={isDark}
                    editing={editingInsurance}
                    onSubmit={handleSaveInsurance}
                    onClose={() => { setShowInsuranceModal(false); setEditingInsurance(null) }}
                />
            )}

            {!isAdminView && deleteTarget && (
                <ConfirmModal
                    isDark={isDark}
                    title="Delete this panel?"
                    message={`"${deleteTarget.label}" will be removed from your company${deleteTarget.kind === 'bank' ? '. Vehicles already linked to this bank are unaffected' : ''}. This cannot be undone.`}
                    confirmText={deleting ? 'Deleting…' : 'Delete'}
                    confirmVariant="danger"
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </div>
    )
}
