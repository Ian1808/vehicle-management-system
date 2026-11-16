import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { decideCreateScope, decideDelete, isUsernameTakenConflict, validateNewStaff } from '@/lib/staffPolicy'

// Staff account creation / removal.
//
// Why this lives on the server:
//   * `supabase.auth.signUp()` on the browser client REPLACES the current session
//     with the brand-new user, so an admin who creates a staff account gets
//     silently logged in as that staff member (and loses the admin session on
//     refresh). Creating users with the service-role admin API leaves the
//     caller's session untouched.
//   * A failed signUp leaves an orphan auth user behind, which makes every later
//     attempt with the same email fail with "User already registered". Here the
//     auth user is rolled back if the `users` row cannot be written.
//   * Duplicate usernames surface as "duplicate key value violates unique
//     constraint users_username_key" — replaced with a readable message.
//
// Authorization rules live in src/lib/staffPolicy.ts (pure, unit-tested); this
// route only moves data. The service-role key never reaches the browser.

function serviceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!url || !serviceKey) return null
    return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

/**
 * Resolves the signed-in caller's profile.
 * - `user === null`  -> no session
 * - `profile === null` -> session exists but the profile row is missing
 */
async function callerProfile() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    if (!url || !anonKey) return { user: null, profile: null }

    const cookieStore = await cookies()
    const caller = createServerClient(url, anonKey, {
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
    } = await caller.auth.getUser()
    if (!user) return { user: null, profile: null }

    const admin = serviceClient()
    if (!admin) return { user, profile: null }

    const { data: profile } = await admin
        .from('users')
        .select('id, role, company_id')
        .eq('id', user.id)
        .maybeSingle()

    return { user, profile }
}

function json(status: number, payload: Record<string, unknown>) {
    return NextResponse.json(payload, { status })
}

/**
 * Finds the auth user occupying `email`, so Supabase's opaque "already
 * registered" can be turned into an actionable message — including the orphan
 * case where the auth user exists but its profile row was never written.
 */
async function findEmailOwner(admin: NonNullable<ReturnType<typeof serviceClient>>, email: string) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    return list?.users?.find((u) => (u.email || '').toLowerCase() === email) ?? null
}

