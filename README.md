# Abracadabra — Stock & Picking Monitoring

Abracadabra is a web app to monitor inventory/picking status across stores/warehouses and reduce operational errors.

**Demo:** <https://abracadabra.pelodeoso.com.pe/>  
**Screenshots:** see `/docs/screenshots`

## Problem
- <What operational problem you faced>
- <Why existing tools were not enough>
- <What you improved (speed, errors, visibility)>

## Key features
- Inventory visibility by store/warehouse
- Picking monitoring and status tracking
- <Alerts / dashboards / exports> (add what applies)
- <Integrations> (e.g., Bsale / Supabase)

## Tech stack
- Frontend: Vite + React + TypeScript + Tailwind + shadcn/ui
- Backend/DB: Supabase (Postgres, SQL, migrations) *(if accurate)*
- Package manager: Bun

## Architecture (high level)
UI (React) → API/Edge functions → Postgres (Supabase) → Integrations

## Run locally
### Requirements
- Bun (recommended) or Node.js

### Setup
git clone https://github.com/renzocarrillo/abracadabra-showcase.git
cd abracadabra-showcase
cp .env.example .env
# fill required variables
bun install
bun run dev
Environment variables

Document the required vars here (no secrets in the repo):

<VITE_SUPABASE_URL>

<VITE_SUPABASE_ANON_KEY>

<etc>
License

<MIT / All rights reserved>
