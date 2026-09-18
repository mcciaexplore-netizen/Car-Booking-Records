python "C:\Users\Aarushi Gupta\Documents\ChatGPT\MCCIA Car ussage\scripts\zoho_token_exchange.py" --dc IN# Fleet Desk

External company vehicle dashboard upgraded from the existing Fleet Desk prototype. Preserves its visual system, navigation, vehicle panels and register workflows while replacing sample state with authenticated D1/R2 storage.

Includes server-enforced roles, read-only regional Zoho OAuth and metadata discovery, paginated and incremental sync, private uploads, duplicate detection, source review, conservative reconciliation, nine KPIs, filtered registers, CSV exports and internal alerts.

**No live Zoho data, sample fleet records or real OCR results are displayed.** OAuth account access, actual field mappings, register samples, OCR credentials and unattended scheduling still need setup and verification. Zoho write-back and external notifications are disabled.

- [Connection, access and review guide](docs/OPERATIONS.md)
- [Secure first-time Python token exchange](docs/ZOHO-TOKEN-SETUP.md)
- [Data model, mappings, reconciliation and metrics](docs/DATA-MODEL.md)
- [Deployment and rollback](docs/DEPLOYMENT.md)
- [Recurring costs and limits](docs/COSTS-AND-LIMITS.md)
- [Verification and outstanding inputs](docs/VERIFICATION.md)
- [Frontend implementation, all 48 audit items and screenshots](docs/UX-IMPLEMENTATION.md)

Use Node 24. Run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`. Start the local preview with `npm run dev`. Generate schema migrations with `npm run db:generate`.

The application page is `app/fleet-dashboard.tsx`; server endpoints are in `app/api/fleet/[...path]/route.ts`. The old prototype modules are not imported by the current page. Tests use isolated fixtures and an in-memory SQLite adapter, never company data. Local emulator state and `.dev.vars` are ignored by Git; production secrets belong in the hosting secret manager.

The newer supplied-file reconciliation preview is preserved at /source-preview behind authentication; its historical rows are not included in confirmed operational totals. The original fictitious workflow remains explicitly separated at /demo.
