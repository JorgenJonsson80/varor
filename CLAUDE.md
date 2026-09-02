# Varuplacering — guide för Claude Code

Internt ABC-analysverktyg för varuplacering i ett lager. Läser plockstatistik per månad, klassar
varor (varuklass) och lagerplatser (platsklass) i A/B/C, och pekar ut placeringar som inte stämmer
(t.ex. en A-vara på en C-plats). Byggt första gången åt en läkemedelsdistributör (~26 000 aktiva
artiklar), men domänlogiken är generisk — se avsnittet **"Bygga detta åt en ny kund"** nedan.

## Stå fast vid detta

**Fråga innan du gissar på domänlogik.** Allt i `src/lib/` är hård-vunnen lagerkunskap (Pareto-
gränser, hur platskoder ska tolkas, vad en "periodvara" är, prioritetsordningen mellan manuell tagg/
prefix-regel/positions-regel/grundklass). Om en ändring rör något av detta och specen inte är
glasklar: fråga användaren, gissa inte. Det är alltid billigare att fråga än att bygga fel — det är
skälet till att det finns 100+ tester i `src/lib/__tests__/` som låser exakt detta beteende.

**UI sist.** Domänlogik i `src/lib/` byggs pure och testas fullt innan någon komponent rör den.

## Stack

Vite + React 19 + TypeScript + Supabase (Postgres, RLS, e-post+lösenord-auth). Vitest för tester.
PapaParse (CSV) + SheetJS `xlsx` för filimport. GitHub Actions + GitHub Pages för deploy.

## Arkitektur

- `src/lib/` — ren domänlogik, inga sido-effekter, fullt testad:
  - `varuklass.ts` — Pareto-klassificering (kumulativ volymandel → A/B/C)
  - `location.ts` — `determinePlatsklass`: prioritetskedjan **manuell tagg (exakt plats) → prefix-
    regel (längsta match vinner) → positions-regel (första träff vinner) → grundklass**
  - `trend.ts`, `periodgoods.ts`, `signals.ts` — trend (±X% mot föregående N månader),
    periodvaru-detektion (koncentration av volym på få månader), 7-signalers prioritetskedja
  - `results.ts` — kombinerar allt till en rad per vara; stödjer `ResultViewMode` (senaste månaden /
    en vald månad / snitt över alla månader)
  - `supabasePagination.ts` — keyset-paginering (`fetchAllRows`). **Använd aldrig OFFSET/`.range()`
    för stora tabeller** — det bröts två gånger på ~116k-rader-tabellen (exact count för dyrt,
    OFFSET blir dyrare ju djupare in man kommer). Keyset-cursorn är den enda lösning som visat sig
    hålla.
  - `newitems.ts` — proxy-klassificering för nya varor utan egen historik (ATC-5 + förpackningsstorlek)
- `src/hooks/` — en hook per Supabase-tabell/koncept, delade via `src/context/AppDataContext.tsx`
  så config/regler/platser hämtas en gång och delas mellan Resultat- och Platskarta-vyn.
- `src/components/Platskarta/` — adminvy: importera platslista, hantera platsregler (positions- och
  prefix-baserade), manuell tagg per plats med staged/batchat sparflöde, JSON-export/import av hela
  platskartan.
- `src/components/Resultat/` — den faktiska analysvyn: tabell med signaler, sorterbara kolumner,
  summeringspanel (signal-räkning + klickbar varuklass×platsklass-matris), månadsväljare + snitt-vy.

## Databas

Schema som SQL-migrationer i `supabase/migrations/`, körs i filnamnsordning via Supabase SQL editor
(inget CLI/CI kör dem automatiskt — de måste köras manuellt varje gång). Viktigast:

- `vp_location_config` — en rad, globala inställningar (Pareto-gränser, trend-fönster,
  periodvaru-tröskel, `station_start`/`station_end` för hur platskoden delas upp).
- `vp_locations` — fysiska platser + eventuell manuell platsklass-tagg.
- `vp_platsklass_rules` / `vp_platsklass_prefix_rules` — positions- respektive prefix-baserade regler.
- `vp_items` / `vp_item_monthly_volume` — varor + månadsvis plockvolym per plats.
  **`vp_items.current_plats` + `placement_batch` är sanningen om var en vara ligger.** Härled
  aldrig placeringen ur `vp_item_monthly_volume` — se lärdomen nedan.
