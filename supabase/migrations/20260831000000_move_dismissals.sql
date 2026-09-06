-- Why a suggested move can't be carried out, so it stops being suggested.
--
-- The reason decides how widely the dismissal applies, which is the point of
-- recording it rather than just hiding a row in someone's browser:
--   plats_saknas / plats_blockerad  -> plats set, item_id null
--        the location is no use to anyone, never propose it as a destination
--   vara_utgar                      -> item_id set, plats null
--        the article is being phased out, no point moving it anywhere
--   everything else                 -> both set
--        says something about one article in one slot and nothing beyond it
--
-- A location blocked here is still fine as a SOURCE — getting an article off
-- a broken slot is worth suggesting. See src/lib/moves.ts.
--
-- This only affects move suggestions. Dismissed locations and articles stay
-- in the results table and the statistics exactly as before.

create table if not exists vp_move_dismissals (
  id uuid primary key default gen_random_uuid(),
  item_id text references vp_items (id) on delete cascade,
  plats text references vp_locations (plats) on delete cascade,
  reason text not null check (
    reason in (
      'kartong_for_stor',
      'plats_saknas',
      'plats_blockerad',
      'fel_plockmetod',
      'kraver_temperatur',
      'vara_utgar',
      'annat'
    )
  ),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint vp_move_dismissals_targets_something check (item_id is not null or plats is not null)
);

create index if not exists vp_move_dismissals_item_idx on vp_move_dismissals (item_id);
create index if not exists vp_move_dismissals_plats_idx on vp_move_dismissals (plats);

alter table vp_move_dismissals enable row level security;

create policy vp_move_dismissals_all on vp_move_dismissals
  for all to authenticated using (vp_is_allowed_user()) with check (vp_is_allowed_user());
