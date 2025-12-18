# Abracadabra — Inventory Bins, Picking & Shopify Sync (Showcase)

**ES (resumen):** Abracadabra es una app web que monitorea stock por **bins** (ubicaciones internas del almacén), organiza **órdenes de picking** y sincroniza productos/variantes entre **Bsale ↔ Shopify**. Permite inventarios por bin (más rápidos y precisos) y mejora el flujo de reposición/ventas sin depender de WhatsApp.

**EN (summary):** Abracadabra is a web app that tracks inventory by **warehouse bins**, manages **picking orders**, and syncs products/variants between **Bsale ↔ Shopify**. It enables fast, accurate bin-level inventories and improves warehouse operations for growing small businesses.

> This repository is a **showcase** version for academic review. It contains **no secrets** and uses `.env.example`.

---

## What problem it solves
Small businesses often know they have stock, but not **where it is**. This creates:
- slow and error-prone picking (time wasted searching),
- painful full-warehouse inventories (closing operations for days),
- chaotic store replenishment requests (e.g., via WhatsApp threads),
- inconsistent product data across systems (ERP ↔ e-commerce).

Abracadabra “atomizes” the warehouse into **bins**, so every SKU has a known location and count. This enables:
- **inventories per bin** (quick, precise, continuous),
- **picking orders** displayed in arrival order for pickers,
- **product/variant synchronization** between Bsale and Shopify.

---

## Key features (Top 3)
### 1) Bin-level inventories (simple & precise)
- Track stock and locations by bin
- Perform inventories **per bin** instead of closing the entire warehouse
- Improve accuracy and reduce operational downtime

### 2) Orders & picking workflow (organized & fast)
- Orders displayed in **arrival order**
- Clear picking flow for warehouse staff (“pickers”)
- Removes dependency on long WhatsApp threads

### 3) Shopify synchronization (useful & low-cost)
- Sync products and variants between **Bsale ↔ Shopify**
- Keeps catalogs updated consistently
- Stores product images using Shopify as a practical, low-cost solution

---

## Who it is for
- **Small businesses** that are growing inventory complexity
- Teams that need **location-aware inventory** and faster picking
- Operations that require reliable catalog sync between ERP and Shopify

---

## Tech stack
- **Frontend:** Vite + React + TypeScript
- **UI:** Tailwind CSS + shadcn/ui
- **Backend/DB:** Supabase (Postgres)
- **Server logic:** Supabase Edge Functions
- **Integrations:** Bsale API, Shopify API, n8n

---

## High-level architecture
- React UI (Vite)  
  → Supabase (Auth / DB / Edge Functions)  
  → Integrations (Bsale, Shopify)  
  → Automation workflows (n8n) when needed

---

## Repository structure
- `src/` — React application (UI + client logic)
- `public/` — static assets
- `supabase/` — database migrations/queries and Edge Functions (if present)
- `tools/` — scripts & manual tests (if present)
- `.env.example` — environment variables template (no secrets)

---

## Screenshots 
There is no public demo. Add screenshots here for reviewers:

Then reference them below:

![Dashboard](docs/screenshots/dashboard.png)
![Bins](docs/screenshots/bins.png)
![Orders](docs/screenshots/orders.png)

---

## Run locally

### Prerequisites
- **Bun** or **Node.js (LTS)**

### 1) Clone
```bash
git clone https://github.com/renzocarrillo/abracadabra-showcase.git
cd abracadabra-showcase
