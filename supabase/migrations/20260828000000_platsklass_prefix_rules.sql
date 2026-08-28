-- Prefix rules: tag a whole family of locations sharing a location-code
-- prefix (e.g. "P1010-07--C-" covers every shelf level under it, including
-- ones not imported into vp_locations yet). Unlike vp_platsklass_rules
-- (a fixed character position counted from the end), this handles families
-- whose suffix length varies, which a from-the-end position can't reliably
-- hit — see src/lib/location.ts's determinePlatsklass.
--
-- Priority: manual tag on the exact location > prefix rule (longest match
-- wins) > vp_platsklass_rules > base class.

create table if not exists vp_platsklass_prefix_rules (
  prefix text primary key,
  klass text not null check (klass in ('A', 'B', 'C')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

alter table vp_platsklass_prefix_rules enable row level security;

create policy vp_platsklass_prefix_rules_all on vp_platsklass_prefix_rules
  for all to authenticated using (vp_is_allowed_user()) with check (vp_is_allowed_user());
