-- Fix: profile row created by the auth signup trigger was malformed
--
-- Symptom this fixes (Supabase project urvjwfkkechfcchseiyk):
--   Every new auth.users row produced a public.users row with
--     username = <full email>, email = NULL, company_id = NULL
--   so staff lists showed "@manager@workshop2.com", the email column looked empty,
--   and any client-side follow-up write either collided (unique users_username_key)
--   or fatally aborted the signup itself.
--
-- Run this in the Supabase dashboard SQL Editor (project: urvjwfkkechfcchseiyk).
-- Safe to re-run. Keep step 1 output if you ever want to restore the old function.

-- ---------------------------------------------------------------------------
-- STEP 1 - Inspect what is there now (read-only)
-- ---------------------------------------------------------------------------
select t.tgname                            as trigger_name,
       p.oid::regprocedure                 as function_signature,
       pg_get_functiondef(p.oid)           as function_definition
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal;

-- ---------------------------------------------------------------------------
-- STEP 2 - Corrected profile-creation function
--   * username comes from raw_user_meta_data->>'username' (fallback: email local
--     part), is sanitised to [a-z0-9._-] and made unique with a numeric suffix
--   * email is stored in the email column
--   * role is whitelisted, anything unknown falls back to front_desk
--   * a failure NEVER aborts the auth signup (it logs a warning instead)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_email    text := lower(coalesce(new.email, ''));
    v_base     text;
    v_username text;
    v_suffix   int  := 0;
    v_role     text := lower(coalesce(new.raw_user_meta_data->>'role', 'front_desk'));
    v_full     text := coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), '');
begin
    if v_role not in ('admin', 'manager', 'front_desk', 'technician', 'bidder') then
        v_role := 'front_desk';
    end if;

    v_base := lower(coalesce(nullif(btrim(new.raw_user_meta_data->>'username'), ''), split_part(v_email, '@', 1)));
    v_base := regexp_replace(v_base, '[^a-z0-9._-]', '', 'g');

    if v_base = '' then
        v_base := 'user';
    end if;
    v_base := left(v_base, 28);

    v_username := v_base;
    loop
        exit when not exists (select 1 from public.users u where lower(u.username) = v_username);
        v_suffix := v_suffix + 1;
        if v_suffix > 50 then
            v_username := v_base || '-' || substr(new.id::text, 1, 8);
            exit;
        end if;
        v_username := v_base || v_suffix::text;
    end loop;

    insert into public.users (id, username, email, full_name, role, company_id, is_suspended)
    values (
        new.id,
        v_username,
        nullif(v_email, ''),
        coalesce(nullif(v_full, ''), v_username),
        v_role,
        null,
        false
    )
    on conflict (id) do update
        set username  = excluded.username,
            email     = coalesce(excluded.email, users.email),
            full_name = coalesce(nullif(excluded.full_name, ''), users.full_name),
            role      = excluded.role;

    return new;
exception
    when others then
        raise warning 'handle_new_user: no profile for % (%): %', new.id, v_email, sqlerrm;
        return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- STEP 3 - Rebind the trigger to the corrected function
--   Only drops triggers on auth.users whose public-schema function name looks
--   like a signup-profile handler, so unrelated triggers are left alone.
-- ---------------------------------------------------------------------------
do $$
declare
    r record;
begin
    for r in
        select t.tgname
        from pg_trigger t
        join pg_proc p on p.oid = t.tgfoid
        where t.tgrelid = 'auth.users'::regclass
          and not t.tgisinternal
          and p.pronamespace = 'public'::regnamespace
          and (p.proname ilike '%new_user%'
            or p.proname ilike '%signup%'
            or p.proname ilike '%user_profile%'
            or p.proname ilike '%create_profile%')
    loop
        execute format('drop trigger if exists %I on auth.users', r.tgname);
    end loop;
end $$;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- STEP 4 - Verify (should return exactly one trigger, on handle_new_user)
-- ---------------------------------------------------------------------------
select t.tgname as trigger_name, p.oid::regprocedure as function_signature
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal;

-- ---------------------------------------------------------------------------
-- OPTIONAL - look for profiles that still carry the old malformed shape
-- (username equal to the email, email column empty). These are leftovers from
-- signups made before the fix; remove them through the Admin Users list.
-- ---------------------------------------------------------------------------
select u.id, u.username, u.email, u.role, u.company_id, a.email as auth_email
from public.users u
join auth.users a on a.id = u.id
where u.email is null
   or u.username = lower(coalesce(a.email, ''))
order by u.created_at;
