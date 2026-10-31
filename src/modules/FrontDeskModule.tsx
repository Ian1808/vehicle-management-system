"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { addWatermarkToFile } from '@/utils/watermark'
import { fetchActiveVehicles, fetchVehicleMedia, insertVehicle, updateVehicleStatus, deleteDocumentRecord } from '@/services/vehicleService'
import { useTheme } from '@/lib/theme'
import { PHOTO_CATEGORIES } from '@/lib/photoCategories'
import { uniqueFileSuffix } from '@/lib/uploadUtils'
import { getPhotoStageRules } from '@/lib/photoStages'
import VehicleIntakeModal, { type OcrScanPayload } from '@/components/forms/VehicleIntakeModal'
import ConfirmModal from '@/components/ui/ConfirmModal'
import PreviewModal from '@/components/ui/PreviewModal'
import PhotoThumb from '@/components/ui/PhotoThumb'
import ThirdPartyAssignmentPanel from '@/components/assignments/ThirdPartyAssignmentPanel'
import Toast from '@/components/ui/Toast'
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
type PreviewState = { items: { url: string; title: string }[]; index: number } | null

const DOCUMENT_CATEGORIES = ['grant', 'jpj', 'insurance', 'ber'] as const

const STATUS_STEPS: { key: string; label: string; short: string }[] = [
  { key: 'intake', label: 'Intake', short: 'Intake' },
  { key: 'pending_before_photos', label: 'Before Photos', short: 'Before' },
  { key: 'in_repair', label: 'In Repair', short: 'Repair' },
  { key: 'pending_after_photos', label: 'After Photos', short: 'After' },
  { key: 'completed', label: 'Completed', short: 'Done' },
  { key: 'road_ready', label: 'Road Ready', short: 'Ready' },
]

function documentLabel(category: string): string {
  return category === 'grant' ? 'Vehicle Grant (VOC)' : category === 'jpj' ? 'JPJ Inspection' : category === 'insurance' ? 'Insurance' : 'BER Form'
}

function additionalLabel(category: string): string {
  return category.replace(/^extra_/, '').replace(/_[a-f0-9]{8}$/i, '').replace(/_/g, ' ')
}

