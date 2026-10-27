"use client"

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import Link from 'next/link'
import { fetchActiveVehicles, insertVehicle } from '@/services/vehicleService'
import VehicleIntakeModal from '@/components/forms/VehicleIntakeModal'

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

type Toast = {
  message: string
  type: 'success' | 'error'
}

export default function FrontDeskDashboard() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [toast, setToast] = useState<Toast | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [userRole, setUserRole] = useState('front_desk')

  const supabase = createClient()
  const isDark = theme === 'dark'

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

        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', user.id)
          .single()

        setUserRole(userData?.role || 'front_desk')
        const activeVehicles = await fetchActiveVehicles()
        setVehicles(activeVehicles)
      } catch (err: any) {
        showToast(err.message || 'Failed to load dashboard', 'error')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  async function handleCreateVehicle(data: {
    plate_number: string
    chassis_number: string
    make_model_year: string
    insurance_panel: string
    intake_cost: number
    market_value: number
  }) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await insertVehicle({
        ...data,
        created_by: user?.id
      })
      showToast('Vehicle successfully registered!', 'success')
      setShowModal(false)
      const activeVehicles = await fetchActiveVehicles()
      setVehicles(activeVehicles)
    } catch (err: any) {
      showToast(err.message || 'Failed to register vehicle', 'error')
    }
  }

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {toast && (
        <div className="fixed top-6 right-6 z-50 animate-bounce">
          <div className={`px-5 py-3 rounded-2xl shadow-2xl text-xs font-bold flex items-center gap-3 border ${toast.type === 'success' ? 'bg-emerald-950 text-emerald-200 border-emerald-700' : 'bg-rose-950 text-rose-200 border-rose-700'}`}>
            <span>{toast.type === 'success' ? '✨' : '⚠️'}</span>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      <header className={`border-b sticky top-0 z-40 backdrop-blur-md ${isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-white/90 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-black">🚗</div>
            <div>
              <h1 className="text-base font-extrabold tracking-tight">Vehicle Management System</h1>
              <p className="text-[11px] text-slate-400">Modular Front Desk Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className="p-2 rounded-xl text-xs font-bold border border-slate-700 bg-slate-800 text-amber-300 cursor-pointer">
              {isDark ? '☀️' : '🌙'}
            </button>
            {userRole === 'admin' && (
              <Link href="/admin" className="font-bold px-3.5 py-2 rounded-xl text-xs border border-purple-800 bg-purple-950 text-purple-300">🛡️ Admin Hub</Link>
            )}
            <button onClick={() => setShowModal(true)} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl text-xs shadow-lg cursor-pointer">
              + New Vehicle Intake
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black tracking-tight">Active Vehicle Registry</h2>
          <span className="text-xs font-bold px-3.5 py-1.5 rounded-full border border-slate-700 bg-slate-800 text-slate-300">Total: {vehicles.length} Vehicles</span>
        </div>

        {loading ? (
          <div className="p-16 text-center text-slate-500 font-medium">Loading modular registry...</div>
        ) : vehicles.length === 0 ? (
          <div className="p-16 text-center text-slate-500 font-medium">No vehicles found. Click "+ New Vehicle Intake" to get started.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {vehicles.map((v) => (
              <div key={v.id} className="border border-slate-800 bg-slate-950 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-xl font-black text-blue-400">{v.plate_number}</h3>
                    <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-950 text-amber-300 border border-amber-800">
                      {v.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-300 mb-2">{v.make_model_year}</p>
                  <p className="text-[11px] font-mono text-slate-500 mb-4">VIN: {v.chassis_number}</p>
                </div>
                <div className="pt-4 border-t border-slate-900 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400">Intake Cost: <span className="text-white">RM {v.intake_cost?.toLocaleString()}</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <VehicleIntakeModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleCreateVehicle}
        isDark={isDark}
      />
    </div>
  )
}
