# Public Data Workbench

Public Data Workbench is a responsive research-data application for finding, comparing, retrieving, reconciling, transforming and exporting public statistical series while keeping provenance visible.

## Stack

- Next.js App Router
- React + TypeScript
- No UI component framework
- Server-side provider proxy with an allow-listed registry
- Responsive layouts for desktop, tablet and mobile

## Product areas

- **Discover** — search the local series catalogue, inspect definitions and add/remove series from a persistent Data Cart.
- **Sources** — provider registry plus a controlled API console for verified upstream API bases.
- **Resolver** — compare coverage and overlapping observations before combining incomplete series.
- **Workspace** — retrieve selected live series, merge by year, chart, transform and export.
- **Exports** — CSV data and JSON metadata with source codes, retrieval dates and source URLs where available.

## Provider registry

The application registers World Bank, IMF, ILO, OECD, Eurostat, UNICEF, UNESCO UIS, UNDP, FAO, WTO, UN Comtrade, UN SDG, UNHCR, UN Population Division, ADB, AfDB, BIS, ECB, FRED, EIA and UNCTAD.

The registry deliberately distinguishes:

1. **Live public APIs** with verified public base endpoints.
2. **Keyed APIs** that require credentials configured on the server.
3. **Portal/bulk integrations** where the application does not claim a live endpoint unless a verified public base URL is available.

### Normalized series adapters

The current common time-series response format is implemented for:

- World Bank Indicators API
- IMF DataMapper API
- FRED when a server-side key is configured

Other verified providers remain accessible through the provider API console while provider-specific normalization is added.

## Environment variables

Copy `.env.example` to `.env.local` when running locally.

```text
FRED_API_KEY=
EIA_API_KEY=
WTO_API_KEY=
COMTRADE_API_KEY=
UN_POPULATION_TOKEN=
```

Never place keys in client-side code.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Production build

```bash
npm run build
npm start
```

## API routes

- `GET /api/catalog?q=inflation`
- `GET /api/providers`
- `GET /api/data?provider=world-bank&indicator=FP.CPI.TOTL.ZG&country=NGA&start=1990&end=2025`
- `GET /api/data?provider=imf&indicator=PCPIPCH&country=NGA&start=1990&end=2025`
- `GET /api/provider/{provider}?path={relative-upstream-path}`

The provider proxy rejects arbitrary hosts and path traversal, caps large responses, applies keys only on the server, and uses only hosts configured in `lib/providers.ts`.

## Data integrity

The resolver never silently combines series. A researcher must select the construction. Numeric overlap is shown as evidence, not treated as proof that two methodologies are identical.

## Deployment

### Vercel

This repository is ready to import as a Next.js project in Vercel.

1. In Vercel, choose **Add New → Project**.
2. Import **Oshione2002/Public-Data-Workbench** from GitHub.
3. Keep the detected framework as **Next.js** and the root directory as the repository root.
4. Add any API credentials you want to enable under **Project Settings → Environment Variables**:
   - `FRED_API_KEY`
   - `EIA_API_KEY`
   - `WTO_API_KEY`
   - `COMTRADE_API_KEY`
   - `UN_POPULATION_TOKEN`
5. Deploy.

Public adapters such as World Bank and IMF work without secret keys. Keyed providers remain unavailable until their server-side environment variables are configured.

The application requires server-side route handlers, so GitHub Pages is not a suitable production host.
