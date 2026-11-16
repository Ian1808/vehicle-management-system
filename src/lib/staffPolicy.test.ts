import { describe, expect, it } from 'vitest'
import {
    EMAIL_RE,
    USERNAME_RE,
    decideCreateScope,
    decideDelete,
    isStaffRole,
    validateNewStaff,
} from './staffPolicy'

const valid = {
    fullName: 'Manager Two',
    username: 'manager2',
    email: 'manager@workshop2.com',
    password: 'manager2123',
    role: 'manager',
}

describe('username / email format', () => {
    it('accepts staff-style usernames', () => {
        for (const name of ['manager2', 'front_desk', 'a.b-c', 'x11']) {
            expect(USERNAME_RE.test(name), name).toBe(true)
        }
    })

    it('rejects spaces, short names and a leading separator', () => {
        for (const name of ['manager 2', 'ab', 'x1', '_dash', 'has@at']) {
            expect(USERNAME_RE.test(name), name).toBe(false)
        }
    })

    it('accepts a normal address and rejects the malformed ones', () => {
        expect(EMAIL_RE.test('staff@workshop.com')).toBe(true)
        expect(EMAIL_RE.test('no-at-sign')).toBe(false)
        expect(EMAIL_RE.test('spaces in@mail.com')).toBe(false)
    })
})

describe('validateNewStaff', () => {
    it('normalises the values it accepts', () => {
        const result = validateNewStaff({ ...valid, username: '  MANAGER2 ', email: ' M@Work.com ' })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.value.username).toBe('manager2')
        expect(result.value.email).toBe('m@work.com')
        expect(result.value.companyId).toBeNull()
    })

    it('defaults technicians to inhouse and drops specialty otherwise', () => {
        const inhouse = validateNewStaff({ ...valid, role: 'technician' })
        const thirdParty = validateNewStaff({
            ...valid,
            role: 'technician',
            technicianType: 'third_party',
            specialty: 'ECU',
        })
        const frontDesk = validateNewStaff({ ...valid, role: 'front_desk', specialty: 'ECU' })
        if (!inhouse.ok || !thirdParty.ok || !frontDesk.ok) throw new Error('expected valid payloads')
        expect(inhouse.value.technicianType).toBe('inhouse')
        expect(thirdParty.value.technicianType).toBe('third_party')
        expect(thirdParty.value.specialty).toBe('ECU')
        expect(frontDesk.value.technicianType).toBeNull()
        expect(frontDesk.value.specialty).toBeNull()
    })

    it('returns user-readable messages, never constraint names', () => {
        const cases: Array<[Record<string, unknown>, string]> = [
            [{ ...valid, fullName: '' }, 'Full name, username, email and password are required.'],
            [{ ...valid, username: 'no space allowed' }, 'Username must be 3–32 characters'],
            [{ ...valid, email: 'broken' }, 'That email address is not valid.'],
            [{ ...valid, password: '123' }, 'Password must be at least 6 characters.'],
            [{ ...valid, role: 'owner' }, 'Unknown role "owner".'],
        ]
        for (const [input, expected] of cases) {
            const result = validateNewStaff(input)
            expect(result.ok).toBe(false)
            if (result.ok) continue
            expect(result.message).toContain(expected)
            expect(result.message).not.toMatch(/users_username_key|constraint|23505/i)
        }
    })

    it('rejects roles outside the staff set', () => {
        expect(isStaffRole('admin')).toBe(true)
        expect(isStaffRole('Admin')).toBe(false)
        expect(isStaffRole('')).toBe(false)
    })
})

describe('decideCreateScope', () => {
    const adminCaller = { role: 'admin', companyId: 'c-default' }
    const managerCaller = { role: 'manager', companyId: 'c-two' }

    it('lets an admin pick any role in any company', () => {
        const decision = decideCreateScope(adminCaller, 'admin', 'c-two')
        expect(decision).toEqual({ allowed: true, companyId: 'c-two' })
    })

    it('pins a manager to their own company even when another is requested', () => {
        const decision = decideCreateScope(managerCaller, 'front_desk', 'c-default')
        expect(decision).toEqual({ allowed: true, companyId: 'c-two' })
    })

    it('blocks a manager from creating admin or manager accounts', () => {
        for (const role of ['admin', 'manager'] as const) {
            const decision = decideCreateScope(managerCaller, role, null)
            expect(decision.allowed).toBe(false)
            if (decision.allowed) continue
            expect(decision.status).toBe(403)
            expect(decision.message).toBe(
                'Managers can only create front desk, technician or bidder accounts.'
            )
        }
    })

    it('blocks a manager with no company and any non-privileged caller', () => {
        const noCompany = decideCreateScope({ role: 'manager', companyId: null }, 'technician', null)
        expect(noCompany.allowed).toBe(false)

        const frontDesk = decideCreateScope(
            { role: 'front_desk', companyId: 'c-default' },
            'technician',
            null
        )
        expect(frontDesk).toEqual({
            allowed: false,
            status: 403,
            message: 'Only admins and managers can create staff accounts.',
        })
    })
})

describe('decideDelete', () => {
    const admin = { id: 'admin-id', role: 'admin', companyId: 'c-default' }
    const manager = { id: 'manager-id', role: 'manager', companyId: 'c-two' }
    const staffRow = (role: string, companyId: string | null, id = 'target') => ({ id, role, companyId })

    it('refuses self-deletion for everyone', () => {
        for (const caller of [admin, manager]) {
            const decision = decideDelete(caller, staffRow('manager', caller.companyId, caller.id))
            expect(decision).toEqual({
                allowed: false,
                status: 400,
                message: 'You cannot remove your own account.',
            })
        }
    })

    it('lets an admin remove staff of any company', () => {
        expect(decideDelete(admin, staffRow('technician', 'c-two')).allowed).toBe(true)
        expect(decideDelete(admin, staffRow('manager', 'c-two')).allowed).toBe(true)
    })

    it('scopes a manager to their own company and manageable roles', () => {
        expect(decideDelete(manager, staffRow('technician', 'c-two')).allowed).toBe(true)
        expect(decideDelete(manager, staffRow('front_desk', 'c-default')).allowed).toBe(false)
        expect(decideDelete(manager, staffRow('manager', 'c-two')).allowed).toBe(false)
        expect(decideDelete(manager, null).allowed).toBe(false)
    })

    it('blocks non-privileged callers', () => {
        const decision = decideDelete(
            { id: 'fd', role: 'front_desk', companyId: 'c-two' },
            staffRow('technician', 'c-two')
        )
        expect(decision.allowed).toBe(false)
    })
})
