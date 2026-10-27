"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { addWatermarkToFile } from '@/utils/watermark'
import { fetchActiveVehicles, fetchVehicleMedia, insertVehicle, updateVehicleStatus, deleteDocumentRecord } from '@/services/vehicleService'
import { useTheme } from '@/lib/theme'
import { PHOTO_CATEGORIES } from '@/lib/photoCategories'
import { uniqueFileSuffix } from '@/lib/uploadUtils'
import VehicleIntakeModal from '@/components/forms/VehicleIntakeModal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import PreviewModal from '@/components/ui/PreviewModal'
import Toast from '@/components/ui/Toast'
import AccountSettingsModal, { type AccountSettingsPayload } from '@/components/ui/AccountSettingsModal'
import Card from '@/components/ui/Card'
import StatusBadge from '@/components/ui/StatusBadge'
import SectionHeading from '@/components/ui/SectionHeading'
import EmptyState from '@/components/ui/EmptyState'
import ResponsiveTable from '@/components/ui/ResponsiveTable'

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
  created_at: string
}

type MediaItem = {
  id: string
  category: string
  file_url: string
  media_type: string
  vehicle_id: string
}

type ToastState = { message: string; type: 'success' | 'error' } | null
type ConfirmState = {
  title: string
  message: string
  confirmText?: string
  confirmVariant?: 'primary' | 'danger' | 'success'
  onConfirm: () => void
} | null
type PreviewState = { url: string; title: string } | null

const DOCUMENT_CATEGORIES = ['grant', 'jpj', 'insurance', 'ber'] as const

function documentLabel(category: string): string {
  return category === 'grant' ? 'Vehicle Grant (VOC)' : category === 'jpj' ? 'JPJ Inspection' : category === 'insurance' ? 'Insurance & Roadtax' : 'BER Form'
}

