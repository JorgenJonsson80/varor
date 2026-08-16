-- Follow-up to 20260814000000_init_schema.sql, informed by how the source
-- data actually looks:
--   - plockstatistik rows are vara+plats+volume (one row per item per
--     period), so vp_item_monthly_volume needs to carry the item's location.
--   - the platskarta admin UI browses ALL physical locations, including
--     empty ones, from a separate JD Edwards location export — not just
--     whatever has shown up in a pick-volume import.
--
-- vp_manual_platsklass is dropped in favor of folding the manual override
-- straight into vp_locations: it's a 1:1 relationship (one location has at
-- most one override), so a join bought nothing. The database has no real
-- data yet, so this is a clean swap rather than a migration of live rows.

drop table if exists vp_manual_platsklass;

create table if not exists vp_locations (
  plats text primary key,
  manual_klass text check (manual_klass in ('A', 'B', 'C')),
  manual_updated_at timestamptz,
  manual_updated_by uuid references auth.users (id),
  imported_at timestamptz not null default now()
);

alter table vp_locations enable row level security;

create policy vp_locations_all on vp_locations
  for all to authenticated using (true) with check (true);

-- Item monthly volume now carries the item's location at that period.
alter table vp_item_monthly_volume
  add column if not exists plats text references vp_locations (plats);

alter table vp_item_monthly_volume
  alter column plats set not null;

create index if not exists vp_item_monthly_volume_plats_idx
  on vp_item_monthly_volume (plats);
