export type Role = 'admin' | 'manager' | 'front_desk' | 'technician' | 'bidder'

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
    { value: 'admin', label: 'Administrator' },
    { value: 'manager', label: 'Manager' },
    { value: 'front_desk', label: 'Front Desk' },
    { value: 'technician', label: 'Technician' },
    { value: 'bidder', label: 'Bidder' },
]

// Roles a Manager may assign to staff under their own company.
export const MANAGER_ASSIGNABLE_ROLES: Role[] = ['front_desk', 'technician']

// Roles that are scoped to a company (see only their own company's data).
export const COMPANY_SCOPED_ROLES: Role[] = ['manager', 'front_desk', 'technician']
