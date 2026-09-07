-- Lines picked per station per day.
--
-- Separate from vp_item_monthly_volume, which counts picks per ARTICLE per
-- month. This counts the work a station actually carried, which is what
-- "line 1 should have 1500-2000 rader" is about — and the article picks
-- can't answer that, since they say nothing about days.
--
-- Stored per day rather than per month on purpose: a month three days old
-- has a tenth of the lines a finished one has, so only a per-day figure
-- makes one stretch comparable to another. Same reason the app reports
-- rader/dag rather than totals.

create table if not exists vp_station_daily_lines (
  station text not null,
  datum date not null,
  rader numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (station, datum)
);

create index if not exists vp_station_daily_lines_datum_idx on vp_station_daily_lines (datum);

alter table vp_station_daily_lines enable row level security;

create policy vp_station_daily_lines_all on vp_station_daily_lines
  for all to authenticated using (vp_is_allowed_user()) with check (vp_is_allowed_user());
