import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Resolves a username to the account email so the login form can accept either.
//
// Why this exists: the login form used to read public.users straight from the
// browser with the public anon key. That only worked because row level security
// was disabled on public.users — which also meant the whole staff roster
// (username, email, role, company) was readable by anyone who opened the site.
//
// This route returns exactly one value (the email) and nothing else, so RLS can
// be enabled on public.users without breaking username login.
//
// Note: it is intentionally unauthenticated (it runs before sign-in) and that
// makes it an username→email oracle. The response is deliberately mute: unknown,
// suspended and empty accounts all get the same 404. If abuse becomes a concern,
// put a rate limit / captcha in front of it.
export async function POST(req: NextRequest) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url || !serviceKey) {
        return NextResponse.json({ message: 'Sign-in is not configured. Contact an administrator.' }, { status: 503 })
    }

    let identifier = ''
    try {
        const body = (await req.json()) as { identifier?: unknown }
        if (typeof body.identifier === 'string') identifier = body.identifier.trim()
    } catch {
        // Fall through to the empty-input guard below.
    }

    if (!identifier || identifier.length > 64) {
        return NextResponse.json({ message: 'Enter a username or email address.' }, { status: 400 })
    }

    // Already an email — the form can sign in directly, no lookup needed.
    if (identifier.includes('@')) {
        return NextResponse.json({ email: identifier })
    }

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

    // Escape LIKE wildcards so a literal underscore in a username is not a pattern.
    const pattern = identifier.replace(/[\\%_]/g, '\\$&')

    const { data, error } = await admin
        .from('users')
        .select('email, is_suspended')
        .ilike('username', pattern)
        .maybeSingle()

    if (error) {
        console.error('[auth/resolve-login] lookup failed', { message: error.message })
        return NextResponse.json({ message: 'Could not look that up. Please try again.' }, { status: 500 })
    }

    // One message for every failure mode, so this cannot be used to enumerate
    // which usernames exist or which accounts are suspended.
    if (!data?.email || data.is_suspended) {
        return NextResponse.json({ message: 'Username not found. Please check your username.' }, { status: 404 })
    }

    return NextResponse.json({ email: data.email })
}
