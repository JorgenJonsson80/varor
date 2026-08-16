-- Varuplacering: platskarta (location classification) + item master + historical volume.
-- Tables are prefixed vp_ since this Supabase project is shared with other lagerappar.
--
-- Design note: computed varuklass (A/B/C per item) is intentionally NOT
-- stored here. It's derived from vp_item_monthly_volume + the thresholds in
-- vp_location_config at query/report time (see src/lib/varuklass.ts), so
-- tuning a threshold in the UI never leaves stale classifications sitting
-- in the database.

-- 1. Global config (single row) -------------------------------------------

create table if not exists vp_location_config (
  id smallint primary key default 1,
  base_klass text not null default 'B' check (base_klass in ('A', 'B', 'C')),
  station_start int not null default 4,
  station_end int not null default 5,
  pareto_threshold_a numeric not null default 0.8,
  pareto_threshold_b numeric not null default 0.95,
  trend_preceding_months int not null default 3,
  trend_threshold numeric not null default 0.25,
  period_good_top_n int not null default 2,
  period_good_threshold numeric not null default 0.6,
  period_good_min_periods int not null default 4,
  watch_threshold numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint vp_location_config_single_row check (id = 1)
);

insert into vp_location_config (id) values (1)
on conflict (id) do nothing;

-- 2. Platsklass: exception rules (ordered, first match wins) --------------

create table if not exists vp_platsklass_rules (
  id uuid primary key default gen_random_uuid(),
  sort_order int not null,
  position int not null, -- counted from the end of the location string, 1 = last char
  values text[] not null,
  klass text not null check (klass in ('A', 'B', 'C')),
  created_at timestamptz not null default now()
);

create unique index if not exists vp_platsklass_rules_sort_order_key
  on vp_platsklass_rules (sort_order);

-- 3. Platsklass: manual per-location overrides (always wins) --------------

create table if not exists vp_manual_platsklass (
  plats text primary key,
  klass text not null check (klass in ('A', 'B', 'C')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

-- 4. Item master (varor) ---------------------------------------------------

create table if not exists vp_items (
  id text primary key, -- varunummer
  description text,
  atc5 text,
  substance text,
  strength text,
  package_size text,
  expected_monthly_volume numeric,
  replaces_item_id text references vp_items (id),
  created_at timestamptz not null default now()
);

create index if not exists vp_items_atc5_package_size_idx
  on vp_items (atc5, package_size);

-- 5. Monthly pick volume history (stored long-format regardless of import) -

create table if not exists vp_item_monthly_volume (
  item_id text not null references vp_items (id) on delete cascade,
  period text not null, -- 'YYYY-MM', sorted ascending as text
  volume numeric not null default 0,
  primary key (item_id, period)
);

create index if not exists vp_item_monthly_volume_period_idx
  on vp_item_monthly_volume (period);

-- 6. Row-level security ------------------------------------------------------
-- Default: any authenticated user can read/write everything. This is an
-- internal warehouse tool with a small trusted user base. Tighten later if
-- you want read-only vs. edit roles split out.

alter table vp_location_config enable row level security;
alter table vp_platsklass_rules enable row level security;
alter table vp_manual_platsklass enable row level security;
alter table vp_items enable row level security;
alter table vp_item_monthly_volume enable row level security;

create policy vp_location_config_all on vp_location_config
  for all to authenticated using (true) with check (true);

create policy vp_platsklass_rules_all on vp_platsklass_rules
  for all to authenticated using (true) with check (true);

create policy vp_manual_platsklass_all on vp_manual_platsklass
  for all to authenticated using (true) with check (true);

create policy vp_items_all on vp_items
  for all to authenticated using (true) with check (true);

create policy vp_item_monthly_volume_all on vp_item_monthly_volume
  for all to authenticated using (true) with check (true);
