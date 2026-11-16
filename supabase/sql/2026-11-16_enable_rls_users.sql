-- =============================================================================
-- Enable Row Level Security on public.users (and lock public.repair_logs)
-- Date: 2026-11-16
--
-- WHY
--   Supabase Security Advisor reports CRITICAL:
--     • Policy Exists RLS Disabled  — public.users
--     • RLS Disabled in Public      — public.users
--     • RLS Disabled in Public      — public.repair_logs
--
--   Verified against the live project: with nothing but the public anon key
--   (which ships inside the JS bundle, so "public" means public), an unauthenticated
--   visitor gets HTTP 200 and the whole staff roster from
--   GET /rest/v1/users?select=username,email,role,company_id  →  0-6/7 rows.
--
-- WHAT CHANGES IN THE APP BEFORE THIS RUNS
--   Username login used to read public.users from the browser with the anon key.
--   That now goes through POST /api/auth/resolve-login (service role, returns only
--   the email). Deploy that route first, then run this script — otherwise username
--   login fails as soon as RLS is on.
--
-- ORDER OF OPERATIONS
--   1. Deploy the app (route + login page).
--   2. Run this whole script in the Supabase SQL editor. It is one transaction:
--      it either applies completely or not at all.
--   3. Run the verification block at the bottom (separate, read-only).
--
-- POLICY MODEL
--   • self                      — read/update your own row
--   • admin                     — read all, update all, delete any
--   • manager (same company)    — read own company, update own company staff only
--   • staff (same company)      — read own company (needed for technician lists)
--   • self-signup               — may insert/update its own row but never as 'admin'
--
--   Service-role routes (/api/admin/users, /api/auth/last-login, /api/impersonate)
--   are unaffected: service_role bypasses RLS by design.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Helpers. These read public.users, so they must be SECURITY DEFINER —
--    otherwise every policy on public.users would recurse into itself.
--    search_path = '' forces schema-qualified references (no hijacking).
-- ---------------------------------------------------------------------------
create or replace function public.app_current_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.role from public.users u where u.id = auth.uid()
$$;

create or replace function public.app_current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.company_id from public.users u where u.id = auth.uid()
$$;

revoke all on function public.app_current_role() from public;
revoke all on function public.app_current_company_id() from public;
grant execute on function public.app_current_role() to authenticated;
grant execute on function public.app_current_company_id() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Turn RLS on. This is the actual fix for the two CRITICAL findings.
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.repair_logs enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Drop any legacy policies on public.users.
--    The advisor said "Policy Exists RLS Disabled", i.e. policies exist from an
--    earlier attempt. If any of them is USING (true) it would keep leaking once
--    RLS is enabled, and we cannot inspect them from here — so clear them.
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'users'
  loop
    execute format('drop policy %I on public.users', p.policyname);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. public.users policies
-- ---------------------------------------------------------------------------

-- Read your own profile (page.tsx, login role check, technician self-lookup).
create policy users_select_self
  on public.users for select to authenticated
  using (id = auth.uid());

-- Admin sees everything (Admin Hub staff list, impersonation picker).
create policy users_select_admin
  on public.users for select to authenticated
  using (public.app_current_role() = 'admin');

-- Same-company visibility: managers see their staff list, front desk and
-- technicians see the technicians they can assign work to.
create policy users_select_same_company
  on public.users for select to authenticated
  using (company_id is not null and company_id = public.app_current_company_id());

-- Self-signup writes its own row (the auth trigger may have pre-created it).
-- Role is constrained here so a self-registered account cannot claim 'admin'.
create policy users_insert_self
  on public.users for insert to authenticated
  with check (id = auth.uid() and role <> 'admin');

create policy users_update_self
  on public.users for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and (role <> 'admin' or public.app_current_role() = 'admin'));

-- Admin edits any profile (Admin Hub staff editing).
create policy users_update_admin
  on public.users for update to authenticated
  using (public.app_current_role() = 'admin')
  with check (true);

-- Manager edits own-company staff (suspend / reactivate) but cannot move them
-- to another company and cannot touch admins.
create policy users_update_manager_company
  on public.users for update to authenticated
  using (
    public.app_current_role() = 'manager'
    and company_id = public.app_current_company_id()
    and role <> 'admin'
  )
  with check (
    public.app_current_role() = 'manager'
    and company_id = public.app_current_company_id()
    and role <> 'admin'
  );

-- Deletes go through /api/admin/users (service role). Keep the direct path
-- admin-only rather than open.
create policy users_delete_admin
  on public.users for delete to authenticated
  using (public.app_current_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 5. public.repair_logs
--    Flagged CRITICAL but unused by the app (no code references) and currently
--    empty. RLS with no policies = locked to everyone except service_role.
--    If repair_logs is ever wired up, add explicit policies here.
-- ---------------------------------------------------------------------------
do $$
declare
  p record;
begin
  for p in
    select policyname from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'repair_logs'
  loop
    execute format('drop policy %I on public.repair_logs', p.policyname);
  end loop;
end $$;

commit;

-- =============================================================================
-- VERIFICATION — run this block on its own after the commit above.
-- Expected: rls_enabled = true for both tables, and the anon probe is empty.
-- =============================================================================
-- select relname, relrowsecurity as rls_enabled
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public' and relname in ('users', 'repair_logs');
--
-- select tablename, policyname, cmd, roles
-- from pg_policies
-- where schemaname = 'public' and tablename = 'users'
-- order by policyname;
--
-- -- Must return 0 rows for anon (use the anon/publishable key, not service role):
-- --   GET {SUPABASE_URL}/rest/v1/users?select=username,email
-- --   apikey: <NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY>
