-- Adds 'kraver_pallplats' as a dismissal reason.
--
-- Prompted by a real case: 531572 has to sit on a pallet location, but
-- dismissing the suggestion only blocked that one combination, so the
-- article came straight back proposed somewhere else. Needing a pallet slot
-- is a property of the article, not of the slot it was suggested into —
-- see the widened default scopes in src/lib/moves.ts.

alter table vp_move_dismissals drop constraint if exists vp_move_dismissals_reason_check;

alter table vp_move_dismissals add constraint vp_move_dismissals_reason_check check (
  reason in (
    'kartong_for_stor',
    'plats_saknas',
    'plats_blockerad',
    'fel_plockmetod',
    'kraver_pallplats',
    'kraver_temperatur',
    'vara_utgar',
    'annat'
  )
);
