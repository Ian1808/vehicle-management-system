"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'

type Vehicle = {
  id: string
  plate_number: string
  chassis_number: string
  make_model_year: string
  insurance_panel: string
  status: string
  created_at: string
}

type Toast = {
  message: string
  type: 'success' | 'error'
}

// ------------------------------------------------------------------
// 1. STRICT JPJ MALAYSIA NUMBER PLATE VALIDATOR
// ------------------------------------------------------------------
function formatAndValidateJPJPlate(input: string): { formatted: string; isValid: boolean; error?: string } {
  const cleaned = input.toUpperCase().trim().replace(/[^A-Z0-9]/g, '')

  if (!cleaned) {
    return { formatted: '', isValid: false, error: 'Plate number cannot be empty.' }
  }

  // Standard (e.g., WXY1234A) and Special Word Series (e.g., MADANI1, 1MALAYSIA99)
  const standardPattern = /^[A-Z]{1,3}[0-9]{1,4}[A-Z]{0,2}$/
  const specialWordPattern = /^(MADANI|MALAYSIA|1MALAYSIA|PUTRAJAYA|LANGKAWI|SUKOM|BAMBEE|PATRIOT|G1M|A1M|VIP|GOLD|PERFECT|RIMAU|SMS|US|XX|YY|ZZ|FF|BHP)[0-9]{1,4}$/

  if (standardPattern.test(cleaned) || specialWordPattern.test(cleaned)) {
    return { formatted: cleaned, isValid: true }
  }

  return {
    formatted: cleaned,
    isValid: false,
    error: 'Invalid JPJ format. Examples: WXY1234A, V1234, MADANI123'
  }
}

// ------------------------------------------------------------------
// 2. DATA.GOV.MY REAL-TIME CATALOG HOOK
// ------------------------------------------------------------------
function useVehicleCatalog() {
  const [makes, setMakes] = useState<string[]>([])
  const [models, setModels] = useState<string[]>([])
  const [allVehicles, setAllVehicles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchJpjData() {
      try {
        const res = await fetch('https://api.data.gov.my/data-catalogue?id=registration_transactions_car&limit=10000')
        const data = await res.json()

        if (data && data.length > 0) {
          setAllVehicles(data)
          // Extract unique makers, exclude empty or invalid ones
          const uniqueMakes = Array.from(new Set(data.map((v: any) => v.maker)))
            .filter(Boolean)
            .sort() as string[]
          setMakes(uniqueMakes)
        }
      } catch (error) {
        console.error("Failed to fetch JPJ data from data.gov.my", error)
      } finally {
        setLoading(false)
      }
    }
    fetchJpjData()
  }, [])

  const getModelsForMake = (selectedMake: string) => {
    const filtered = allVehicles.filter(v => v.maker === selectedMake)
    const uniqueModels = Array.from(new Set(filtered.map(v => v.model)))
      .filter(Boolean)
      .sort() as string[]
    setModels(uniqueModels)
  }

  return { makes, models, loading, getModelsForMake }
}

