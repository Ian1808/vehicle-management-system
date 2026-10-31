import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

// Admin impersonation ("Log in as this user").
//
// Flow:
//   1. The caller must be signed in AND be an in-house 'admin'.
//   2. The server (service-role client, bypasses RLS) mints a magic-link token
//      for the target user — no email is sent; the token is returned directly.
//   3. The client exchanges it with supabase.auth.verifyOtp, which swaps this
//      browser onto the target user's session.
//   4. The admin's own session was backed up in localStorage before the swap,
//      so "Exit impersonation" restores it via setSession.
//
// The service-role key must NEVER reach the browser: it lives only in
// .env.local / Vercel env as SUPABASE_SERVICE_ROLE_KEY.
export async function POST(req: NextRequest) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!serviceKey) {
        return NextResponse.json(
            { error: 'no_key', message: 'SUPABASE_SERVICE_ROLE_KEY is not configured in .env.local' },
            { status: 503 }
        )
    }

    let userId = ''
    try {
        const body = await req.json()
        userId = typeof body?.user_id === 'string' ? body.user_id.trim() : ''
    } catch {
        return NextResponse.json({ error: 'bad_request', message: 'Invalid JSON body' }, { status: 400 })
    }
    if (!userId) {
        return NextResponse.json({ error: 'bad_request', message: 'user_id is required' }, { status: 400 })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const cookieStore = await cookies()
    const caller = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        cookies: {
            getAll() {
                return cookieStore.getAll()
            },
            setAll() {
                // One-shot route — refreshed cookies need not be persisted here.
            },
        },
    })
    const { data: { user: callerUser }, error: callerError } = await caller.auth.getUser()
    if (callerError || !callerUser) {
        return NextResponse.json({ error: 'unauthorized', message: 'You must be signed in.' }, { status: 401 })
    }

    const admin = createClient(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })

    // Caller must be an in-house admin.
    const { data: callerProfile } = await admin
        .from('users')
        .select('role')
        .eq('id', callerUser.id)
        .maybeSingle()
    if (callerProfile?.role !== 'admin') {
        return NextResponse.json(
            { error: 'forbidden', message: 'Only administrators can impersonate users.' },
            { status: 403 }
        )
    }

    // Target user lookup.
    const { data: target } = await admin
        .from('users')
        .select('id, email, full_name, username, is_suspended')
        .eq('id', userId)
        .maybeSingle()
    if (!target) {
        return NextResponse.json({ error: 'not_found', message: 'User not found.' }, { status: 404 })
    }
    if (target.is_suspended) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Suspended accounts cannot be impersonated.' },
            { status: 403 }
        )
    }
    if (!target.email) {
        return NextResponse.json(
            { error: 'bad_request', message: 'That account has no email — impersonation needs a valid email.' },
            { status: 400 }
        )
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: target.email,
    })
    // The SDK exposes this as hashed_token; the client's verifyOtp({ type: 'magiclink', token_hash }) consumes it.
    if (linkError || !linkData?.properties?.hashed_token) {
        return NextResponse.json(
            { error: 'link_failed', message: linkError?.message || 'Could not generate impersonation link.' },
            { status: 500 }
        )
    }

    return NextResponse.json({
        token_hash: linkData.properties.hashed_token,
        user: {
            id: target.id,
            email: target.email,
            full_name: target.full_name,
            username: target.username,
        },
    })
}
