-- The allowlist from the previous migration blocks DATA access for
-- unapproved users, but not account creation itself: Supabase magic-link
-- sign-in auto-creates an auth.users row for any email that requests one,
-- so a stranger could still reach the sign-in page, get a working session,
-- and cause an OTP email to be sent from this project — RLS would leave
-- them looking at an empty app, but the account and the email still happen.
--
-- This blocks the account creation itself: a BEFORE INSERT trigger on
-- auth.users rejects the insert unless the email is already on
-- vp_allowed_users. Existing users (already inserted) are untouched —
-- this only gates the creation of NEW accounts, so an allowlisted person
-- must be added to vp_allowed_users before their first sign-in, after
-- which normal magic-link sign-in works with no extra insert involved.

create or replace function vp_check_allowed_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from vp_allowed_users where email = lower(new.email)
  ) then
    raise exception 'E-postadressen % är inte godkänd för Varuplacering.', new.email
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists vp_enforce_allowed_signup on auth.users;

create trigger vp_enforce_allowed_signup
before insert on auth.users
for each row execute function vp_check_allowed_signup();
