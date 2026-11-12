import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

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
// The service-role key never reaches the browser.

const ADMIN_ONLY_ROLES = ['admin', 'manager', 'front_desk', 'technician', 'bidder']
const MANAGER_ONLY_ROLES = ['front_desk', 'technician', 'bidder']

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function serviceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    if (!serviceKey) return null
    return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
}

async function callerProfile() {
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
    const { data: { user } } = await caller.auth.getUser()
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

export async function POST(req: NextRequest) {
    if (!serviceClient()) {
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

    const isAdmin = profile.role === 'admin'
    const isManager = profile.role === 'manager'
    if (!isAdmin && !isManager) return json(403, { message: 'Only admins and managers can create staff accounts.' })

    const fullName = String(body.fullName || '').trim()
    const username = String(body.username || '').trim().toLowerCase()
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')
    const role = String(body.role || '').trim()
    let companyId = body.companyId ? String(body.companyId) : null
    const technicianType = body.technicianType ? String(body.technicianType) : null
    const specialty = body.specialty ? String(body.specialty).trim() : null

    if (!fullName || !username || !email || !password) {
        return json(400, { message: 'Full name, username, email and password are required.' })
    }
    if (!USERNAME_RE.test(username)) {
        return json(400, { message: 'Username must be 3–32 characters: letters, numbers, dot, underscore or dash (no spaces).' })
    }
    if (!EMAIL_RE.test(email)) {
        return json(400, { message: 'That email address is not valid.' })
    }
    if (password.length < 6) {
        return json(400, { message: 'Password must be at least 6 characters.' })
    }
    if (!ADMIN_ONLY_ROLES.includes(role)) {
        return json(400, { message: `Unknown role "${role}".` })
    }
    if (isManager) {
        if (!MANAGER_ONLY_ROLES.includes(role)) {
            return json(403, { message: 'Managers can only create front desk, technician or bidder accounts.' })
        }
        if (!profile.company_id) {
            return json(403, { message: 'Your account is not assigned to a company yet.' })
        }
        companyId = profile.company_id
    }

    const admin = serviceClient()!

    // ---- Availability pre-checks (readable messages instead of constraint dumps) ----
    const { data: existingUsername } = await admin
        .from('users')
        .select('id, username')
        .ilike('username', username)
        .maybeSingle()
    if (existingUsername) {
        return json(409, { code: 'username_taken', message: `Username "${username}" is already taken. Choose another one.` })
    }

    const { data: existingEmailRow } = await admin
        .from('users')
        .select('id, username, email')
        .ilike('email', email)
        .maybeSingle()
    if (existingEmailRow) {
        return json(409, { code: 'email_taken', message: `Email "${email}" already belongs to @${existingEmailRow.username}.` })
    }

    // ---- Create the auth user (does not touch the caller's session) ----
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, username, role },
    })
    if (createErr || !created?.user) {
        const raw = createErr?.message || 'Could not create the account.'
        if (/already been registered|already registered|already exists/i.test(raw)) {
            // The email may belong to an orphan account from a failed attempt: the auth
            // user exists but its `users` row is missing or incomplete.
            const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
            const orphan = list?.users?.find(u => (u.email || '').toLowerCase() === email)
            if (orphan) {
                const { data: orphanRow } = await admin.from('users').select('username, company_id').eq('id', orphan.id).maybeSingle()
                return json(409, {
                    code: 'email_orphan',
                    message: orphanRow
                        ? `Email "${email}" is already registered to @${orphanRow.username}${orphanRow.company_id ? '' : ' (no company assigned)'}. Remove that account first, then create it again.`
                        : `Email "${email}" exists from an earlier incomplete attempt with no profile row. Remove that account from the Users list, then try again.`,
                    existing_user_id: orphan.id,
                })
            }
            return json(409, { code: 'email_taken', message: `Email "${email}" is already registered.` })
        }
        return json(400, { message: raw })
    }

    const newUserId = created.user.id

    // ---- Write the profile row. The auth trigger may have pre-inserted one with
    //      username = email, so upsert on id overwrites it with the real values. ----
    const payload: Record<string, unknown> = {
        id: newUserId,
        username,
        email,
        full_name: fullName,
        role,
        company_id: companyId,
        technician_type: role === 'technician' ? (technicianType || 'inhouse') : null,
        specialty: role === 'technician' && technicianType === 'third_party' ? specialty : null,
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
        if (/23505|duplicate key|unique constraint/i.test(profileErr.message)) {
            return json(409, { code: 'username_taken', message: `Username "${username}" is already taken. Choose another one.` })
        }
        return json(500, { message: `Could not save the staff profile: ${profileErr.message}` })
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
    if (!serviceClient()) {
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
    if (userId === caller.id) return json(400, { message: 'You cannot remove your own account.' })

    const admin = serviceClient()!

    const { data: target } = await admin
        .from('users')
        .select('id, role, company_id, username')
        .eq('id', userId)
        .maybeSingle()

    if (profile.role !== 'admin') {
        const isOwnStaff = profile.role === 'manager'
            && target
            && target.company_id === profile.company_id
            && MANAGER_ONLY_ROLES.includes(target.role)
        if (!isOwnStaff) {
            return json(403, { message: 'You can only remove staff accounts from your own company.' })
        }
    }

    // Remove the auth user first so the email can be reused immediately; the
    // profile row is removed either way so the list never shows a ghost entry.
    const { error: authErr } = await admin.auth.admin.deleteUser(userId)
    if (authErr && !/not found/i.test(authErr.message)) {
        return json(400, { message: `Could not remove the login account: ${authErr.message}` })
    }

    const { error: rowErr } = await admin.from('users').delete().eq('id', userId)
    if (rowErr) return json(400, { message: `Could not remove the staff profile: ${rowErr.message}` })

    return json(200, { ok: true })
}
