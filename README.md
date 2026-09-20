# Public Data Workbench

A research-data discovery and preparation interface for finding, comparing, reconciling and exporting public statistical series from major international data providers.

## Current build

This repository contains the working front-end product flow:

- **Discover** — search results, source/frequency filters, details inspector and a reversible Data Cart.
- **Sources** — directory of major public-data providers and their official API/documentation pages.
- **Resolver** — compare incomplete or overlapping series before constructing a composite.
- **Workspace** — inspect data, metadata and transformations while preserving provenance.

Selections in the Data Cart are stored locally in the browser and can be added or removed from both search results and the cart.

## Run locally

No build step is required. Open `index.html` directly, or serve the folder with any static web server.

Example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Architecture direction

The production backend is intended to use reusable connector families rather than a separate implementation for every provider:

- SDMX connectors: IMF, ILO, OECD, Eurostat, BIS, ECB and others.
- REST/OData connectors: World Bank, WTO, UN Comtrade, UNDP, FRED, EIA and others.
- Bulk-file connectors: providers where CSV/ZIP distribution is the supported integration route.

The resolver must never silently combine series. Compatibility, coverage, methodology and provenance remain visible to the researcher.

## Important

The values displayed in the current workspace are illustrative interface data, not live API responses. Provider API integrations should be added server-side where credentials or cross-origin restrictions apply.
