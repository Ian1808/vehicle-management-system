import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

// Shared session helper for API routes.
//
// Every route that touches the service-role client must first establish WHO is
// calling, because the service role bypasses RLS entirely — there is no database
// policy standing between an anonymous request and privileged writes. Routes
// used to each hand-roll this; one of them (/api/ocr/grant) had no check at all
// and only the page-level middleware redirect stood in front of it.

/** Returns the signed-in user from the request cookies, or null. */
export async function getSessionUser() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !anonKey) return null

    const cookieStore = await cookies()
    const client = createServerClient(url, anonKey, {
        cookies: {
            getAll() {
                return cookieStore.getAll()
            },
            setAll() {
                // One-shot route — refreshed cookies need not be persisted here.
            },
        },
    })

    const {
        data: { user },
    } = await client.auth.getUser()
    return user ?? null
}

/** Standard 401 body for routes that require a session. */
export function unauthorizedResponse(message = 'You must be signed in.') {
    return NextResponse.json({ error: 'unauthorized', message }, { status: 401 })
}
