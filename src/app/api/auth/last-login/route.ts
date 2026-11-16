import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSessionUser, unauthorizedResponse } from '@/lib/apiAuth'

// Stamps users.last_login for the signed-in caller.
//
// The login page resolves the account by username, signs in with
// signInWithPassword, and only reads the role — nothing ever wrote last_login,
// so every account showed "Never logged in" in the Admin / Manager staff lists.
// The update runs server-side (service role) so it does not depend on RLS write
// policies on the users table.
export async function POST(_req: NextRequest) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url || !serviceKey) {
        return NextResponse.json({ message: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' }, { status: 503 })
    }

    // Bind the stamp to an authenticated session: without this, any caller could
    // reset another account's last_login by posting an arbitrary id.
    const user = await getSessionUser()
    if (!user) return unauthorizedResponse()

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const stamp = new Date().toISOString()

    const { error: updateErr } = await admin.from('users').update({ last_login: stamp }).eq('id', user.id)

    if (updateErr) {
        // Never echo the raw DB error to the client — it can contain column and
        // policy names. Log it instead, and fail quietly (the caller still logs in).
        console.error('[auth/last-login] update failed', { userId: user.id, message: updateErr.message })
        return NextResponse.json({ message: 'Could not record the last login time.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, last_login: stamp })
}
