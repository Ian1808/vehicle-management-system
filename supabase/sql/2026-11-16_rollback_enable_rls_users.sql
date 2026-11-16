-- =============================================================================
-- Rollback for 2026-11-16_enable_rls_users.sql
--
-- This restores the previous (leaky) state: RLS off again on public.users.
-- Only use it if the policy set breaks a flow that must run right now, and
-- re-apply the forward script as soon as the cause is understood.
--
-- Note: the dropped legacy policies are NOT recreated — turning RLS back off
-- reproduces the original exposure regardless, because with RLS disabled there
-- is no policy enforcement at all.
-- =============================================================================

begin;

alter table public.users disable row level security;
alter table public.repair_logs disable row level security;

drop policy if exists users_select_self on public.users;
drop policy if exists users_select_admin on public.users;
drop policy if exists users_select_same_company on public.users;
drop policy if exists users_insert_self on public.users;
drop policy if exists users_update_self on public.users;
drop policy if exists users_update_admin on public.users;
drop policy if exists users_update_manager_company on public.users;
drop policy if exists users_delete_admin on public.users;

drop function if exists public.app_current_role();
drop function if exists public.app_current_company_id();

commit;
