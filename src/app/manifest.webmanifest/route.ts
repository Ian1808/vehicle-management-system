import type { NextRequest } from 'next/server'

// Web App Manifest — served as a real route handler so it always returns
// application/manifest+json in production (a plain static metadata file was
// swallowed by Next's catch-all in this Next/Turbopack prod build).
const manifest = {
  name: 'Vehicle Management System',
  short_name: 'VehicleMS',
  description: 'Workshop vehicle management — intake, repairs, technician work, and company oversight.',
  start_url: '/',
  display: 'standalone',
  background_color: '#0f172a',
  theme_color: '#7c3aed',
  orientation: 'portrait',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

export function GET(_request: NextRequest) {
  return new Response(JSON.stringify(manifest), {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  })
}
