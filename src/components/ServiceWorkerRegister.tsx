"use client"

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    // Service workers require a secure context (HTTPS) — localhost is exempt for dev.
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return

    let cancelled = false
    const register = () => {
      if (cancelled) return
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.warn('[PWA] Service worker registration failed:', err)
      })
    }

    if (document.readyState === 'complete') register()
    else window.addEventListener('load', register)

    return () => { cancelled = true }
  }, [])

  return null
}
