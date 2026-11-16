# Code quality pass — what was done with the 12 generic suggestions

Date: 2026-11-16. Scope: the whole `vehicle-management-doubao` app (Next.js 16.4.3 + Supabase).

The 12 suggestions were treated as a menu, not a checklist: each was either adopted,
narrowed, or deliberately deferred with a reason. Where a suggestion was adopted, the
verification that backs it is listed.

## Adopted

| # | Suggestion | What was actually done |
|---|---|---|
| 4 | TypeScript | Already in place (strict project). Removed the remaining `any` escape hatches: 17 `catch (err: any)` sites now use `catch (err)` + `errorMessage(err, fallback)` from `src/lib/errors.ts`; `watermark.ts` copies PDF bytes into a real `ArrayBuffer` instead of `as any`; `ThirdPartyAssignmentPanel` maps rows into a typed `MediaRow`. |
| 3 | Error handling | Server routes keep DB details in `console.error` and return readable messages to the UI (`/api/admin/users`, `/api/ocr/grant`, `/api/auth/last-login`). `/api/ocr/grant` also gained the session check it was missing and an 8 MB payload cap (413). |
| 7 | Testing | `vitest` + `src/lib/staffPolicy.test.ts` — 15 cases covering username/email/password validation, the manager→staff permission matrix, and the delete matrix. Scope is deliberately narrow: pure policy, no DOM. |
| 1 | Formatting | `.prettierrc` matched to the existing style (4 spaces, no semicolons, single quotes, 110 cols). Formatted `src/lib/**` and `src/app/api/**` only; UI modules are left alone so the demo diff stays readable. |
| 5 | Modularization | Large UI modules were left as-is (see below), but the authorization rules that used to live inline in a 200-line route were extracted into `src/lib/staffPolicy.ts`, which is what made them testable. Shared session lookup moved to `src/lib/apiAuth.ts`. |
| 12 | CI/CD | `.github/workflows/ci.yml`: `npm ci` → `tsc --noEmit` → `npm run lint` → `npm test` → `npm run build`, on push/PR to `main`. Build gets placeholder `NEXT_PUBLIC_*` values so it compiles without live credentials. |
| 10 | Security | Ranked first, not tenth: the three service-role routes bypass RLS, so their authorization is hand-written. Each now checks the session role/company server-side; `/api/admin/users` refuses to delete yourself and refuses cross-company deletes for managers. |
| 2 | Comments | Adopted in the "why, not what" form: comments explain the reason behind the non-obvious choices (why an effect sets state, why the error helper checks for plain objects, why the OCR cap exists). |

## Narrowed or deferred

- **6 / 8 — optimization and performance.** With 7 vehicles and 6 staff accounts there is
  no measured problem to optimize. Premature work here would add risk before a demo.
  The real performance item (an index or query change) should be driven by a measurement.
- **9 — UI.** Not a code task; the UI was already reviewed with the user over several
  rounds (compact mobile layout, staged editing, tab behaviour). No new UI change was
  made in this pass.
- **11 — documentation.** This file covers the decisions. API-by-API docs would be
  duplicated by the route handlers and would go stale.
- **5 — splitting the big modules.** `AdminModule.tsx` (~2000 lines) and
  `vehicleDatabaseService.ts` (~1600) would benefit from splitting, but a mechanical
  split immediately before a demo risks regressions for no user-visible gain. It is
  worth doing on a branch, not in the demo build.
- **Prettier on `src/modules/**`.** Would touch 50+ files with whitespace-only changes.

## Verification (this pass)

- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors, 37 warnings (pre-existing: `react-hooks/exhaustive-deps`).
  Warnings are left visible rather than silenced; CI fails on errors only.
- `npm test` — 15/15.
- `npm run build` — clean (Next 16.4.3, Turbopack), 4 dynamic API routes, 5 static pages.
- UI regression (`regression_create_staff.js` against a live dev server): duplicate
  username shows a readable toast, retry with the same email succeeds, session survives
  a reload, and deleting the account from the UI removes both the row and the auth user.
- Database after the run: 7 staff rows, 7 auth users, no test leftovers.

## Known gaps

- `frontdesk2` exists in `public.users` with no `last_login` — created outside this pass,
  left untouched.
- The 5 `react-hooks/set-state-in-effect` sites carry targeted
  `eslint-disable-next-line` with a stated reason (localStorage hydration, zoom reset on
  item change, tab follow on status change) instead of a state refactor.
- `git push` was not run; the commits are local.

## Row Level Security on public.users (2026-11-16)

Supabase Security Advisor flagged `public.users` twice (CRITICAL: RLS disabled) and
`public.repair_logs` once. Measured before the fix, with only the publishable key:

```
GET /rest/v1/users?select=username,email,role,company_id   →  200, 0-6/7 rows
```

The anon key ships inside the JS bundle, so this was a public read of every staff
username, email, role and company — and those usernames are the login identifiers.

### What had to change before RLS could go on

The login form resolved a username to an email straight from the browser
(`supabase.from('users').select('email').ilike('username', …)`, running as anon).
That was moved to `POST /api/auth/resolve-login` (service role, returns only the email,
one silent 404 for unknown/suspended/blank). Nothing pre-auth reads `users` any more.

### The script

`supabase/sql/2026-11-16_enable_rls_users.sql` — one transaction:
1. `app_current_role()` / `app_current_company_id()` — SECURITY DEFINER + `search_path = ''`,
   because policies on `users` that query `users` recurse otherwise.
2. `enable row level security` on both tables (the toggle, doing its only job).
3. Drops every legacy policy on `users` (the advisor said policies already existed and
   their content is unknown; a permissive `using (true)` leftover would keep leaking
   even with RLS on).
4. Policies: self read/write; admin read/write/delete all; manager read+update own
   company only; same-company read for staff; self-signup insert limited to non-`admin`
   roles (closes a privilege-escalation hole that existed before).
5. `repair_logs`: RLS on, no policies — it has no code references and no rows.

### Verified after running it

| Check | Result |
|---|---|
| anon read of `public.users` | HTTP 200, `*/0`, `[]` (was 7 rows) |
| anon read of `repair_logs` | `[]` |
| login by username, all 6 accounts | admin → Admin Hub, manager/manager2 → Manager Dashboard, frontdesk → Front Desk, technician/ecu → Technician Portal |
| bad username | readable "Username not found" toast, no raw DB error |
| admin staff list (admin select policy) | 7 rows |
| admin create staff (service role) | 200, row written |
| create → reload → still Admin Hub | session intact (self select policy) |
| delete staff via UI | row removed from list |
| signup form | renders (self-insert policy) |
| database afterwards | 7 rows / 7 auth users, no probe leftovers |

Not exercised: the manager suspend / reactivate write path (`users_update_manager_company`
policy) — it was verified at the SQL level only, not clicked through the UI.