// ------------------------------------------------------------------
// 3. MAIN FRONT DESK DASHBOARD COMPONENT
// ------------------------------------------------------------------
export default function FrontDeskDashboard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [toast, setToast] = useState<Toast | null>(null)

  const [userRole, setUserRole] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

  // Intake Modal State
  const [showIntakeModal, setShowIntakeModal] = useState(false)
  const [plateNumber, setPlateNumber] = useState('')
  const [plateError, setPlateError] = useState('')
  const [chassisNumber, setChassisNumber] = useState('')
  const [insurancePanel, setInsurancePanel] = useState('')

  // Real-time Vehicle Catalog State
  const { makes, models, loading: catalogLoading, getModelsForMake } = useVehicleCatalog()
  const [selectedMake, setSelectedMake] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedYear, setSelectedYear] = useState('')

  const supabase = createClient()
  const isDark = theme === 'dark'

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    async function checkAuthAndFetch() {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (!user || error) {
        window.location.href = '/login'
        return
      }

      setUserId(user.id)

      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single()

      setUserRole(userData?.role || 'front_desk')
      fetchVehicles()
    }
    checkAuthAndFetch()
  }, [])

  async function fetchVehicles() {
    setLoading(true)
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })

    if (error) {
      showToast(error.message, 'error')
    } else {
      setVehicles(data || [])
    }
    setLoading(false)
  }

  function handlePlateInput(e: React.ChangeEvent<HTMLInputElement>) {
    const result = formatAndValidateJPJPlate(e.target.value)
    setPlateNumber(result.formatted)
    setPlateError(result.error || '')
  }

  function handleMakeSelection(e: React.ChangeEvent<HTMLSelectElement>) {
    const make = e.target.value
    setSelectedMake(make)
    getModelsForMake(make)
    setSelectedModel('') // Reset model when make changes
  }

  async function handleRegisterVehicle(e: React.FormEvent) {
    e.preventDefault()

    if (plateError) {
      showToast('Please fix the plate number format before submitting.', 'error')
      return
    }

    if (!selectedMake || !selectedModel || !selectedYear) {
      showToast('Please select the complete Make, Model, and Year.', 'error')
      return
    }

    const makeModelYearStr = `${selectedMake} ${selectedModel} (${selectedYear})`

    try {
      const { error } = await supabase
        .from('vehicles')
        .insert([{
          plate_number: plateNumber,
          chassis_number: chassisNumber.toUpperCase(),
          make_model_year: makeModelYearStr,
          insurance_panel: insurancePanel || null,
          status: 'intake',
          created_by: userId
        }])

      if (error) throw error

      showToast('Vehicle registered successfully!', 'success')
      setShowIntakeModal(false)

      // Reset Form
      setPlateNumber('')
      setPlateError('')
      setChassisNumber('')
      setSelectedMake('')
      setSelectedModel('')
      setSelectedYear('')
      setInsurancePanel('')

      fetchVehicles()
    } catch (err: any) {
      showToast(err.message || 'Failed to register vehicle.', 'error')
    }
  }

  async function executeLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Generate Year Options (e.g. 1990 to current year)
  const currentYear = new Date().getFullYear()
  const years = Array.from(new Array(40), (val, index) => currentYear - index)

  return (
    <div className={`min-h-screen pb-16 selection:bg-purple-500 selection:text-white ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
          <div className={`px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 border ${toast.type === 'success' ? 'bg-emerald-950 text-emerald-200 border-emerald-700/80' : 'bg-rose-950 text-rose-200 border-rose-700/80'
            }`}>
            <span>{toast.type === 'success' ? '✨' : '⚠️'}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`border-b sticky top-0 z-20 shadow-lg backdrop-blur-md ${isDark ? 'bg-slate-950/90 border-slate-800 text-white' : 'bg-white/90 border-slate-200 text-slate-900'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-black text-base">
              📋
            </div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight">Front Desk Dashboard</h1>
              <p className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Vehicle Registration & Intake Management</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={`p-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-amber-600 border-slate-200'}`}>
              {isDark ? '☀️' : '🌙'}
            </button>
            {userRole === 'admin' && (
              <Link href="/admin" className={`font-bold px-3.5 py-2 rounded-xl text-xs border transition-all ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-slate-700' : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'}`}>
                👑 Admin Hub
              </Link>
            )}
            <button onClick={executeLogout} className="bg-rose-600 hover:bg-rose-500 text-white font-bold px-3.5 py-2 rounded-xl text-xs shadow transition-all cursor-pointer">
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div>
            <h2 className={`text-2xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>Active Vehicle Cases</h2>
            <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Monitor repairs or register new vehicles arriving at the workshop.</p>
          </div>
          <button
            onClick={() => setShowIntakeModal(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-2xl text-sm font-extrabold shadow-lg transition-all cursor-pointer flex items-center gap-2"
          >
            ➕ Register New Vehicle
          </button>
        </div>

        {/* Vehicle List */}
        {loading ? (
          <div className="p-16 text-center font-medium text-slate-500">Loading active vehicles...</div>
        ) : vehicles.length === 0 ? (
          <div className={`p-16 text-center rounded-3xl border ${isDark ? 'bg-slate-950 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'}`}>
            No active vehicles found in the workshop right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {vehicles.map((v) => (
              <div key={v.id} className={`border rounded-3xl p-6 transition-all hover:shadow-xl flex flex-col justify-between ${isDark ? 'bg-slate-950 border-slate-800 hover:border-blue-500/50' : 'bg-white border-slate-200 hover:border-blue-500/50'}`}>
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className={`text-xl font-black tracking-tight ${isDark ? 'text-white' : 'text-blue-950'}`}>{v.plate_number}</h3>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${v.status === 'intake' ? 'bg-amber-950 text-amber-300 border-amber-800' :
                        v.status === 'road_ready' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' :
                          'bg-blue-950 text-blue-300 border-blue-800'
                      }`}>
                      {v.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{v.make_model_year}</p>
                  <p className={`text-[11px] font-mono mb-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>VIN: {v.chassis_number}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* INTAKE MODAL */}
      {showIntakeModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className={`border rounded-3xl shadow-2xl max-w-xl w-full p-8 my-8 ${isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-100 text-slate-900'}`}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className={`text-xl font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>Vehicle Intake Form</h3>
                <p className={`text-xs mt-0.5 font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>All vehicle data is validated against JPJ Malaysia standards.</p>
              </div>
              <button onClick={() => setShowIntakeModal(false)} className={`rounded-full w-8 h-8 flex items-center justify-center font-bold text-lg transition-colors cursor-pointer ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-400' : 'bg-slate-100 hover:bg-slate-200 text-slate-500'}`}>&times;</button>
            </div>

            <form onSubmit={handleRegisterVehicle} className="space-y-5">

              {/* JPJ PLATE NUMBER */}
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Vehicle Registration Number (JPJ) *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. WXY1234A or MADANI99"
                  value={plateNumber}
                  onChange={handlePlateInput}
                  className={`w-full border rounded-xl p-3.5 text-sm font-black focus:outline-none transition-all ${plateError
                      ? 'border-rose-500 focus:ring-2 focus:ring-rose-500 bg-rose-950/20 text-rose-400'
                      : isDark
                        ? 'bg-slate-950 border-slate-800 text-white focus:ring-2 focus:ring-blue-500'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-500'
                    }`}
                />
                {plateError && <p className="text-[10px] font-bold text-rose-500 mt-1.5">⚠️ {plateError}</p>}
              </div>

              <hr className={`border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`} />

              {/* LIVE VEHICLE CATALOG (DATA.GOV.MY) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 flex items-center gap-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Make * {catalogLoading && <span className="text-[9px] text-blue-400 animate-pulse">(Syncing with Data.gov.my...)</span>}
                  </label>
                  <select
                    required
                    disabled={catalogLoading || makes.length === 0}
                    value={selectedMake}
                    onChange={handleMakeSelection}
                    className={`w-full border rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer disabled:opacity-50 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                  >
                    <option value="">-- Select Make --</option>
                    {makes.map((make) => <option key={make} value={make}>{make}</option>)}
                  </select>
                </div>

                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Model *</label>
                  <select
                    required
                    disabled={!selectedMake || models.length === 0}
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className={`w-full border rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer disabled:opacity-50 ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                  >
                    <option value="">-- Select Model --</option>
                    {models.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                </div>
              </div>

              {/* YEAR & CHASSIS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Mfg. Year *</label>
                  <select
                    required
                    value={selectedYear}
                    onChange={(e) => setSelectedYear(e.target.value)}
                    className={`w-full border rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                  >
                    <option value="">-- Year --</option>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>

                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Chassis Number (VIN) *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. PM123456789"
                    value={chassisNumber}
                    onChange={(e) => setChassisNumber(e.target.value.toUpperCase())}
                    className={`w-full border rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none uppercase ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Insurance Panel (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Etiqa / Allianz"
                  value={insurancePanel}
                  onChange={(e) => setInsurancePanel(e.target.value)}
                  className={`w-full border rounded-xl p-3 text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none ${isDark ? 'bg-slate-950 border-slate-800 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowIntakeModal(false)}
                  className={`px-5 py-3 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${isDark ? 'text-slate-300 bg-slate-800 hover:bg-slate-700 border-slate-700' : 'text-slate-600 bg-slate-100 hover:bg-slate-200 border-slate-200'}`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!!plateError}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-extrabold shadow-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Register Vehicle Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}