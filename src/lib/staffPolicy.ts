// Staff account policy — pure functions, no I/O.
//
// These rules used to live inline inside /api/admin/users, which made them
// impossible to test without a browser and easy to drift between the Admin and
// Manager screens. Anything that decides "may this caller create/remove this
// account" belongs here, so the route stays a thin transport layer.

export const STAFF_ROLES = ['admin', 'manager', 'front_desk', 'technician', 'bidder'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

/** Roles a manager may hand out inside their own company. */
export const MANAGER_CREATABLE_ROLES: readonly StaffRole[] = ['front_desk', 'technician', 'bidder']

/** 3–32 chars, starts alphanumeric, then letters/digits/dot/underscore/dash. */
export const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const MIN_PASSWORD_LENGTH = 6

export const ROLE_LABEL: Record<StaffRole, string> = {
    admin: 'Administrator',
    manager: 'Manager',
    front_desk: 'Front Desk',
    technician: 'Technician',
    bidder: 'Bidder',
}

export function isStaffRole(value: string): value is StaffRole {
    return (STAFF_ROLES as readonly string[]).includes(value)
}

export function isUsernameTakenConflict(errorMessage: string | undefined | null): boolean {
    return /23505|duplicate key|unique constraint/i.test(errorMessage || '')
}

export interface NewStaffInput {
    fullName?: unknown
    username?: unknown
    email?: unknown
    password?: unknown
    role?: unknown
    companyId?: unknown
    technicianType?: unknown
    specialty?: unknown
}

export interface NewStaffValues {
    fullName: string
    username: string
    email: string
    password: string
    role: StaffRole
    companyId: string | null
    technicianType: string | null
    specialty: string | null
}

export type ValidationResult = { ok: true; value: NewStaffValues } | { ok: false; message: string }

/**
 * Normalises and validates the payload posted by the staff-creation modal.
 * Messages here are user-facing: they are shown verbatim in the toast, so they
 * must never mention constraint or column names.
 */
export function validateNewStaff(input: NewStaffInput): ValidationResult {
    const fullName = String(input.fullName ?? '').trim()
    const username = String(input.username ?? '')
        .trim()
        .toLowerCase()
    const email = String(input.email ?? '')
        .trim()
        .toLowerCase()
    const password = String(input.password ?? '')
    const role = String(input.role ?? '').trim()
    const companyId = input.companyId ? String(input.companyId) : null
    const technicianType = input.technicianType ? String(input.technicianType) : null
    const specialty = input.specialty ? String(input.specialty).trim() : null

    if (!fullName || !username || !email || !password) {
        return { ok: false, message: 'Full name, username, email and password are required.' }
    }
    if (!USERNAME_RE.test(username)) {
        return {
            ok: false,
            message:
                'Username must be 3–32 characters: letters, numbers, dot, underscore or dash (no spaces).',
        }
    }
    if (!EMAIL_RE.test(email)) {
        return { ok: false, message: 'That email address is not valid.' }
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
        return { ok: false, message: 'Password must be at least 6 characters.' }
    }
    if (!isStaffRole(role)) {
        return { ok: false, message: `Unknown role "${role}".` }
    }

    return {
        ok: true,
        value: {
            fullName,
            username,
            email,
            password,
            role,
            companyId,
            technicianType: role === 'technician' ? technicianType || 'inhouse' : null,
            specialty: role === 'technician' && technicianType === 'third_party' ? specialty : null,
        },
    }
}

export interface CallerScope {
    role: string
    companyId: string | null
}

export type Decision =
    { allowed: true; companyId: string | null } | { allowed: false; status: number; message: string }

/**
 * Decides whether `caller` may create a staff account with `role`, and which
 * company it lands in. Managers are pinned to their own company and limited to
 * MANAGER_CREATABLE_ROLES; admins may target any role and any company.
 */
export function decideCreateScope(
    caller: CallerScope,
    role: StaffRole,
    requestedCompanyId: string | null
): Decision {
    if (caller.role === 'admin') {
        return { allowed: true, companyId: requestedCompanyId }
    }
    if (caller.role !== 'manager') {
        return { allowed: false, status: 403, message: 'Only admins and managers can create staff accounts.' }
    }
    if (!MANAGER_CREATABLE_ROLES.includes(role)) {
        return {
            allowed: false,
            status: 403,
            message: 'Managers can only create front desk, technician or bidder accounts.',
        }
    }
    if (!caller.companyId) {
        return { allowed: false, status: 403, message: 'Your account is not assigned to a company yet.' }
    }
    return { allowed: true, companyId: caller.companyId }
}

/**
 * Decides whether `caller` may remove `target`. Admins may remove anyone except
 * themselves; managers may remove front desk / technician / bidder accounts in
 * their own company only.
 */
export function decideDelete(
    caller: CallerScope & { id: string },
    target: { id: string; role: string; companyId: string | null } | null
): Decision {
    if (caller.id === target?.id) {
        return { allowed: false, status: 400, message: 'You cannot remove your own account.' }
    }
    if (caller.role === 'admin') {
        return { allowed: true, companyId: null }
    }
    if (caller.role !== 'manager') {
        return {
            allowed: false,
            status: 403,
            message: 'You can only remove staff accounts from your own company.',
        }
    }
    const ownsTargetCompany = !!target && !!caller.companyId && target.companyId === caller.companyId
    const targetIsManageable =
        !!target && (MANAGER_CREATABLE_ROLES as readonly string[]).includes(target.role)
    if (!ownsTargetCompany || !targetIsManageable) {
        return {
            allowed: false,
            status: 403,
            message: 'You can only remove staff accounts from your own company.',
        }
    }
    return { allowed: true, companyId: target!.companyId }
}
