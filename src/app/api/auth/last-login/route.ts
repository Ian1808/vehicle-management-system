import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Stamps users.last_login for the signed-in caller.
//
// The login page resolves the account by username, signs in with
// signInWithPassword, and only reads the role — nothing ever wrote last_login,
// so every account showed "Never logged in" in the Admin / Manager staff lists.
// The update runs server-side (service role) so it does not depend on RLS write
// policies on the users table.
export async function POST(_req: NextRequest) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!serviceKey) {
        return NextResponse.json({ message: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 503 })
    }

    const cookieStore = await cookies()
    const caller = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        cookies: {
            getAll() {
                return cookieStore.getAll()
            },
            setAll() {
                // One-shot route — no session refresh needed.
            },
        },
    })

    const { data: { user }, error } = await caller.auth.getUser()
    if (error || !user) {
        return NextResponse.json({ message: 'You must be signed in.' }, { status: 401 })
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const stamp = new Date().toISOString()

    const { error: updateErr } = await admin
        .from('users')
        .update({ last_login: stamp })
        .eq('id', user.id)

    if (updateErr) {
        return NextResponse.json({ message: `Could not record last login: ${updateErr.message}` }, { status: 500 })
    }

    return NextResponse.json({ ok: true, last_login: stamp })
}
