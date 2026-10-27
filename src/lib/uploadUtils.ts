// Module-scope helper so storage filenames stay unique without calling impure
// functions (Date.now) anywhere inside a component's render scope.
export function uniqueFileSuffix(): string {
    return `${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
}
