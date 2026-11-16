import { createServerClient } from "@supabase/ssr"
import { type NextRequest, NextResponse } from "next/server"

// Access gate. Next 16 renamed middleware.ts to proxy.ts — the old filename is
// deprecated and is not reliably picked up, so this file is the live one.
//
// The public surface is deliberately small:
//   /login, /signup          the only pages that work without a session
//   /api/auth/resolve-login  called by the login form *before* sign-in to turn a
//                            username into an email. Exempting it is required:
//                            without it the gate answers 307 → /login, the
//                            browser follows that and gets HTML, res.json()
//                            throws, and username login dies while email login
//                            still works.
//
// Every other path, including the rest of /api, still needs a session. Those
// routes check it themselves as well, so nothing relies on this gate alone.
const PUBLIC_PATHS = ["/login", "/signup", "/api/auth/resolve-login"]

export async function proxy(request: NextRequest) {
    let supabaseResponse = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    const { data: { user } } = await supabase.auth.getUser()

    const path = request.nextUrl.pathname
    const isPublic = PUBLIC_PATHS.includes(path)

    // 1. Redirect unauthenticated users to /login
    if (!user && !isPublic) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // 2. Redirect logged-in users away from /login or /signup
    if (user && isPublic && path !== '/api/auth/resolve-login') {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
