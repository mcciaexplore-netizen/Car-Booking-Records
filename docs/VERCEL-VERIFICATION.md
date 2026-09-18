# Car Booking Details — migration verification

18 September 2026. The public Vercel deployment and connected Turso database are now verified. No Zoho import, document extraction or file-storage connection is claimed.

| Check | Result |
| --- | --- |
| Acceptance suite, staged uploads and public-access cases | 42 passed |
| Auth/database/platform, migration runner and production build initialization checks | 16 passed |
| Live production deployment | Ready: `8b06c10`; `https://car-booking-records.vercel.app/` |
| Live database read without cookies | HTTP 200; Viewer access, fixture mode false, zero stored operational records |
| Live public dashboard | Loads without sign-in or database errors; correctly shows No records imported and Zoho setup incomplete |
| TypeScript | Passed |
| Vercel production build | Passed; Build Output API v3 with Node 24 server route |
| Generated server `/` | 200; public dashboard with no sign-in/out links |
| Generated server `/login` and `/logout` | 307 redirect to `/` in public mode |
| Generated historical page and CSV | 200 without a session in public mode; historical records stay separate from operational totals |
| Generated server records and original attachment with no database configured | 503 with explicit database setup error, not a login prompt |
| Generated settings and account endpoints in public mode | 403 and 404 respectively |
| Generated records, original attachment and CSV in private mode without a session | 401 |
| Unknown generated-server page | 404 |
| Vercel function size on Windows | Approximately 100.6 MiB, below standard 250 MB limit; Vercel must rebuild on Linux |
| Static output inspection | No application auth/database server modules or historical-record payload; setting names in admin help/shared SDK are expected |
| Logo provenance | Public image SHA-256 matches the user-supplied MCCIA screenshot; no alteration of the logo image |

Tests use isolated SQLite/libSQL databases, synthetic identities and mocked document storage. New checks verify anonymous stored-record/detail/history/image/export reads, filter and metric consistency, no synthetic staff creation, blocked mutations even with an existing administrator identity, disabled auth/upload endpoints, restricted administrative history, missing-database errors and private-mode fallback. They verify real Better Auth password hashing/session validation, forged-header rejection, invitation binding/expiry/single-use, disabled-account authorization, origin validation, persistent rate limits, logout revocation, atomic database rollback and affected-row counts. Database setup is repeated with existing data, and changed applied checksums are rejected.

An 8 MB synthetic PDF passes the staged-upload/finalization path, retains one document after repeated finalization and duplicate content, and creates no confirmed trip automatically. Other tests reject ownership/signature mismatches and confirm cleanup leaves originals intact. This verifies application logic, **not actual Blob networking, credentials, deployment streaming or provider billing**.

## Outstanding checks and release gates

- Chrome access is restored. The MCCIA Vercel project and public deployment were inspected. A `car-booking-details` Turso Starter database is now connected and its two required server environment variable names were verified without revealing values. The production release completed its versioned migrations and an independent HTTP request without cookies returned a valid database snapshot. The refreshed public page displayed No records imported, with no database error. Private Blob remains unconfigured.
- The new production-build checks stop releases with missing database credentials or failed migrations, and do not migrate during preview builds. Production anonymous reads passed. Private Blob still needs configuration and end-to-end verification. Administrator activation and role checks apply only to an optional private operator deployment. Public mode requires no account setup.
- Read-only checks of the original Sites database found `source_records`, `actual_trips`, `documents`, `fuel_purchases` and `sync_runs` empty. No operational records were transferred or synthesized. Historical supplied-file preview records remain separate from operational totals.
- Zoho credentials, actual report mappings, selected history, API allowance and unattended cron remain unconnected/unverified. Azure extraction remains disabled/unverified; notification delivery remains disabled.
- Strict lint remains an existing release gate, documented separately in LINT-STATUS.md. Passing build/type checks do not imply lint passes.
- Dependency audit after removing obsolete Cloudflare hosting packages reports **4 moderate** findings in the Drizzle Kit / esbuild-kit / older nested esbuild chain, including with `--omit=dev`. No force downgrade was applied. Review/update the schema tooling before a production release; do not expose its development server. No high or critical findings were reported in that final audit.
- The build emits framework warnings about dynamic imports, duplicate identical CSS emission and optional packages that its tracer cannot find. The generated-server smoke checks and Vercel/Linux deployment passed. Private operator sign-in and file-storage browser checks remain outstanding. Vinext/Nitro prerelease versions are pinned.

Use [VERCEL-DEPLOYMENT.md](VERCEL-DEPLOYMENT.md) for setup and cutover and [VERCEL-COSTS.md](VERCEL-COSTS.md) for account-dependent cost checks. The previous Sites-specific verification remains historical evidence, not verification of this deployment.