export default function FrontDeskDashboard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState('front_desk')

  // Modals & UI State
  const [showModal, setShowModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null)
  const [previewMedia, setPreviewMedia] = useState<PreviewState>(null)
  const { theme, setTheme, isDark } = useTheme()

  // User Settings State
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('')
  const [settingsFullName, setSettingsFullName] = useState('')
  const [settingsUsername, setSettingsUsername] = useState('')

  const supabase = createClient()

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    async function init() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (!user || error) {
          window.location.href = '/login'
          return
        }

        setCurrentUserId(user.id)
        setCurrentUserEmail(user.email || '')

        const { data: userData } = await supabase
          .from('users')
          .select('role, full_name, username')
          .eq('id', user.id)
          .single()

        if (userData && userData.role !== 'front_desk' && userData.role !== 'admin') {
          showToast('Access Denied: Front Desk / Admin only.', 'error')
          setTimeout(() => { window.location.href = '/technician' }, 1500)
          return
        }

        setUserRole(userData?.role || 'front_desk')
        setSettingsFullName(userData?.full_name || '')
        setSettingsUsername(userData?.username || '')

        const list = await fetchActiveVehicles()
        setVehicles(list)
      } catch (err: any) {
        showToast(err.message || 'Initialization failed', 'error')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  useEffect(() => {
    async function loadMedia() {
      if (selectedVehicle) {
        try {
          const media = await fetchVehicleMedia(selectedVehicle.id)
          setMediaItems(media)
        } catch (err: any) {
          showToast('Failed to load media items', 'error')
        }
      }
    }
    loadMedia()
  }, [selectedVehicle?.id])

  async function handleCreateVehicle(data: {
    plate_number: string
    chassis_number: string
    make_model_year: string
    insurance_panel: string
    intake_cost: number
    market_value: number
  }) {
    try {
      await insertVehicle({ ...data, created_by: currentUserId })
      showToast('Vehicle successfully registered with Paqar valuation!', 'success')
      setShowModal(false)
      const list = await fetchActiveVehicles()
      setVehicles(list)
    } catch (err: any) {
      showToast(err.message || 'Failed to save vehicle', 'error')
    }
  }

  async function handleSettingsSave(payload: AccountSettingsPayload): Promise<{ ok: boolean; error?: string }> {
    if (!currentUserId) return { ok: false, error: 'Not authenticated.' }

    try {
      const { error: profileError } = await supabase
        .from('users')
        .update({ full_name: payload.fullName })
        .eq('id', currentUserId)

      if (profileError) throw profileError

      if (payload.newPassword.trim()) {
        if (!payload.oldPassword.trim()) {
          return { ok: false, error: 'Please enter your current password.' }
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: currentUserEmail,
          password: payload.oldPassword.trim(),
        })

        if (signInError) {
          return { ok: false, error: 'Incorrect old password.' }
        }

        const { error: passwordError } = await supabase.auth.updateUser({ password: payload.newPassword.trim() })
        if (passwordError) throw passwordError
      }

      setSettingsFullName(payload.fullName)
      showToast('Settings & security updated successfully!', 'success')
      return { ok: true }
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to update settings.' }
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, category: string) {
    const file = e.target.files?.[0]
    if (!file || !selectedVehicle) return

    if (file.size > 5 * 1024 * 1024) {
      showToast('File is too large. Maximum size is 5MB.', 'error')
      e.target.value = ''
      return
    }

    setConfirmModal({
      title: 'Confirm Document Upload',
      message: `Watermark and upload "${file.name}" for ${documentLabel(category)}?`,
      confirmText: 'Upload Document',
      confirmVariant: 'primary',
      onConfirm: () => executeFileUpload(file, category),
    })
    e.target.value = ''
  }

  async function executeFileUpload(file: File, category: string) {
    setConfirmModal(null)
    if (!selectedVehicle) return

    setUploadingCategory(category)
    showToast(`Watermarking & uploading ${category.toUpperCase()}...`, 'success')

    try {
      const watermarkLabel = `CONFIDENTIAL • ${selectedVehicle.plate_number} • ${category.toUpperCase()} • ${new Date().toLocaleDateString()}`
      const fileToUpload = await addWatermarkToFile(file, watermarkLabel)

      const existing = mediaItems.find(m => m.media_type === 'document' && m.category === category)
      if (existing) {
        await supabase.from('vehicle_media').delete().eq('id', existing.id)
      }

      const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'jpg'
      const fileName = `${selectedVehicle.id}/docs/${category}_${uniqueFileSuffix()}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('vehicle-files')
        .upload(fileName, fileToUpload, { cacheControl: '3600', upsert: true })

      if (uploadError) throw uploadError

      const { data: publicURLData } = supabase.storage.from('vehicle-files').getPublicUrl(uploadData.path)

      await supabase.from('vehicle_media').insert([{
        vehicle_id: selectedVehicle.id,
        media_type: 'document',
        category: category,
        file_url: publicURLData.publicUrl,
      }])

      showToast('Document stored successfully!', 'success')
      const updatedMedia = await fetchVehicleMedia(selectedVehicle.id)
      setMediaItems(updatedMedia)
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error')
    } finally {
      setUploadingCategory(null)
    }
  }

  function requestDeleteDocument(category: string) {
    setConfirmModal({
      title: 'Confirm Document Removal',
      message: `Are you sure you want to remove the ${documentLabel(category)}?`,
      confirmText: 'Remove Document',
      confirmVariant: 'danger',
      onConfirm: () => executeDeleteDocument(category),
    })
  }

  async function executeDeleteDocument(category: string) {
    setConfirmModal(null)
    if (!selectedVehicle) return

    try {
      const doc = mediaItems.find(m => m.media_type === 'document' && m.category === category)
      if (doc && doc.file_url) {
        const pathParts = doc.file_url.split('/vehicle-files/')
        if (pathParts.length > 1) {
          await supabase.storage.from('vehicle-files').remove([decodeURIComponent(pathParts[1])])
        }
      }

      await deleteDocumentRecord(selectedVehicle.id, category)
      showToast('Document removed successfully.', 'success')
      const updatedMedia = await fetchVehicleMedia(selectedVehicle.id)
      setMediaItems(updatedMedia)
    } catch (err: any) {
      showToast(err.message || 'Failed to remove document', 'error')
    }
  }

  async function handleSendToWorkshop() {
    if (!selectedVehicle) return
    setConfirmModal({
      title: 'Proceed to Workshop',
      message: `Send vehicle ${selectedVehicle.plate_number} to the workshop for 'Before' photo capture?`,
      confirmText: 'Proceed',
      confirmVariant: 'success',
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await updateVehicleStatus(selectedVehicle.id, 'pending_before_photos')
          setSelectedVehicle({ ...selectedVehicle, status: 'pending_before_photos' })
          showToast('Vehicle status updated to Pending Before Photos!', 'success')
          const list = await fetchActiveVehicles()
          setVehicles(list)
        } catch (err: any) {
          showToast(err.message || 'Failed to update status', 'error')
        }
      }
    })
  }

  function requestSignOut() {
    setConfirmModal({
      title: 'Confirm Sign Out',
      message: 'Are you sure you want to sign out of the Vehicle Management System?',
      confirmText: 'Sign Out',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmModal(null)
        await supabase.auth.signOut()
        window.location.href = '/login'
      }
    })
  }

  async function handleDownload(url: string, title: string) {
    try {
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

  const innerCard = isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
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
      <PreviewModal preview={previewMedia} onClose={() => setPreviewMedia(null)} onDownload={handleDownload} isDark={isDark} />

      {/* Settings Modal */}
      {showSettingsModal && (
        <AccountSettingsModal
          isDark={isDark}
          theme={theme}
          setTheme={setTheme}
          title="User Account Settings"
          subtitle="Manage appearance, profile, and security credentials."
          email={currentUserEmail}
          username={settingsUsername}
          fullName={settingsFullName}
          accent="blue"
          onClose={() => setShowSettingsModal(false)}
          onSave={handleSettingsSave}
        />
      )}

      {/* Header */}
      <header className={`border-b sticky top-0 z-40 backdrop-blur-md ${isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-black">🚗</div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight">Vehicle Management System</h1>
              <p className="text-[11px] text-slate-400 hidden sm:block">Front Desk Dashboard</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={`p-2 rounded-xl text-xs font-bold border cursor-pointer ${isDark ? 'border-slate-700 bg-slate-800 text-amber-300' : 'border-slate-200 bg-slate-100 text-amber-600'}`}>
              {isDark ? '☀️' : '🌙'}
            </button>
            {userRole === 'admin' && (
              <Link href="/admin" className="font-bold px-3.5 py-2 rounded-xl text-xs border border-purple-800 bg-purple-950 text-purple-300">🛡️ Admin Hub</Link>
            )}
            <button onClick={() => setShowSettingsModal(true)} className={`font-semibold px-3.5 py-2 rounded-xl text-xs border cursor-pointer ${isDark ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-slate-100 text-slate-700'}`}>⚙️ Settings</button>
            {!selectedVehicle && (
              <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-lg cursor-pointer">
                + New Vehicle Intake
              </button>
            )}
            <button onClick={requestSignOut} className="font-bold px-3.5 py-2 rounded-xl text-xs border border-rose-900 bg-rose-950 text-rose-300 cursor-pointer">Sign Out</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {selectedVehicle ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
              <button onClick={() => setSelectedVehicle(null)} className={`text-xs font-bold px-3.5 py-2 rounded-xl border cursor-pointer ${isDark ? 'border-slate-800 bg-slate-950 text-blue-400' : 'border-slate-200 bg-white text-blue-600'}`}>
                &larr; Back to Registry
              </button>

              {selectedVehicle.status === 'intake' && (
                <button onClick={handleSendToWorkshop} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all cursor-pointer flex items-center gap-2">
                  <span>➡️ Proceed to Pending Before Photos</span>
                </button>
              )}
            </div>

            <Card isDark={isDark} className="p-5 sm:p-8 mb-8 shadow-2xl">
              <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className={`text-2xl sm:text-3xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedVehicle.plate_number}</h2>
                    <StatusBadge status={selectedVehicle.status} />
                  </div>
                  <p className={`mt-1 font-semibold text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{selectedVehicle.make_model_year}</p>
                  <p className={`text-xs font-mono mt-2 inline-block px-3 py-1 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                    VIN: <span className={isDark ? 'text-white' : 'text-slate-900'}>{selectedVehicle.chassis_number}</span>
                  </p>
                </div>
                <div className={`px-4 py-3 rounded-2xl border w-fit ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-[10px] uppercase text-slate-400 font-extrabold tracking-wider">Insurance Panel</p>
                  <p className={`text-sm font-bold mt-0.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>{selectedVehicle.insurance_panel || 'None Assigned'}</p>
                </div>
              </div>

              <div className={`grid grid-cols-1 md:grid-cols-3 gap-5 py-6 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <div className={`p-5 rounded-2xl border ${innerCard}`}>
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Intake Cost</p>
                  <p className={`text-2xl font-black mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>RM {selectedVehicle.intake_cost?.toLocaleString()}</p>
                </div>
                <div className={`p-5 rounded-2xl border ${innerCard}`}>
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Market Value (Paqar)</p>
                  <p className={`text-2xl font-black mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>RM {selectedVehicle.market_value?.toLocaleString()}</p>
                </div>
                <div className={`p-5 rounded-2xl border ${innerCard}`}>
                  <p className="text-[11px] font-bold text-slate-400 uppercase">Total Repair Cost</p>
                  <p className={`text-2xl font-black mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>RM {selectedVehicle.repair_cost?.toLocaleString()}</p>
                </div>
              </div>

              {/* Mandatory Documents Section */}
              <div className={`pt-6 pb-8 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <h3 className={`text-sm font-extrabold mb-4 tracking-wider uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>1. Mandatory Document Management</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {DOCUMENT_CATEGORIES.map((cat) => {
                    const doc = mediaItems.find(m => m.media_type === 'document' && m.category === cat)
                    return (
                      <div key={cat} className={`border rounded-2xl p-5 flex flex-col justify-between ${innerCard}`}>
                        <div>
                          <p className={`text-xs font-extrabold uppercase mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{documentLabel(cat)}</p>
                          <p className={`text-xs font-semibold mb-5 ${doc ? 'text-emerald-400' : 'text-slate-500'}`}>{doc ? '✓ Verified & Stored' : 'Pending Upload'}</p>
                        </div>
                        {doc ? (
                          <div className="flex gap-2">
                            <button onClick={() => setPreviewMedia({ url: doc.file_url, title: `${selectedVehicle.plate_number} - ${documentLabel(cat)}` })} className="w-1/2 bg-blue-950 text-blue-300 hover:bg-blue-900 py-2.5 rounded-xl text-xs font-bold border border-blue-800 cursor-pointer">View</button>
                            <button onClick={() => requestDeleteDocument(cat)} className="w-1/2 bg-rose-950 text-rose-300 hover:bg-rose-900 py-2.5 rounded-xl text-xs font-bold border border-rose-900 cursor-pointer">Remove</button>
                          </div>
                        ) : (
                          <div>
                            <label htmlFor={`file-${cat}`} className="w-full block text-center bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-xs font-bold cursor-pointer shadow-md">
                              {uploadingCategory === cat ? 'Uploading…' : 'Upload File'}
                            </label>
                            <input id={`file-${cat}`} type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => handleFileSelect(e, cat)} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Technician Photo Evidence Section */}
              <div className="pt-8">
                <h3 className={`text-sm font-extrabold tracking-wider uppercase mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>2. Technician Photo Evidence (Read-Only)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PHOTO_CATEGORIES.map((cat) => {
                    const before = mediaItems.find(m => m.media_type === 'photo_before' && m.category === cat.key)
                    const after = mediaItems.find(m => m.media_type === 'photo_after' && m.category === cat.key)
                    return (
                      <div key={cat.key} className={`border rounded-2xl p-4 ${isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-slate-50'}`}>
                        <p className={`text-xs font-extrabold uppercase mb-3 ${isDark ? 'text-white' : 'text-slate-900'}`}>{cat.label}</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className={`border rounded-xl p-3 flex flex-col justify-between ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
                            <p className="text-[10px] font-bold uppercase text-amber-400 mb-1">Before Repair</p>
                            <p className={`text-[11px] mb-3 ${before ? 'text-emerald-400' : 'text-slate-500'}`}>{before ? '✓ Captured' : 'Pending'}</p>
                            {before && <button onClick={() => setPreviewMedia({ url: before.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (Before)` })} className={`w-full py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${isDark ? 'bg-slate-900 text-emerald-400 border-slate-700' : 'bg-white text-emerald-600 border-slate-200'}`}>View</button>}
                          </div>
                          <div className={`border rounded-xl p-3 flex flex-col justify-between ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'}`}>
                            <p className="text-[10px] font-bold uppercase text-blue-400 mb-1">After Repair</p>
                            <p className={`text-[11px] mb-3 ${after ? 'text-blue-400' : 'text-slate-500'}`}>{after ? '✓ Captured' : 'Pending'}</p>
                            {after && <button onClick={() => setPreviewMedia({ url: after.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (After)` })} className={`w-full py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${isDark ? 'bg-slate-900 text-blue-400 border-slate-700' : 'bg-white text-blue-600 border-slate-200'}`}>View</button>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div>
            <SectionHeading
              isDark={isDark}
              title="Active Vehicle Registry"
              right={
                <span className={`text-xs font-bold px-3.5 py-1.5 rounded-full border ${isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-white text-slate-600'}`}>
                  Total: {vehicles.length} Vehicles
                </span>
              }
            />

            {loading ? (
              <EmptyState isDark={isDark} message="Loading vehicle registry..." />
            ) : vehicles.length === 0 ? (
              <EmptyState isDark={isDark} message="No vehicles found. Click “+ New Vehicle Intake” to get started." />
            ) : (
              <ResponsiveTable isDark={isDark} minWidth="min-w-[760px]">
                <thead>
                  <tr className={`text-[11px] uppercase font-bold border-b ${isDark ? 'text-slate-400 border-slate-800 bg-slate-900/80' : 'text-slate-500 border-slate-200 bg-slate-100'}`}>
                    <th className="p-4">Plate Number</th>
                    <th className="p-4">Make / Model / Year</th>
                    <th className="p-4">Insurance Panel</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Intake Cost</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className={`divide-y text-xs font-medium ${isDark ? 'divide-slate-800 text-slate-300' : 'divide-slate-200 text-slate-700'}`}>
                  {vehicles.map((v) => (
                    <tr key={v.id} className={`transition-colors ${isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'}`}>
                      <td className="p-4 font-bold text-sm text-blue-400">{v.plate_number}</td>
                      <td className="p-4">{v.make_model_year}</td>
                      <td className="p-4 text-slate-400">{v.insurance_panel || 'N/A'}</td>
                      <td className="p-4">
                        <StatusBadge status={v.status} />
                      </td>
                      <td className={`p-4 font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>RM {v.intake_cost?.toLocaleString()}</td>
                      <td className="p-4 text-right">
                        <button onClick={() => setSelectedVehicle(v)} className="px-3.5 py-1.5 rounded-xl font-bold bg-blue-950 text-blue-300 border border-blue-800 hover:bg-blue-900 cursor-pointer">Inspect Details &rarr;</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
            )}
          </div>
        )}
      </main>

      <VehicleIntakeModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleCreateVehicle}
        isDark={isDark}
        showToast={showToast}
      />
    </div>
  )
}
