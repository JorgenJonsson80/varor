-- What each station is for. Platsklass says where a location sits WITHIN a
-- station (distance, height); this says what the station as a whole should
-- carry, which platsklass only partly reflects today: a vagnsplock location
-- can be A-classed because it's a good spot within that station, even though
-- the station itself wants as few lines as possible.
--
-- Drives the move suggestions in src/lib/moves.ts:
--   tunnel      +1  high-throughput picking, wants as many lines as it can take
--   vanlig       0  ordinary station, no pull either way
--   vagnsplock  -1  cart picking, wants as few lines as possible
--   temperatur  -1  temperature-controlled, same
--   aframe    excl  automated dispensing — what goes in it is a separate
--                   decision, so it is left out of suggestions entirely
--
-- Stations with no row here are left out of suggestions too, rather than
-- guessed at.

create table if not exists vp_station_types (
  station text primary key,
  type text not null check (type in ('tunnel', 'vanlig', 'vagnsplock', 'temperatur', 'aframe')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

alter table vp_station_types enable row level security;

create policy vp_station_types_all on vp_station_types
  for all to authenticated using (vp_is_allowed_user()) with check (vp_is_allowed_user());
