-- Restricts every table from "any authenticated user" to "any allowlisted
-- authenticated user." Supabase magic-link sign-in auto-creates an account
-- for any email that requests one (default setting) — without this, the
-- moment the app is reachable on a public URL, anyone who finds it could
-- sign themselves in and get full read/write access to the warehouse data
-- under the old `using (true)` policies.
--
-- The allowed-user check lives in Postgres, not a Supabase dashboard
-- toggle, so it can't be silently reset and it's reviewable in git.

create table if not exists vp_allowed_users (
  email text primary key,
  added_at timestamptz not null default now(),
  added_by uuid references auth.users (id)
);

-- Seed the first allowed user directly (this runs as the SQL editor's
-- privileged role, bypassing RLS, so there's no bootstrapping deadlock).
insert into vp_allowed_users (email) values ('jorgenjonsson80@gmail.com')
on conflict (email) do nothing;

create or replace function vp_is_allowed_user()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from vp_allowed_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

alter table vp_allowed_users enable row level security;

-- Self-service: an allowed user can manage the allowlist (add/remove
-- colleagues) without needing to open the SQL editor again.
create policy vp_allowed_users_all on vp_allowed_users
  for all to authenticated using (vp_is_allowed_user()) with check (vp_is_allowed_user());

drop policy if exists vp_location_config_all on vp_location_config;
create policy vp_location_config_all on vp_location_config
  for all to authenticated using (vp_is_allowed_user()) with check (vp_is_allowed_user());

drop policy if exists vp_platsklass_rules_all on vp_platsklass_rules;
create policy vp_platsklass_rules_all on vp_platsklass_rules
  for all to authenticated using (vp_is_allowed_user()) with check (vp_is_allowed_user());

drop policy if exists vp_items_all on vp_items;
create policy vp_items_all on vp_items
  for all to authenticated using (vp_is_allowed_user()) with check (vp_is_allowed_user());

drop policy if exists vp_item_monthly_volume_all on vp_item_monthly_volume;
create policy vp_item_monthly_volume_all on vp_item_monthly_volume
  for all to authenticated using (vp_is_allowed_user()) with check (vp_is_allowed_user());

drop policy if exists vp_locations_all on vp_locations;
create policy vp_locations_all on vp_locations
  for all to authenticated using (vp_is_allowed_user()) with check (vp_is_allowed_user());