export default function FrontDeskModule({ embedded = false }: { embedded?: boolean }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const additionalPhotos = mediaItems.filter(m => m.media_type === 'photo_additional')
  const photoStage = selectedVehicle ? getPhotoStageRules(selectedVehicle.status) : null
  const showBefore = photoStage?.before !== 'hidden'
  const showAfter = photoStage?.after !== 'hidden'
  const showAdditional = photoStage?.additional !== 'hidden'

  // Modals & UI State
  const [showModal, setShowModal] = useState(false)
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null)
  const [previewMedia, setPreviewMedia] = useState<PreviewState>(null)
  const [detailTab, setDetailTab] = useState<'overview' | 'documents' | 'photos' | 'workshop'>('overview')
  const [photoFilter, setPhotoFilter] = useState<'before' | 'after' | 'additional'>('before')
  const { isDark } = useTheme()

  // User State
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null)
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])

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

        const { data: userData } = await supabase
          .from('users')
          .select('role, full_name, username, company_id')
          .eq('id', user.id)
          .single()

        if (userData && userData.role !== 'front_desk' && userData.role !== 'admin' && userData.role !== 'manager') {
          showToast('Access Denied: Front Desk / Manager / Admin only.', 'error')
          setTimeout(() => { window.location.href = '/?tab=technician' }, 1500)
          return
        }

        setUserRole(userData?.role || '')
        setUserCompanyId(userData?.company_id || null)

        if (userData?.role === 'admin') {
          const { data: companiesData, error: companiesErr } = await supabase
            .from('companies')
            .select('id, name')
            .order('name', { ascending: true })
          if (!companiesErr) setCompanies(companiesData || [])
          else console.warn('Companies table might not exist yet:', companiesErr.message)
        } else if (userData?.company_id) {
          // Staff: show their own company (read-only) in the intake form.
          const { data: myCompany } = await supabase
            .from('companies')
            .select('id, name')
            .eq('id', userData.company_id)
            .single()
          if (myCompany) setCompanies([{ id: myCompany.id, name: myCompany.name }])
        }

        const list = await fetchActiveVehicles(userData?.role === 'admin' ? null : (userData?.company_id || null))
        setVehicles(list)

        // Deep-link: open a specific vehicle directly (?tab=frontdesk&vehicle=<id>)
        const params = new URLSearchParams(window.location.search)
        const vehicleParam = params.get('vehicle')
        if (vehicleParam && list) {
          const target = list.find(v => v.id === vehicleParam)
          if (target) setSelectedVehicle(target)
          // Consume the param so it doesn't re-open on later visits
          const url = new URL(window.location.href)
          url.searchParams.delete('vehicle')
          window.history.replaceState(null, '', url.pathname + url.search)
        }
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
        setDetailTab('overview')
        setPhotoFilter('before')
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
    grantFile?: File | null
    ocrScan?: OcrScanPayload | null
    companyId?: string | null
  }) {
    try {
      // Duplicate plate / chassis prevention (active vehicles only).
      const plate = data.plate_number.trim()
      const chassis = data.chassis_number.trim()
      const [plateRes, chassisRes] = await Promise.all([
        supabase.from('vehicles').select('id').eq('is_deleted', false).eq('plate_number', plate).limit(1),
        chassis ? supabase.from('vehicles').select('id').eq('is_deleted', false).eq('chassis_number', chassis).limit(1) : Promise.resolve({ data: null, error: null }),
      ])
      if (plateRes.data && plateRes.data.length > 0) {
        showToast(`A vehicle with plate number "${data.plate_number}" is already registered.`, 'error')
        return
      }
      if (chassisRes.data && chassisRes.data.length > 0) {
        showToast(`A vehicle with chassis number "${data.chassis_number}" is already registered.`, 'error')
        return
      }

      const newId = await insertVehicle({ ...data, created_by: currentUserId, company_id: data.companyId ?? userCompanyId })
      if (!newId) throw new Error('Vehicle record was created but its ID could not be resolved.')

      // Persist the OCR scan-score record for admin monitoring (kept per vehicle).
      if (data.ocrScan) {
        try {
          await supabase.from('vehicle_media').insert([{
            vehicle_id: newId,
            media_type: 'scan_log',
            category: 'scan',
            file_url: JSON.stringify(data.ocrScan),
          }])
        } catch (err: unknown) {
          console.warn('Could not persist OCR scan log:', err instanceof Error ? err.message : err)
        }
      }

      // Auto-store the scanned grant photo as the mandatory Vehicle Grant (VOC) document.
      if (data.grantFile) {
        try {
          const watermarkLabel = `CONFIDENTIAL • ${data.plate_number.toUpperCase()} • GRANT (VOC) • ${new Date().toLocaleDateString()}`
          const fileToUpload = await addWatermarkToFile(data.grantFile, watermarkLabel)
          const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'jpg'
          const fileName = `${newId}/docs/grant_${uniqueFileSuffix()}.${fileExt}`

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('vehicle-files')
            .upload(fileName, fileToUpload, { cacheControl: '3600', upsert: true })
          if (uploadError) throw uploadError

          const { data: publicURLData } = supabase.storage.from('vehicle-files').getPublicUrl(uploadData.path)
          await supabase.from('vehicle_media').insert([{
            vehicle_id: newId,
            media_type: 'document',
            category: 'grant',
            file_url: publicURLData.publicUrl,
            uploaded_by: currentUserId,
          }])
          showToast('Vehicle registered — scanned grant auto-stored as Vehicle Grant (VOC)!', 'success')
        } catch (err: unknown) {
          showToast(`Vehicle registered, but grant upload failed: ${err instanceof Error ? err.message : 'unknown error'}`, 'error')
        }
      } else {
        showToast('Vehicle successfully registered!', 'success')
      }

      setShowModal(false)
      const list = await fetchActiveVehicles(userRole === 'admin' ? null : userCompanyId)
      setVehicles(list)
    } catch (err: any) {
      const msg = err?.message || 'Failed to save vehicle'
      showToast(msg.includes('duplicate key value violates unique constraint') ? 'A vehicle with this plate or chassis number is already registered.' : msg, 'error')
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
        uploaded_by: currentUserId,
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
    const docCount = mediaItems.filter(m => m.media_type === 'document').length
    setConfirmModal({
      title: 'Proceed to Workshop',
      message: `Send vehicle ${selectedVehicle.plate_number} to the workshop for 'Before' photo capture? Documents on file: ${docCount}/4.`,
      confirmText: 'Proceed',
      confirmVariant: 'success',
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await updateVehicleStatus(selectedVehicle.id, 'pending_before_photos')
          setSelectedVehicle({ ...selectedVehicle, status: 'pending_before_photos' })
          showToast('Vehicle status updated to Pending Before Photos!', 'success')
          const list = await fetchActiveVehicles(userRole === 'admin' ? null : userCompanyId)
          setVehicles(list)
        } catch (err: any) {
          showToast(err.message || 'Failed to update status', 'error')
        }
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
    const items = additionalPhotos.map(item => ({
      url: item.file_url,
      title: `${selectedVehicle?.plate_number ?? ''} - ${additionalLabel(item.category)} (Additional)`,
    }))
    setPreviewMedia({ items, index: Math.max(0, items.findIndex(it => it.url === clickedUrl)) })
  }

  const innerCard = isDark ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'

  const docCount = mediaItems.filter(m => m.media_type === 'document').length
  const beforePhotos = mediaItems.filter(m => m.media_type === 'photo_before')
  const afterPhotos = mediaItems.filter(m => m.media_type === 'photo_after')
  const photoCount = beforePhotos.length + afterPhotos.length
  const visiblePhotoFilters = [
    ...(showBefore ? [{ key: 'before' as const, label: 'Before Repair', count: beforePhotos.length }] : []),
    ...(showAfter ? [{ key: 'after' as const, label: 'After Repair', count: afterPhotos.length }] : []),
    ...(showAdditional ? [{ key: 'additional' as const, label: 'Additional', count: additionalPhotos.length }] : []),
  ]
  const activePhotoFilter = visiblePhotoFilters.some(f => f.key === photoFilter) ? photoFilter : (visiblePhotoFilters[0]?.key ?? 'before')

  return (
    <div className={`min-h-screen ${embedded ? '' : 'pb-24 lg:pb-0 '}${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-24 lg:pb-8">
        {selectedVehicle ? (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <button onClick={() => { setSelectedVehicle(null); const url = new URL(window.location.href); url.searchParams.delete('vehicle'); window.history.replaceState(null, '', url.pathname + url.search) }} className={`text-xs font-bold px-3.5 py-2 rounded-xl border cursor-pointer ${isDark ? 'border-slate-800 bg-slate-950 text-blue-400' : 'border-slate-200 bg-white text-blue-600'}`}>
                &larr; Back to Registry
              </button>
            </div>

            <Card isDark={isDark} className="p-5 sm:p-8 mb-8 shadow-2xl">
              {/* Vehicle header */}
              <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
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

              {/* Detail tabs */}
              <div className="flex flex-wrap gap-2 pt-5 -mb-px">
                {([
                  { key: 'overview' as const, label: '📋 Overview', badge: 0 },
                  { key: 'documents' as const, label: '📄 Documents', badge: docCount },
                  { key: 'photos' as const, label: '📷 Photos', badge: photoCount },
                  { key: 'workshop' as const, label: '🔧 Workshop', badge: 0 },
                ]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setDetailTab(tab.key)}
                    className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold border cursor-pointer transition-colors ${detailTab === tab.key ? 'bg-blue-600 text-white border-blue-600' : isDark ? 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white' : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'}`}
                  >
                    <span>{tab.label}</span>
                    {tab.badge > 0 && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${detailTab === tab.key ? 'bg-white/20 text-white' : isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-500'}`}>{tab.badge}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* --- Overview tab --- */}
              {detailTab === 'overview' && (
                <div className="pt-5">
                  <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto pb-2">
                    {STATUS_STEPS.map((step, i) => {
                      const currentIdx = STATUS_STEPS.findIndex(s => s.key === selectedVehicle.status)
                      const done = currentIdx > i
                      const current = currentIdx === i
                      return (
                        <div key={step.key} className="flex items-center gap-0.5 sm:gap-1 shrink-0">
                          {i > 0 && <div className={`h-0.5 w-1 sm:w-5 ${done || current ? (isDark ? 'bg-emerald-500' : 'bg-emerald-400') : (isDark ? 'bg-slate-700' : 'bg-slate-300')}`} />}
                          <span className={`px-1.5 sm:px-2.5 py-1 rounded-full text-[9px] sm:text-[10px] font-extrabold whitespace-nowrap ${done ? (isDark ? 'bg-emerald-900/60 text-emerald-300' : 'bg-emerald-100 text-emerald-700') : current ? 'bg-blue-600 text-white' : isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>
                            {done ? '✓ ' : ''}<span className="hidden sm:inline">{step.label}</span><span className="sm:hidden">{step.short}</span>
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Status-driven next step */}
                  <div className={`mt-4 rounded-2xl border p-5 ${isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-slate-50'}`}>
                    <p className="text-[10px] uppercase font-extrabold tracking-wider text-slate-400 mb-1">Next Step</p>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <p className={`text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        {selectedVehicle.status === 'intake' && `Complete the mandatory documents (${docCount}/4 on file) before sending the vehicle to the workshop.`}
                        {selectedVehicle.status === 'pending_before_photos' && `Waiting for the technician to capture the Before photos (${beforePhotos.length}/8 done).`}
                        {selectedVehicle.status === 'in_repair' && 'Vehicle is in repair — After photos are next in the workflow.'}
                        {selectedVehicle.status === 'pending_after_photos' && `Waiting for the technician to capture the After photos (${afterPhotos.length}/8 done).`}
                        {(selectedVehicle.status === 'completed' || selectedVehicle.status === 'road_ready') && 'Repair complete — all photo evidence and documents are archived.'}
                        {!['intake', 'pending_before_photos', 'in_repair', 'pending_after_photos', 'completed', 'road_ready'].includes(selectedVehicle.status) && 'Managing this vehicle.'}
                      </p>
                      {selectedVehicle.status === 'intake' && (
                        <button onClick={handleSendToWorkshop} className="shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all cursor-pointer">
                          ➡️ Proceed to Pending Before Photos
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Costs */}
                  <div className={`grid grid-cols-3 gap-2 sm:gap-5 mt-6`}>
                    <div className={`p-3 sm:p-5 rounded-2xl border ${innerCard}`}>
                      <p className="text-[9px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wide"><span className="hidden sm:inline">Intake Cost</span><span className="sm:hidden">Intake</span></p>
                      <p className={`text-lg sm:text-2xl font-black mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>RM {selectedVehicle.intake_cost?.toLocaleString()}</p>
                    </div>
                    <div className={`p-3 sm:p-5 rounded-2xl border ${innerCard}`}>
                      <p className="text-[9px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wide"><span className="hidden sm:inline">Market Value</span><span className="sm:hidden">Market</span></p>
                      <p className={`text-lg sm:text-2xl font-black mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>RM {selectedVehicle.market_value?.toLocaleString()}</p>
                    </div>
                    <div className={`p-3 sm:p-5 rounded-2xl border ${innerCard}`}>
                      <p className="text-[9px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wide"><span className="hidden sm:inline">Total Repair Cost</span><span className="sm:hidden">Repair</span></p>
                      <p className={`text-lg sm:text-2xl font-black mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>RM {selectedVehicle.repair_cost?.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* --- Documents tab --- */}
              {detailTab === 'documents' && (
                <div className="pt-6">
                  <h3 className={`text-sm font-extrabold mb-4 tracking-wider uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>Mandatory Document Management</h3>
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
                              <button onClick={() => setPreviewMedia({ items: [{ url: doc.file_url, title: `${selectedVehicle.plate_number} - ${documentLabel(cat)}` }], index: 0 })} className={`w-1/2 py-2.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-blue-950 text-blue-300 hover:bg-blue-900 border-blue-800' : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200'}`}>View</button>
                              <button onClick={() => requestDeleteDocument(cat)} className={`w-1/2 py-2.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${isDark ? 'bg-rose-950 text-rose-300 hover:bg-rose-900 border-rose-900' : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200'}`}>Remove</button>
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
              )}

              {/* --- Photos tab --- */}
              {detailTab === 'photos' && (
                <div className="pt-6">
                  <h3 className={`text-sm font-extrabold tracking-wider uppercase mb-4 ${isDark ? 'text-white' : 'text-slate-900'}`}>Technician Photo Evidence (Read-Only)</h3>

                  <div className="flex gap-2 flex-wrap">
                    {visiblePhotoFilters.map(f => (
                      <button
                        key={f.key}
                        onClick={() => setPhotoFilter(f.key)}
                        className={`px-4 py-2 rounded-xl text-xs font-extrabold border cursor-pointer transition-colors ${activePhotoFilter === f.key ? 'bg-blue-600 text-white border-blue-600' : isDark ? 'border-slate-700 bg-slate-900 text-slate-400 hover:text-white' : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'}`}
                      >
                        {f.label} · {f.count}
                      </button>
                    ))}
                  </div>

                  {activePhotoFilter === 'before' && (
                    <div className="mt-4">
                      {beforePhotos.length === 0 ? (
                        <p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No Before photos captured yet.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {beforePhotos.map((item) => {
                            const cat = PHOTO_CATEGORIES.find(c => c.key === item.category)
                            return (
                              <div key={item.id} className={`border rounded-2xl p-3 flex flex-col justify-between ${innerCard}`}>
                                <p className={`text-[10px] font-extrabold uppercase mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{cat?.label ?? item.category}</p>
                                <PhotoThumb url={item.file_url} alt={`${selectedVehicle.plate_number} - ${cat?.label ?? item.category} (Before)`} onClick={() => openPhaseGallery('photo_before', item.file_url)} className="h-24" />
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {activePhotoFilter === 'after' && (
                    <div className="mt-4">
                      {afterPhotos.length === 0 ? (
                        <p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No After photos captured yet.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {afterPhotos.map((item) => {
                            const cat = PHOTO_CATEGORIES.find(c => c.key === item.category)
                            return (
                              <div key={item.id} className={`border rounded-2xl p-3 flex flex-col justify-between ${innerCard}`}>
                                <p className={`text-[10px] font-extrabold uppercase mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>{cat?.label ?? item.category}</p>
                                <PhotoThumb url={item.file_url} alt={`${selectedVehicle.plate_number} - ${cat?.label ?? item.category} (After)`} onClick={() => openPhaseGallery('photo_after', item.file_url)} className="h-24" />
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {activePhotoFilter === 'additional' && (
                    <div className="mt-4">
                      {additionalPhotos.length === 0 ? (
                        <p className={`text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No additional photos uploaded by technician.</p>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          {additionalPhotos.map((item) => (
                            <div key={item.id} className={`border rounded-2xl p-4 flex flex-col justify-between ${innerCard}`}>
                              <div>
                                <p className={`text-xs font-extrabold uppercase mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>{additionalLabel(item.category)}</p>
                                <p className="text-[11px] font-semibold text-purple-400 mb-3">✓ Captured</p>
                              </div>
                              <PhotoThumb url={item.file_url} alt={`${selectedVehicle.plate_number} - ${additionalLabel(item.category)} (Additional)`} onClick={() => openAdditionalGallery(item.file_url)} className="h-24" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* --- Workshop tab --- */}
              {detailTab === 'workshop' && (
                <div className="pt-6">
                  <ThirdPartyAssignmentPanel
                    isDark={isDark}
                    vehicleId={selectedVehicle.id}
                    vehiclePlate={selectedVehicle.plate_number}
                    companyId={userCompanyId}
                    isAdmin={userRole === 'admin'}
                    showToast={showToast}
                  />
                </div>
              )}
            </Card>
          </div>
        ) : (
          <div>
            <SectionHeading
              isDark={isDark}
              title="Active Vehicle Registry"
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setShowModal(true)} className="h-9 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-lg cursor-pointer transition-colors">
                    + Add Vehicle
                  </button>
                  <span className={`text-xs font-bold px-3.5 py-1.5 rounded-full border ${isDark ? 'border-slate-700 bg-slate-800 text-slate-300' : 'border-slate-200 bg-white text-slate-600'}`}>
                    Total: {vehicles.length} Vehicles
                  </span>
                </div>
              }
            />

            {loading ? (
              <EmptyState isDark={isDark} message="Loading vehicle registry..." />
            ) : vehicles.length === 0 ? (
              <EmptyState isDark={isDark} message="No vehicles found. Click “+ Add Vehicle” to get started." />
            ) : (
              <>
                <div className="hidden md:block">
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
                    <tr key={v.id} onClick={() => setSelectedVehicle(v)} className={`transition-colors cursor-pointer ${isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'}`}>
                      <td className="p-4 font-bold text-sm text-blue-400">{v.plate_number}</td>
                      <td className="p-4">{v.make_model_year}</td>
                      <td className="p-4 text-slate-400">{v.insurance_panel || 'N/A'}</td>
                      <td className="p-4">
                        <StatusBadge status={v.status} />
                      </td>
                      <td className={`p-4 font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>RM {v.intake_cost?.toLocaleString()}</td>
                      <td className="p-4 text-right">
                        <span className={`inline-block px-3.5 py-1.5 rounded-xl font-bold border cursor-pointer transition-colors ${isDark ? 'bg-blue-950 text-blue-300 border-blue-800' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>Inspect Details &rarr;</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </ResponsiveTable>
                </div>

                {/* Mobile card list — tap the card to open the vehicle */}
                <div className="md:hidden space-y-3">
                  {vehicles.map((v) => (
                    <div key={v.id} onClick={() => setSelectedVehicle(v)} className={`border rounded-2xl p-4 flex flex-col gap-3 cursor-pointer active:scale-[0.99] transition-transform ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-blue-400">{v.plate_number}</span>
                        <StatusBadge status={v.status} />
                      </div>
                      <div className={`text-xs space-y-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        <p className="font-semibold">{v.make_model_year}</p>
                        <p>Insurance: {v.insurance_panel || 'N/A'}</p>
                        <div className="flex items-center justify-between pt-1">
                          <p className="font-bold text-white">RM {v.intake_cost?.toLocaleString()}</p>
                          <span className={`text-xs font-extrabold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>View Details ›</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
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
        userRole={userRole}
        companies={companies}
        fixedCompanyId={userRole === 'admin' ? null : userCompanyId}
      />
    </div>
  )
}
