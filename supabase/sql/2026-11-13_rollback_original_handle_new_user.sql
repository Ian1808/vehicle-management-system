-- ROLLBACK ONLY - restores the original (buggy) auth signup trigger.
--
-- Captured from the dashboard step-1 output on 2026-11-13, project urvjwfkkechfcchseiyk:
--   trigger:  on_auth_user_created  (AFTER INSERT ON auth.users, FOR EACH ROW)
--   function: public.handle_new_user()
--
-- What this restores: username = NEW.email, email column left empty, no exception
-- handler (so a constraint hit aborts the auth signup). That is the bug, not a fix.
--
-- SAFETY: the whole script runs inside one transaction and ends with a guard that
-- raises an exception, so an accidental full run changes NOTHING. Everything rolls
-- back. To actually apply the rollback, delete the guard DO block at the end.

begin;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.users (id, username, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Staff Member'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'front_desk')
  )
  ON CONFLICT (id) DO UPDATE
  SET username = EXCLUDED.username;

  RETURN NEW;
END;
$function$;

-- Original trigger name.
drop trigger if exists on_auth_user_created_profile on auth.users;
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- GUARD - delete this DO block to let the rollback actually commit.
-- With it in place the transaction aborts and every statement above is undone.
-- ---------------------------------------------------------------------------
do $$
begin
    raise exception 'ROLLBACK GUARD: nothing was changed. Remove this DO block only if you really want the old trigger back.';
end $$;

commit;
