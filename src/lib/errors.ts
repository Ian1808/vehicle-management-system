// Narrowing helper for catch blocks.
//
// Most modules used `catch (err: any)` purely to reach `err.message`. That
// disables type checking on every error path and trips no-explicit-any. `unknown`
// plus this helper keeps the same user-facing behaviour without the escape hatch.
//
// Supabase returns plain objects rather than Error instances, so a
// `instanceof Error` check alone would lose their messages — hence the object
// branch.
export function errorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message
    if (typeof err === 'string' && err.trim()) return err
    if (err && typeof err === 'object') {
        const candidate = (err as { message?: unknown }).message
        if (typeof candidate === 'string' && candidate.trim()) return candidate
    }
    return fallback
}