export async function POST(req: NextRequest) {
    const admin = serviceClient()
    if (!admin) {
        return json(503, { error: 'no_key', message: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' })
    }

    let body: Record<string, unknown>
    try {
        body = await req.json()
    } catch {
        return json(400, { message: 'Invalid JSON body.' })
    }

    const { user: caller, profile } = await callerProfile()
    if (!caller) return json(401, { message: 'You must be signed in.' })
    if (!profile) return json(403, { message: 'Your account has no profile row yet.' })

    const validated = validateNewStaff(body)
    if (!validated.ok) {
        return json(400, { message: validated.message })
    }
    const staff = validated.value

    const scope = decideCreateScope(
        { role: profile.role, companyId: profile.company_id ?? null },
        staff.role,
        staff.companyId
    )
    if (!scope.allowed) {
        return json(scope.status, { message: scope.message })
    }
    const companyId = scope.companyId

    // ---- Availability pre-checks: readable messages instead of constraint dumps ----
    const { data: existingUsername } = await admin
        .from('users')
        .select('id, username')
        .ilike('username', staff.username)
        .maybeSingle()
    if (existingUsername) {
        return json(409, {
            code: 'username_taken',
            message: `Username "${staff.username}" is already taken. Choose another one.`,
        })
    }

    const { data: existingEmailRow } = await admin
        .from('users')
        .select('id, username, email')
        .ilike('email', staff.email)
        .maybeSingle()
    if (existingEmailRow) {
        return json(409, {
            code: 'email_taken',
            message: `Email "${staff.email}" already belongs to @${existingEmailRow.username}.`,
        })
    }

    // ---- Create the auth user (does not touch the caller's session) ----
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: staff.email,
        password: staff.password,
        email_confirm: true,
        user_metadata: { full_name: staff.fullName, username: staff.username, role: staff.role },
    })

    if (createErr || !created?.user) {
        const raw = createErr?.message || 'Could not create the account.'
        if (/already been registered|already registered|already exists/i.test(raw)) {
            const orphan = await findEmailOwner(admin, staff.email)
            if (orphan) {
                const { data: orphanRow } = await admin
                    .from('users')
                    .select('username, company_id')
                    .eq('id', orphan.id)
                    .maybeSingle()
                return json(409, {
                    code: 'email_orphan',
                    message: orphanRow
                        ? `Email "${staff.email}" is already registered to @${orphanRow.username}${orphanRow.company_id ? '' : ' (no company assigned)'}. Remove that account first, then create it again.`
                        : `Email "${staff.email}" exists from an earlier incomplete attempt with no profile row. Remove that account from the Users list, then try again.`,
                    existing_user_id: orphan.id,
                })
            }
            return json(409, {
                code: 'email_taken',
                message: `Email "${staff.email}" is already registered.`,
            })
        }
        console.error('[admin/users] createUser failed', { email: staff.email, message: raw })
        return json(400, { message: raw })
    }

    const newUserId = created.user.id

    // ---- Write the profile row. The auth trigger may have pre-inserted one, so
    //      upsert on id replaces it with the values the admin actually typed. ----
    const payload: Record<string, unknown> = {
        id: newUserId,
        username: staff.username,
        email: staff.email,
        full_name: staff.fullName,
        role: staff.role,
        company_id: companyId,
        technician_type: staff.technicianType,
        specialty: staff.specialty,
        is_suspended: false,
    }

    let profileErr = (await admin.from('users').upsert(payload, { onConflict: 'id' })).error

    if (profileErr && /technician_type|specialty/i.test(profileErr.message)) {
        // Column may not exist yet if the DB migration hasn't run.
        delete payload.technician_type
        delete payload.specialty
        profileErr = (await admin.from('users').upsert(payload, { onConflict: 'id' })).error
    }

    if (profileErr) {
        // Roll the auth user back so the same email can be retried cleanly.
        await admin.auth.admin.deleteUser(newUserId)
        if (isUsernameTakenConflict(profileErr.message)) {
            return json(409, {
                code: 'username_taken',
                message: `Username "${staff.username}" is already taken. Choose another one.`,
            })
        }
        console.error('[admin/users] profile upsert failed', {
            userId: newUserId,
            message: profileErr.message,
        })
        return json(500, { message: 'Could not save the staff profile. Please try again.' })
    }

    // Read back to confirm the trigger's placeholder row was replaced.
    const { data: savedRow } = await admin
        .from('users')
        .select('id, username, email, role, company_id, full_name')
        .eq('id', newUserId)
        .maybeSingle()

    return json(200, { ok: true, user: savedRow })
}

export async function DELETE(req: NextRequest) {
    const admin = serviceClient()
    if (!admin) {
        return json(503, { error: 'no_key', message: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' })
    }

    let userId = ''
    try {
        const body = await req.json()
        userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
    } catch {
        return json(400, { message: 'Invalid JSON body.' })
    }
    if (!userId) return json(400, { message: 'userId is required.' })

    const { user: caller, profile } = await callerProfile()
    if (!caller) return json(401, { message: 'You must be signed in.' })
    if (!profile) return json(403, { message: 'Your account has no profile row yet.' })

    const { data: target } = await admin
        .from('users')
        .select('id, role, company_id, username')
        .eq('id', userId)
        .maybeSingle()

    const decision = decideDelete(
        { id: caller.id, role: profile.role, companyId: profile.company_id ?? null },
        target ? { id: target.id, role: target.role, companyId: target.company_id ?? null } : null
    )
    if (!decision.allowed) {
        return json(decision.status, { message: decision.message })
    }

    // Remove the auth user first so the email can be reused immediately; the
    // profile row is removed either way so the list never shows a ghost entry.
    const { error: authErr } = await admin.auth.admin.deleteUser(userId)
    if (authErr && !/not found/i.test(authErr.message)) {
        console.error('[admin/users] auth delete failed', { userId, message: authErr.message })
        return json(400, { message: 'Could not remove the login account. Please try again.' })
    }

    const { error: rowErr } = await admin.from('users').delete().eq('id', userId)
    if (rowErr) {
        console.error('[admin/users] profile delete failed', { userId, message: rowErr.message })
        return json(400, { message: 'Could not remove the staff profile. Please try again.' })
    }

    return json(200, { ok: true })
}
