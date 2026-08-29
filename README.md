# Varuplacering

Internt verktyg för ABC-analys av varuplacering i ett läkemedelsdistributionslager. Läser plockstatistik per
månad, klassar varor och lagerplatser i A/B/C, och pekar ut placeringar som är fel.

## Stack

Vite + React + TypeScript + Supabase (Postgres, RLS, e-post+lösenord-auth). Domänlogik i `src/lib/` (ren, testad —
se `src/lib/__tests__/`), data-hooks i `src/hooks/`, UI i `src/components/`.

## Utveckling

```bash
npm install
npm run dev      # startar dev-servern
npm test         # kör hela testsviten (src/lib/)
npm run build    # produktionsbygge
```

Kopiera `.env.example` till `.env` och fyll i din Supabase-projekts URL och anon key (Project Settings → API).

## Databas

Schemat ligger som SQL-migrationer i `supabase/migrations/`, körs i filnamnsordning via Supabase SQL editor.
Access styrs av en allowlist (`vp_allowed_users`) — se `20260816000000_access_allowlist.sql` för hur nya
användare läggs till.

## Deploy

GitHub Actions bygger och publicerar till GitHub Pages på push till `main` (`.github/workflows/deploy.yml`).
Kräver repo-secrets `VITE_SUPABASE_URL` och `VITE_SUPABASE_ANON_KEY`.
