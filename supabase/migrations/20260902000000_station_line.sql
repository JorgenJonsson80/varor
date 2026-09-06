-- Which line a station belongs to, so move suggestions can be limited to
-- one line at a time instead of always ranging over the whole warehouse.
--
-- Optimising a line is how the work actually gets planned: you go and do
-- one, not a list that jumps between the far ends of the building. Left
-- null for a station that stands on its own (36 and 50), which then only
-- ever optimises against itself under line scope.

alter table vp_station_types
  add column if not exists line text;

create index if not exists vp_station_types_line_idx on vp_station_types (line);
