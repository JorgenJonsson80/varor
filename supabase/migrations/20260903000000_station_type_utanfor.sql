-- Adds 'utanfor' as a station type: deliberately outside the analysis.
--
-- KG/KYL (stations 80-86) isn't used, and leaving those stations with no
-- type at all already excludes them — but "no type" also means "setup not
-- finished", which the suggestions panel reports as something to go and
-- fix. This lets a station say the setup IS finished and the answer is to
-- leave it alone, so a real gap stays visible as a real gap.

alter table vp_station_types drop constraint if exists vp_station_types_type_check;

alter table vp_station_types add constraint vp_station_types_type_check check (
  type in ('tunnel', 'vanlig', 'vagnsplock', 'temperatur', 'aframe', 'utanfor')
);
