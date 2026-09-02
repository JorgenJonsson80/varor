-- Placement stops being derived from pick history and becomes a fact the
-- import writes down.
--
-- Until now an item's location was inferred from vp_item_monthly_volume:
-- whichever row looked newest decided where the article sat. That inference
-- had no way to be right. The table only ever grows, so rows from an older
-- import outlive the list that replaced them; a part-way-through month has
-- most articles on zero, so old and new rows tie and row order decides; and
-- trimming months from the file just makes some older import's rows the
-- newest ones present. The imported list is the authority on where things
-- are, so it now says so directly.
--
-- current_plats: where the most recent import put this article.
-- placement_batch: which import that was. Every article in one import gets
-- the same stamp, so the app can tell which articles the latest list still
-- covers without needing a 26k-item NOT IN filter — anything carrying an
-- older stamp was left out of that list and is no longer placed.

alter table vp_items
  add column if not exists current_plats text references vp_locations (plats);

alter table vp_items
  add column if not exists placement_batch timestamptz;

create index if not exists vp_items_placement_batch_idx
  on vp_items (placement_batch);
