"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { addWatermarkToFile } from '@/utils/watermark'

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
  url: string
  title: string
}

const PHOTO_CATEGORIES = [
  { key: 'front', label: 'Front View' },
  { key: 'back', label: 'Back View' },
  { key: 'left', label: 'Left Side' },
  { key: 'right', label: 'Right Side' },
  { key: 'windshield', label: 'Front Windshield' },
  { key: 'meter_gauge', label: 'Meter Gauge' },
  { key: 'engine_bay', label: 'Engine Bay' },
  { key: 'chassis_number', label: 'Chassis Number (VIN)' },
]

export default function FrontDeskDashboard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null)
  const [previewMedia, setPreviewMedia] = useState<PreviewMedia | null>(null)
  const [userRole, setUserRole] = useState<string>('front_desk')

  // Theme State ('dark' | 'light')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  // Settings State & Modal
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('')
  const [settingsFullName, setSettingsFullName] = useState('')
  const [settingsUsername, setSettingsUsername] = useState('')

  // Secure Password Change State
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // New Intake Form State
  const [plate, setPlate] = useState('')
  const [chassis, setChassis] = useState('')
  const [makeModel, setMakeModel] = useState('')
  const [insurancePanel, setInsurancePanel] = useState('')
  const [intakeCost, setIntakeCost] = useState('')
  const [marketValue, setMarketValue] = useState('')

  const supabase = createClient()

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    async function checkFrontDeskAccess() {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!user || authError) {
        window.location.href = '/login'
        return
      }

      setCurrentUserId(user.id)
      setCurrentUserEmail(user.email || '')

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('role, full_name, username')
        .eq('id', user.id)
        .single()

      if (userError || !userData || (userData.role !== 'front_desk' && userData.role !== 'admin')) {
        showToast('Access Denied: Restricted to Front Desk and Admin staff.', 'error')
        setTimeout(() => { window.location.href = '/technician' }, 1500)
        return
      }

      setUserRole(userData.role)
      setSettingsFullName(userData.full_name || '')
      setSettingsUsername(userData.username || '')
      fetchVehicles()
    }
    checkFrontDeskAccess()
  }, [])

  useEffect(() => {
    if (selectedVehicle) {
      fetchVehicleMedia(selectedVehicle.id)
    }
  }, [selectedVehicle?.id])

  async function fetchVehicles() {
    setLoading(true)
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (error) showToast(error.message, 'error')
    else setVehicles(data || [])
    setLoading(false)
  }

  async function fetchVehicleMedia(vehicleId: string) {
    const { data, error } = await supabase
      .from('vehicle_media')
      .select('*')
      .eq('vehicle_id', vehicleId)

    if (error) showToast(error.message, 'error')
    else setMediaItems(data || [])
  }

  async function handleUpdateSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!currentUserId) return

    try {
      // 1. Update Full Name only (Email and Username are restricted from change)
      const { error: profileError } = await supabase
        .from('users')
        .update({ full_name: settingsFullName })
        .eq('id', currentUserId)

      if (profileError) throw profileError

      // 2. Handle Password Change if requested
      if (newPassword.trim()) {
        if (!oldPassword.trim()) {
          showToast('Please enter your current (old) password to change passwords.', 'error')
          return
        }
        if (newPassword !== confirmNewPassword) {
          showToast('New passwords do not match.', 'error')
          return
        }

        // Verify old password by signing in with current email & old password
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: currentUserEmail,
          password: oldPassword.trim(),
        })

        if (signInError) {
          showToast('Incorrect old password provided.', 'error')
          return
        }

        // Update to new password
        const { error: passwordError } = await supabase.auth.updateUser({
          password: newPassword.trim(),
        })
        if (passwordError) throw passwordError

        setOldPassword('')
        setNewPassword('')
        setConfirmNewPassword('')
      }

      showToast('Settings & security updated successfully!', 'success')
      setShowSettingsModal(false)
    } catch (err: any) {
      showToast(err.message || 'Failed to update settings.', 'error')
    }
  }

  async function handleDownload(url: string, title: string) {
    try {
      showToast('Preparing file download...', 'success')
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
    } catch (err) {
      window.open(url, '_blank')
    }
  }

  function handleCreateVehicleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setConfirmModal({
      title: 'Confirm Vehicle Intake',
      message: `Are you sure you want to register vehicle ${plate.toUpperCase()} (${makeModel}) into the active registry?`,
      confirmText: 'Register Vehicle',
      confirmVariant: 'success',
      onConfirm: () => executeCreateVehicle(),
    })
  }

  async function executeCreateVehicle() {
    setConfirmModal(null)
    const { error } = await supabase.from('vehicles').insert([
      {
        plate_number: plate,
        chassis_number: chassis,
        make_model_year: makeModel,
        insurance_panel: insurancePanel,
        status: 'intake',
        intake_cost: intakeCost ? parseFloat(intakeCost) : 0,
        market_value: marketValue ? parseFloat(marketValue) : 0,
        repair_cost: 0,
      },
    ])

    if (error) {
      showToast(error.message, 'error')
    } else {
      showToast('Vehicle successfully added to registry!', 'success')
      setPlate('')
      setChassis('')
      setMakeModel('')
      setInsurancePanel('')
      setIntakeCost('')
      setMarketValue('')
      setShowModal(false)
      fetchVehicles()
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, category: string) {
    e.stopPropagation()
    const file = e.target.files?.[0]
    if (!file || !selectedVehicle) return

    if (file.size > 5 * 1024 * 1024) {
      showToast('File is too large. Maximum size is 5MB.', 'error')
      e.target.value = ''
      return
    }

    const categoryLabel =
      category === 'grant' ? 'Vehicle Grant (VOC)' :
        category === 'jpj' ? 'JPJ Inspection' :
          category === 'insurance' ? 'Insurance & Roadtax' : 'BER Form'

    setConfirmModal({
      title: 'Confirm Document Upload',
      message: `Watermark and upload "${file.name}" for ${categoryLabel}?`,
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

      const existingDoc = mediaItems.find(m => m.media_type === 'document' && m.category === category)
      if (existingDoc) {
        await supabase.from('vehicle_media').delete().eq('id', existingDoc.id)
      }

      const fileExt = fileToUpload.name.split('.').pop()?.toLowerCase() || 'jpg'
      const uniqueId = Math.random().toString(36).substring(2, 9)
      const fileName = `${selectedVehicle.id}/docs/${category}_${Date.now()}_${uniqueId}.${fileExt}`

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('vehicle-files')
        .upload(fileName, fileToUpload, { cacheControl: '3600', upsert: true })

      if (uploadError) throw uploadError

      const { data: publicURLData } = supabase.storage
        .from('vehicle-files')
        .getPublicUrl(uploadData.path)

      const { error: dbError } = await supabase.from('vehicle_media').insert([
        {
          vehicle_id: selectedVehicle.id,
          media_type: 'document',
          category: category,
          file_url: publicURLData.publicUrl,
        },
      ])

      if (dbError) throw dbError

      showToast('Document watermarked & saved!', 'success')
      fetchVehicleMedia(selectedVehicle.id)
    } catch (err: any) {
      console.error('Upload Error:', err)
      showToast(err.message || 'Failed to upload document.', 'error')
    } finally {
      setUploadingCategory(null)
    }
  }

  function requestDeleteMedia(category: string) {
    const categoryLabel =
      category === 'grant' ? 'Vehicle Grant (VOC)' :
        category === 'jpj' ? 'JPJ Inspection' :
          category === 'insurance' ? 'Insurance & Roadtax' : 'BER Form'

    setConfirmModal({
      title: 'Confirm Document Removal',
      message: `Are you sure you want to remove the ${categoryLabel}?`,
      confirmText: 'Remove Document',
      confirmVariant: 'danger',
      onConfirm: () => executeDeleteMedia(category),
    })
  }

  async function executeDeleteMedia(category: string) {
    setConfirmModal(null)
    if (!selectedVehicle) return

    const docsToDelete = mediaItems.filter(
      (m) => m.vehicle_id === selectedVehicle.id && m.category === category && m.media_type === 'document'
    )
    setMediaItems((currentItems) =>
      currentItems.filter((item) => !(item.category === category && item.media_type === 'document'))
    )

    const { error: dbError } = await supabase
      .from('vehicle_media')
      .delete()
      .eq('vehicle_id', selectedVehicle.id)
      .eq('category', category)
      .eq('media_type', 'document')

    if (dbError) {
      showToast('Error removing document: ' + dbError.message, 'error')
      if (selectedVehicle) fetchVehicleMedia(selectedVehicle.id)
      return
    }

    for (const doc of docsToDelete) {
      if (doc.file_url) {
        try {
          const pathParts = doc.file_url.split('/vehicle-files/')
          if (pathParts.length > 1) {
            const relativePath = decodeURIComponent(pathParts[1])
            await supabase.storage.from('vehicle-files').remove([relativePath])
          }
        } catch (err) {
          console.error('Storage deletion error:', err)
        }
      }
    }

    showToast('Document removed successfully.', 'success')
  }

  function requestLogout() {
    setConfirmModal({
      title: 'Confirm Sign Out',
      message: 'Are you sure you want to sign out of the Vehicle Management System?',
      confirmText: 'Sign Out',
      confirmVariant: 'danger',
      onConfirm: () => executeLogout(),
    })
  }

  async function executeLogout() {
    setConfirmModal(null)
    await supabase.auth.signOut()
    document.cookie.split(";").forEach((c) => {
      document.cookie = c.replace(/^ +/, "").replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
    });
    window.location.href = '/login'
  }

  const technicianPhotos = mediaItems.filter(m => m.media_type === 'photo_before' || m.media_type === 'photo_after' || m.media_type === 'photo_additional')
  const additionalPhotos = mediaItems.filter(m => m.media_type === 'photo_additional')

  const isDark = theme === 'dark'

  return (
    <div className={`min-h-screen relative selection:bg-blue-500 selection:text-white ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
          <div className={`px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 border ${toast.type === 'success'
              ? 'bg-emerald-950 text-emerald-200 border-emerald-700/80 shadow-emerald-950/50'
              : 'bg-rose-950 text-rose-200 border-rose-700/80 shadow-rose-950/50'
            }`}>
            <span>{toast.type === 'success' ? '✨' : '⚠️'}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60] animate-fadeIn">
          <div className={`border rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
            <div className={`w-12 h-12 rounded-2xl mx-auto mb-4 flex items-center justify-center text-xl font-bold border ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
              {confirmModal.confirmVariant === 'danger' ? '⚠️' : confirmModal.confirmVariant === 'success' ? '✅' : '❓'}
            </div>
            <h3 className={`text-base font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{confirmModal.title}</h3>
            <p className={`text-xs mt-2 font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{confirmModal.message}</p>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                className={`w-1/2 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className={`w-1/2 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all cursor-pointer ${confirmModal.confirmVariant === 'danger'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : confirmModal.confirmVariant === 'success'
                      ? 'bg-emerald-600 hover:bg-emerald-500'
                      : 'bg-blue-600 hover:bg-blue-500'
                  }`}
              >
                {confirmModal.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto py-10">
          <div className={`border rounded-3xl shadow-2xl max-w-lg w-full p-8 max-h-[90vh] overflow-y-auto ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className={`text-lg font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>User Account Settings</h3>
                <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Manage appearance, profile, and security credentials.</p>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}>&times;</button>
            </div>

            <form onSubmit={handleUpdateSettings} className="space-y-5">
              {/* Theme Preference */}
              <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Interface Theme Mode</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'light' ? 'bg-blue-600 text-white border-blue-500 shadow-md' : isDark ? 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                  >
                    ☀️ Day Mode
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${theme === 'dark' ? 'bg-blue-600 text-white border-blue-500 shadow-md' : isDark ? 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                  >
                    🌙 Night Mode
                  </button>
                </div>
              </div>

              {/* Read-Only Restricted Credentials */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Email (Locked)</label>
                  <input type="text" disabled value={currentUserEmail} className={`w-full border rounded-xl p-3 text-xs font-medium cursor-not-allowed ${isDark ? 'bg-slate-950 border-slate-800 text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-500'}`} />
                </div>
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Username (Locked)</label>
                  <input type="text" disabled value={settingsUsername} className={`w-full border rounded-xl p-3 text-xs font-medium cursor-not-allowed ${isDark ? 'bg-slate-950 border-slate-800 text-slate-500' : 'bg-slate-100 border-slate-200 text-slate-500'}`} />
                </div>
              </div>

              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Full Name *</label>
                <input type="text" required value={settingsFullName} onChange={(e) => setSettingsFullName(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
              </div>

              {/* Password Change Section */}
              <div className={`pt-4 border-t space-y-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <h4 className={`text-xs font-black uppercase tracking-wider ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Change Password (Optional)</h4>

                {/* Old Password */}
                <div>
                  <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Current Password</label>
                  <div className="relative">
                    <input
                      type={showOldPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPassword(!showOldPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-blue-500 cursor-pointer"
                    >
                      {showOldPassword ? '🙈 Hide' : '👁️ View'}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div>
                  <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-blue-500 cursor-pointer"
                    >
                      {showNewPassword ? '🙈 Hide' : '👁️ View'}
                    </button>
                  </div>
                </div>

                {/* Confirm New Password */}
                <div>
                  <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Confirm New Password</label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      className={`w-full border rounded-xl p-3 pr-10 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-blue-500 cursor-pointer"
                    >
                      {showConfirmPassword ? '🙈 Hide' : '👁️ View'}
                    </button>
                  </div>
                </div>
              </div>

              <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <button type="button" onClick={() => setShowSettingsModal(false)} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}>Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Media Preview Modal */}
      {previewMedia && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`border rounded-3xl shadow-2xl max-w-3xl w-full p-6 flex flex-col max-h-[90vh] ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className={`flex justify-between items-center pb-4 border-b ${isDark ? 'border-slate-800 text-white' : 'border-slate-200 text-slate-900'}`}>
              <h3 className="text-base font-extrabold truncate">{previewMedia.title}</h3>
              <button
                onClick={() => setPreviewMedia(null)}
                className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}
              >
                &times;
              </button>
            </div>

            <div className={`py-4 flex-1 overflow-auto flex items-center justify-center rounded-2xl my-4 border p-2 ${isDark ? 'bg-slate-950 border-slate-800/80' : 'bg-slate-50 border-slate-200'}`}>
              {previewMedia.url.includes('.pdf') ? (
                <iframe src={previewMedia.url} className="w-full h-[60vh] rounded-xl border-0" title={previewMedia.title} />
              ) : (
                <img
                  src={previewMedia.url}
                  alt={previewMedia.title}
                  className="max-h-[60vh] w-auto object-contain rounded-xl shadow-md"
                />
              )}
            </div>

            <div className={`flex flex-wrap justify-end gap-3 pt-2 border-t ${isDark ? 'border-slate-800/80' : 'border-slate-200'}`}>
              <button
                onClick={() => handleDownload(previewMedia.url, previewMedia.title)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
              >
                💾 Save File
              </button>
              <a
                href={previewMedia.url}
                target="_blank"
                rel="noreferrer"
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
              >
                ↗️ Open in New Tab
              </a>
              <button
                onClick={() => setPreviewMedia(null)}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'}`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`border-b sticky top-0 z-40 backdrop-blur-md shadow-lg ${isDark ? 'bg-slate-950/90 border-slate-800 text-white' : 'bg-white/90 border-slate-200 text-slate-900'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-black text-base">
              🚗
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight flex items-center gap-2">
                Vehicle Management System
              </h1>
              <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Front Desk & Operations Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-amber-600 border-slate-200'}`}
              title="Toggle Theme"
            >
              {isDark ? '☀️ Light' : '🌙 Dark'}
            </button>
            {userRole === 'admin' && (
              <Link
                href="/admin"
                className={`font-bold px-3.5 py-2 rounded-xl text-xs border transition-all flex items-center gap-1.5 shadow-xs ${isDark ? 'bg-purple-950/80 hover:bg-purple-900 text-purple-300 border-purple-800/60' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'}`}
              >
                🛡️ Admin Hub
              </Link>
            )}
            <button
              onClick={() => setShowSettingsModal(true)}
              className={`font-semibold px-3.5 py-2 rounded-xl text-xs border transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'}`}
            >
              ⚙️ Settings
            </button>
            {!selectedVehicle && (
              <button
                onClick={() => setShowModal(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl shadow-lg transition-all text-xs flex items-center gap-1.5 cursor-pointer border border-blue-500/40"
              >
                <span>+</span> New Vehicle Intake
              </button>
            )}
            <button
              onClick={requestLogout}
              className={`font-bold px-3.5 py-2 rounded-xl text-xs transition-all border cursor-pointer shadow-xs ${isDark ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border-rose-900/60' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'}`}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {selectedVehicle ? (
          <div>
            <button
              onClick={() => setSelectedVehicle(null)}
              className={`mb-6 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer px-3.5 py-2 rounded-xl border w-fit shadow-xs ${isDark ? 'bg-slate-950 text-blue-400 hover:text-blue-300 border-slate-800' : 'bg-white text-blue-600 hover:text-blue-700 border-slate-200'}`}
            >
              &larr; Back to Vehicle Registry
            </button>

            <div className={`rounded-3xl border p-8 mb-8 shadow-2xl ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
              <div className={`flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className={`text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-blue-950'}`}>{selectedVehicle.plate_number}</h2>
                    <span className="px-3.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-amber-950/80 text-amber-300 border border-amber-800/60">
                      {selectedVehicle.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className={`mt-1 font-semibold text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{selectedVehicle.make_model_year}</p>
                  <p className={`text-xs font-mono mt-2 inline-block px-3 py-1 rounded-xl border ${isDark ? 'bg-slate-900 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                    VIN: <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>{selectedVehicle.chassis_number || 'N/A'}</span>
                  </p>
                </div>
                <div className={`px-4.5 py-3 rounded-2xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <p className="text-[10px] uppercase text-slate-400 font-extrabold tracking-wider">Insurance Panel</p>
                  <p className={`text-sm font-bold mt-0.5 ${isDark ? 'text-white' : 'text-slate-800'}`}>{selectedVehicle.insurance_panel || 'None Assigned'}</p>
                </div>
              </div>

              <div className={`grid grid-cols-1 md:grid-cols-3 gap-5 py-6 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                <div className={`p-5 rounded-2xl border shadow-xs ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50/70 border-slate-200'}`}>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Intake Cost</p>
                  <p className={`text-2xl font-black mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>RM {selectedVehicle.intake_cost?.toLocaleString()}</p>
                </div>
                <div className={`p-5 rounded-2xl border shadow-xs ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50/70 border-slate-200'}`}>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Market Value</p>
                  <p className={`text-2xl font-black mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>RM {selectedVehicle.market_value?.toLocaleString()}</p>
                </div>
                <div className={`p-5 rounded-2xl border shadow-xs ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50/70 border-slate-200'}`}>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Repair Cost</p>
                  <p className={`text-2xl font-black mt-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>RM {selectedVehicle.repair_cost?.toLocaleString()}</p>
                </div>
              </div>

              <div className={`pt-6 pb-8 border-b ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                <h3 className={`text-sm font-extrabold mb-4 tracking-wider uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>1. Mandatory Document Management</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {['grant', 'jpj', 'insurance', 'ber'].map((cat) => {
                    const uploadedDoc = mediaItems.find((m) => m.media_type === 'document' && m.category === cat)
                    const isUploading = uploadingCategory === cat
                    const inputId = `file-input-${cat}`

                    const labelName =
                      cat === 'grant' ? 'Vehicle Grant (VOC)' :
                        cat === 'jpj' ? 'JPJ Inspection' :
                          cat === 'insurance' ? 'Insurance & Roadtax' : 'BER Form'

                    return (
                      <div key={cat} className={`border rounded-2xl p-5 shadow-xs transition-all flex flex-col justify-between ${isDark ? 'border-slate-800 bg-slate-900 hover:border-slate-700' : 'border-slate-200/80 bg-white hover:shadow-md'}`}>
                        <div>
                          <p className={`text-xs font-extrabold uppercase tracking-wider mb-1 ${isDark ? 'text-white' : 'text-slate-800'}`}>{labelName}</p>
                          <p className={`text-xs font-semibold mb-5 ${uploadedDoc ? 'text-emerald-500' : 'text-slate-400'}`}>
                            {uploadedDoc ? '✓ Verified & Stored' : 'Pending Upload'}
                          </p>
                        </div>
                        <div>
                          {uploadedDoc ? (
                            <div className="flex gap-2 w-full">
                              <button
                                type="button"
                                onClick={() => setPreviewMedia({ url: uploadedDoc.file_url, title: `${selectedVehicle.plate_number} - ${labelName}` })}
                                className="w-1/2 text-center bg-blue-950 text-blue-300 hover:bg-blue-900 py-2.5 rounded-xl text-xs font-bold transition-colors border border-blue-800/80 cursor-pointer"
                              >
                                View
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDeleteMedia(cat)}
                                className="w-1/2 text-center bg-rose-950 text-rose-300 hover:bg-rose-900 py-2.5 rounded-xl text-xs font-bold transition-colors border border-rose-900/80 cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <div>
                              <label
                                htmlFor={inputId}
                                className="w-full block text-center bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-xs font-bold cursor-pointer shadow-md transition-all"
                              >
                                {isUploading ? 'Uploading...' : 'Upload File'}
                              </label>
                              <input
                                id={inputId}
                                key={inputId}
                                type="file"
                                accept="application/pdf,image/*"
                                className="hidden"
                                onChange={(e) => handleFileSelect(e, cat)}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Technician Photo Evidence Section (Conditionally rendered) */}
              {technicianPhotos.length > 0 && (
                <div className="pt-8">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                    <div>
                      <h3 className={`text-sm font-extrabold tracking-wider uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>2. Technician Photo Evidence (Read-Only)</h3>
                      <p className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Captured evidence photos uploaded by technicians from the workshop floor.</p>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-xs font-bold bg-emerald-950 text-emerald-300 px-3 py-1 rounded-full border border-emerald-800/60">
                        Before: {mediaItems.filter(m => m.media_type === 'photo_before').length} / 8
                      </span>
                      <span className="text-xs font-bold bg-blue-950 text-blue-300 px-3 py-1 rounded-full border border-blue-800/60">
                        After: {mediaItems.filter(m => m.media_type === 'photo_after').length} / 8
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {PHOTO_CATEGORIES.map((cat) => {
                      const beforePhoto = mediaItems.find(m => m.media_type === 'photo_before' && m.category === cat.key)
                      const afterPhoto = mediaItems.find(m => m.media_type === 'photo_after' && m.category === cat.key)

                      return (
                        <div key={cat.key} className={`border rounded-2xl p-4 ${isDark ? 'border-slate-800 bg-slate-900/70' : 'border-slate-200 bg-slate-50'}`}>
                          <p className={`text-xs font-extrabold uppercase tracking-wider mb-3 ${isDark ? 'text-white' : 'text-slate-800'}`}>{cat.label}</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className={`border rounded-xl p-3 flex flex-col justify-between ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                              <div>
                                <p className="text-[10px] font-bold uppercase text-amber-500 tracking-wider mb-1">Before Repair</p>
                                <p className={`text-[11px] font-semibold mb-3 ${beforePhoto ? 'text-emerald-500' : 'text-slate-400 italic'}`}>
                                  {beforePhoto ? '✓ Captured' : 'Not Captured'}
                                </p>
                              </div>
                              {beforePhoto ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewMedia({ url: beforePhoto.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (Before)` })}
                                  className={`w-full text-center py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${isDark ? 'bg-slate-900 hover:bg-slate-800 text-emerald-400 border-slate-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'}`}
                                >
                                  View Photo
                                </button>
                              ) : (
                                <span className={`text-center text-[10px] py-1.5 rounded-lg font-medium ${isDark ? 'bg-slate-900 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>Pending</span>
                              )}
                            </div>

                            <div className={`border rounded-xl p-3 flex flex-col justify-between ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                              <div>
                                <p className="text-[10px] font-bold uppercase text-blue-500 tracking-wider mb-1">After Repair</p>
                                <p className={`text-[11px] font-semibold mb-3 ${afterPhoto ? 'text-blue-500' : 'text-slate-400 italic'}`}>
                                  {afterPhoto ? '✓ Captured' : 'Not Captured'}
                                </p>
                              </div>
                              {afterPhoto ? (
                                <button
                                  type="button"
                                  onClick={() => setPreviewMedia({ url: afterPhoto.file_url, title: `${selectedVehicle.plate_number} - ${cat.label} (After)` })}
                                  className={`w-full text-center py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${isDark ? 'bg-slate-900 hover:bg-slate-800 text-blue-400 border-slate-700' : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'}`}
                                >
                                  View Photo
                                </button>
                              ) : (
                                <span className={`text-center text-[10px] py-1.5 rounded-lg font-medium ${isDark ? 'bg-slate-900 text-slate-500' : 'bg-slate-100 text-slate-400'}`}>Pending</span>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {additionalPhotos.length > 0 && (
                    <div className={`mt-6 pt-6 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                      <h4 className="text-sm font-extrabold text-purple-400 uppercase tracking-wider mb-3">3. Additional Evidence Photos ({additionalPhotos.length})</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        {additionalPhotos.map((item) => {
                          const displayTitle = item.category.replace(/^extra_/, '').replace(/_[0-9]+$/, '').replace(/_/g, ' ')
                          return (
                            <div key={item.id} className={`border rounded-xl p-3.5 flex flex-col justify-between shadow-xs ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                              <div>
                                <p className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-1 capitalize">{displayTitle}</p>
                                <p className="text-[10px] font-semibold text-emerald-500 mb-3">✓ Extra Evidence</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setPreviewMedia({ url: item.file_url, title: `${selectedVehicle.plate_number} - ${displayTitle}` })}
                                className={`w-full text-center py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${isDark ? 'bg-slate-950 hover:bg-slate-800 text-purple-300 border-slate-700' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'}`}
                              >
                                View Photo &rarr;
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Active Vehicle Registry</h2>
              <span className={`text-xs font-bold px-3.5 py-1.5 rounded-full border ${isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-200 text-slate-700 border-slate-300'}`}>Total: {vehicles.length} Vehicles</span>
            </div>

            <div className={`rounded-3xl shadow-xl border overflow-hidden ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
              {loading ? (
                <div className="p-16 text-center text-slate-500 font-medium">Loading vehicle registry...</div>
              ) : vehicles.length === 0 ? (
                <div className="p-16 text-center text-slate-500 font-medium">No vehicles found. Click "+ New Vehicle Intake" to get started.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className={`text-[11px] uppercase font-bold tracking-wider border-b ${isDark ? 'bg-slate-900/80 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                        <th className="p-4.5">Plate Number</th>
                        <th className="p-4.5">Make / Model / Year</th>
                        <th className="p-4.5">Insurance Panel</th>
                        <th className="p-4.5">Status</th>
                        <th className="p-4.5">Intake Cost</th>
                        <th className="p-4.5 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y text-xs font-medium ${isDark ? 'divide-slate-800/80 text-slate-300' : 'divide-slate-100 text-slate-700'}`}>
                      {vehicles.map((v) => (
                        <tr key={v.id} className={`transition-colors ${isDark ? 'hover:bg-slate-900/50' : 'hover:bg-slate-50'}`}>
                          <td className={`p-4.5 font-bold text-sm ${isDark ? 'text-blue-400' : 'text-blue-900'}`}>{v.plate_number}</td>
                          <td className="p-4.5">{v.make_model_year}</td>
                          <td className="p-4.5 text-slate-400">{v.insurance_panel || 'N/A'}</td>
                          <td className="p-4.5">
                            <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800/60 capitalize">
                              {v.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className={`p-4.5 font-bold ${isDark ? 'text-slate-200' : 'text-slate-900'}`}>RM {v.intake_cost?.toLocaleString()}</td>
                          <td className="p-4.5 text-right">
                            <button
                              onClick={() => setSelectedVehicle(v)}
                              className={`px-3.5 py-1.5 rounded-xl font-bold transition-colors cursor-pointer shadow-xs border ${isDark ? 'bg-blue-950/80 hover:bg-blue-900 text-blue-300 border-blue-800/80' : 'bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200'}`}
                            >
                              Inspect Details &rarr;
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* New Vehicle Intake Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className={`border rounded-3xl shadow-2xl max-w-lg w-full p-8 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>New Vehicle Intake</h3>
                <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Enter vehicle details to register into the system.</p>
              </div>
              <button onClick={() => setShowModal(false)} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>&times;</button>
            </div>

            <form onSubmit={handleCreateVehicleSubmit} className="space-y-4">
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Plate Number *</label>
                <input type="text" required placeholder="e.g. WXY 1234" value={plate} onChange={(e) => setPlate(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
              </div>
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Chassis Number (VIN) *</label>
                <input type="text" required placeholder="e.g. PMAL123456789" value={chassis} onChange={(e) => setChassis(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
              </div>
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Make, Model & Year *</label>
                <input type="text" required placeholder="e.g. Honda Civic 2021" value={makeModel} onChange={(e) => setMakeModel(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
              </div>
              <div>
                <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Insurance Panel</label>
                <input type="text" placeholder="e.g. Allianz General" value={insurancePanel} onChange={(e) => setInsurancePanel(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Intake Cost (RM)</label>
                  <input type="number" step="0.01" placeholder="0.00" value={intakeCost} onChange={(e) => setIntakeCost(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                </div>
                <div>
                  <label className={`block text-[11px] font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Market Value (RM)</label>
                  <input type="number" step="0.01" placeholder="0.00" value={marketValue} onChange={(e) => setMarketValue(e.target.value)} className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-800'}`} />
                </div>
              </div>
              <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <button type="button" onClick={() => setShowModal(false)} className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}>Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer">Save Intake</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}