- `vp_allowed_users` + `vp_is_allowed_user()` — **åtkomst-allowlist**. Detta Supabase-projekt delas
  med andra lagerappar (samma organisation/projekt), så varje tabells RLS-policy måste gå via
  `vp_is_allowed_user()`, en `BEFORE INSERT`-trigger på `auth.users` blockerar signup för icke-
  godkända mejl, och `useAuth.ts` gör en RPC-koll direkt efter inloggning som loggar ut vem som helst
  som redan har ett konto i en *annan* app på samma projekt. **Hoppa aldrig över detta mönster** —
  det är vad som håller appen privat på ett delat projekt.

Nya användare läggs till i `vp_allowed_users`, och får sitt första lösenord satt direkt via SQL
(inte mejl — magic-link/SMTP visade sig opålitligt):

```sql
insert into vp_allowed_users (email) values ('ny.användare@exempel.se');

update auth.users set encrypted_password = crypt('temporärt-lösenord', gen_salt('bf'))
where email = 'ny.användare@exempel.se';
```

## Bygga detta åt en ny kund

Domänlogiken (`src/lib/`) är generisk — det som är kundspecifikt är platskoders format,
lagrets faktiska platser/artiklar, och några konfigvärden. Så här sätter du upp en ny instans:

1. **Nytt Supabase-projekt** (egen databas — dela inte projekt mellan kunder). Kopiera
   `.env.example` → `.env`, fyll i den nya projektets URL + anon key (Project Settings → API).
2. **Kör migrationerna** i `supabase/migrations/` i filnamnsordning via SQL editor.
3. **Sätt första admin-användaren**: `insert into vp_allowed_users (...)` + `encrypted_password`
   enligt ovan — annars kan ingen logga in (signup är blockerad by design).
4. **Anpassa `vp_location_config`** till kundens verklighet innan något annat görs:
   - `station_start`/`station_end` — vilka tecken i platskoden (räknat framifrån) som identifierar
     en station/gång. Kolla kundens faktiska platskoder innan du gissar ett värde.
   - `pareto_threshold_a`/`_b`, `trend_threshold`, `period_good_*` — börja med defaults, justera
     bara om kunden ber om det efter att ha sett resultatet.
5. **Bygg platskartan för det nya lagret**: importera platslistan (Platskarta-vyn), sätt upp
   positions- och/eller prefix-regler utifrån hur *den kundens* platskoder är uppbyggda — detta är
   inte kod, det är lagerkunskap som bara kunden har. Fråga, gissa inte.
6. **Deploy**: forka/skapa nytt repo, sätt repo-secrets `VITE_SUPABASE_URL` +
   `VITE_SUPABASE_ANON_KEY`, GitHub Pages-workflowen (`.github/workflows/deploy.yml`) sköter resten
   på push till `main`.

## Lärdomar värda att komma ihåg

- **Placering skrivs ner vid import, den härleds aldrig.** `vp_item_monthly_volume` växer bara och
  städas aldrig, så rader från en gammal import överlever listan som skulle ersätta dem — kapar man
  månader ur filen blir en tidigare imports rader plötsligt de nyaste. Och i en påbörjad månad står
  de flesta varor på noll, så en flyttad varas gamla och nya rad blir oavgjort och radordningen i
  filen får bestämma. Tre olika härledningsregler testades och föll på samma sak. Nu skriver
  importen `current_plats` per vara (platsen med plock i den nyaste månaden filen täcker) plus en
  `placement_batch`-stämpel gemensam för hela importen; varor med äldre stämpel var inte med i
  senaste listan och räknas inte som placerade. Att välja en gammal månad i månadsväljaren läser
  fortfarande historiken — det är enda stället historiken får styra platsen.
- **Egress/anropskvot är en delad resurs** när flera appar sitter i samma Supabase-organisation —
  en enskild apps ineffektiva hämtning (t.ex. full tabell hämtad separat av varje flik istället för
  delad) kan slå ut *alla* appar i organisationen med en Fair Use-spärr, inte bara sin egen app.
- **En icke-`useCallback`-inslagen setter/callback från en custom hook, använd som `useEffect`-
  dependency på ett annat ställe**, är en klassisk oändlig-loop-bugg (ny funktionsreferens varje
  render → effekten kör om → sätter state → ny render → …). Detta orsakade en verklig incident
  (~15 miljoner Supabase-anrop) i en systerapp. Kolla alltid för detta mönster när du rör en hook
  som returnerar en funktion.
- **En agent som fått instruktionen "investigation only — gör inga kodändringar" kan ändå skriva
  kod** om den ges tillräckligt rik kontext om ett pågående problem. Verifiera alltid vad en agent
  faktiskt rörde (`git status`/`git diff`, tidsstämplar) innan du committar något den producerat,
  även när instruktionen var glasklar.
