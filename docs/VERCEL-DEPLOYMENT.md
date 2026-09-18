# Car Booking Details — Vercel migration

Updated 18 September 2026. This replaces the Sites deployment procedure for the current checkout. The existing Sites deployment and its records have not been changed. The requested application name is **Car Booking Details**; internal `fleet` API paths and stable record IDs remain compatible. The supplied MCCIA screenshot is displayed with a CSS frame; the original logo file is unmodified.

## Architecture

The owner selected **public viewing without sign-in**. This is the default when `FLEET_ACCESS_MODE` is unset or `public`. Anyone with the URL can read company records, employee/driver details, original register images, review evidence and CSV exports, including the historical preview. `/login` and `/logout` redirect to `/`; account endpoints are disabled. Public access never creates an administrator or permits edits, uploads, review decisions or integration/staff settings. Previously signed-in administrators also receive read-only access in this mode. Scheduled synchronization still requires its server secret.

To manage records, use a separately protected operator deployment with `FLEET_ACCESS_MODE=private`, or temporarily restore private mode. Configure its database/Blob connections intentionally; it must not be an untrusted PR preview. Private mode restores the existing invitation-based sign-in and role checks. Unknown nonempty mode values fail closed. Public mode does not require auth credentials, but records still require a configured database. No sample records replace a missing connection.

- React/Vinext + Nitro generates Vercel Build Output API v3 routes, static assets and a Node 24 server function. `/` is a server route, not a static `index.html`.
- Turso/libSQL provides durable SQLite-compatible records. The adapter preserves atomic batches and affected-row counts required by sync leases and correction conflict detection.
- In optional private mode, Better Auth provides password hashing, signed HttpOnly session cookies and database-backed rate limiting. Registration requires an email-bound, expiring, one-use invitation. The old Sites identity headers are ignored. Staff roles and active status are checked on every protected request.
- A **private** Vercel Blob store holds originals and extraction results. Uploads in private mode go directly from the browser to a scoped staging path; authenticated finalization validates size, file signature and SHA-256 before creating records. This supports 10 MB uploads without routing the file through Vercel's 4.5 MB request limit. The attachment route streams originals publicly in public mode and requires staff access in private mode. Storage tokens and direct object URLs are never exposed.
- Existing Zoho read-only synchronization, approval reconciliation, review history and Azure extraction logic are preserved. No actual provider connection is asserted by this migration.

Vinext and Nitro versions are prerelease and pinned. Validate releases in a separate preview environment before upgrading. See [Vinext's deployment documentation](https://github.com/cloudflare/vinext#other-platforms-via-nitro).

## Provisioning and secrets

Use the Vercel account with access to `mccias-projects/car-booking-records`. Keep production and preview credentials, databases and Blob stores separate. Do not point untrusted PR previews at production data.

1. Confirm the company's Vercel plan, region, spending limits and Turso account. No paid plan or storage service has been activated by this change.
2. Create/select a Turso database. Store `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` as server environment variables. Vercel rejects local file databases in the application adapter.
3. Create a **private** Blob store and attach its `BLOB_READ_WRITE_TOKEN` to this project. Keep the store private even for the public dashboard: the application controls which saved originals are served, and staging/extraction objects stay inaccessible. The current direct-upload implementation uses the token-based SDK; setting only `BLOB_STORE_ID` is insufficient for its upload authorization route.
4. Configure the following server-only variables. Never prefix secrets with `VITE_` or `NEXT_PUBLIC_`, paste them into a ticket, or add them to Git.

| Variable | Purpose |
| --- | --- |
| `FLEET_ACCESS_MODE` | `public` (default without sign-in) or `private` (staff accounts required) |
| `BETTER_AUTH_URL` | Private mode only: exact HTTPS origin of the operator deployment |
| `BETTER_AUTH_SECRET` | Private mode only: independently generated random secret, at least 32 characters |
| `FLEET_ADMIN_EMAIL` | Private mode only: verified initial administrator email |
| `FLEET_BOOTSTRAP_TOKEN` | Private mode initial setup only: independent random one-use activation code, at least 32 characters |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Database endpoint and private service credential |
| `BLOB_READ_WRITE_TOKEN` | Private store server credential |
| `CRON_SECRET` | Independent random scheduler secret; required before enabling cron |
| `EXTRACTION_ENABLED` | Keep `false` until the provider, page budget and document handling are authorized |

Zoho needs the existing `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_DC`, `ZOHO_OWNER` and `ZOHO_APP` variables. See ZOHO-TOKEN-SETUP.md; use the account's actual data centre and inspect report metadata before activating mappings. Azure needs `AZURE_DOCUMENT_ENDPOINT` and `AZURE_DOCUMENT_KEY` only if that provider is authorized. No real notifications are enabled.

## Build and release

Use Node **24.x**, repository root `.`, framework preset **Other**, build command `npm run build:vercel`. `vercel.json` supplies these build settings and the static output directory. Nitro generates `.vercel/output/config.json` and `functions/__server.func` with the catch-all server route. Do not deploy only `dist/client` or point the project at the old Cloudflare worker.

Run the following before release:

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run test:platform
npm.cmd run typecheck
npm.cmd run build:vercel
node scripts/check-vercel-build.mjs
```

Apply `npm run db:migrate` against the intended database **before** directing users to the release. The runner applies each SQL migration transactionally and records a normalized checksum. Re-running does not duplicate schema; changed applied migrations fail. It never seeds company or sample data. The Drizzle schema, journal and snapshot include the new auth and upload-intent tables. Generate future additive changes with `npm run db:generate`; never rewrite an applied migration.

Deploy from Git on Vercel so native packages are built for Linux. A locally generated Windows function is for verification, not for `vercel deploy --prebuilt`.

For an optional private operator deployment (`FLEET_ACCESS_MODE=private`), use `/login` → **I have an invitation** with the initial administrator email and bootstrap code, and enter your own password. Then remove `FLEET_BOOTSTRAP_TOKEN` from hosting secrets and redeploy. The database also prevents bootstrap reuse. In Settings → Staff access, save a role, create an invitation and share the displayed code privately. Codes expire after 24 hours; generating another invalidates older unused codes. No email is sent automatically. A failed registration can consume its code; issue another after correcting the failure. Account recovery currently requires an authorized database operator; self-service reset email is not configured.

The configured application origin is intentionally strict. Preview deployments need their own correct `BETTER_AUTH_URL` and isolated services. Do not broaden trusted origins to every Vercel domain.

## Existing records and cutover

This checkout does **not** contain a verified production D1/R2 export. A build or Git push does not transfer that data. Keep the original host available until a migration is verified.

1. Freeze writes on the old host for an agreed cutover window. Obtain a consistent, private database backup and an inventory/export of original and extraction objects from the hosting operator.
2. Retain all application IDs, foreign keys, original/corrected JSON, review history, sync generations and object keys. Do not import old login sessions or OAuth authorization states as valid new sessions.
3. Restore the two existing business-schema migrations and data to the new database, then apply the additive auth/platform migration. If restoring an already-created schema, reconcile the migration ledger against verified schema/checksums; do not blindly replay `CREATE TABLE` or mark unknown migrations applied.
4. Copy objects into private Blob storage under their recorded keys, verify original SHA-256 values and counts against `documents`, and check extraction objects against `extractionKey`. Never store register files under `public/`.
5. Compare table counts, stable IDs, latest sync generation, confirmed-trip/fuel totals, excluded records and several sampled source links. Verify anonymous access to records, images and exports on the public deployment. On a private operator deployment, obtain fresh invitations and test inactive and Viewer accounts.
6. Switch traffic only after these comparisons pass. Retain the source backup and old host for rollback; database changes are not undone by rolling back application code.

The historical supplied-file preview follows the selected access mode and stays separate from operational totals. It is not a replacement for a production data migration.

## Automatic sync and cleanup

`GET /api/cron` accepts only `Authorization: Bearer <CRON_SECRET>`. It cleans expired upload staging files and advances the existing durable sync. It does not send notifications. The same guard protects the compatible `POST /api/fleet/scheduled` endpoint.

No cron schedule is enabled in `vercel.json` yet: the account plan and Zoho allowance have not been verified. After approval, a five-minute cron tick can advance pagination, while the stored sync interval and daily budget control when imports start. Add a Vercel cron entry with path `/api/cron` and schedule `*/5 * * * *` only on a suitable plan; one cron tick advances one sync step, not necessarily the entire history. Confirm `schedulerLastSeen`, `schedulerLastCompleted`, run counts and a complete import. Until cron is enabled, an authorized operator must run this endpoint for staging cleanup; expired staging files can incur storage costs.

## Local work

Use an ignored `.env.local` with a dedicated `file:./work/local.db`. Public viewing is the default and needs no auth setup. To test staff operations, set `FLEET_ACCESS_MODE=private`, a localhost auth origin, test-only random auth/bootstrap secrets and a local owner email. Run `npm run db:migrate`, then `npm run dev`. No automatic development sign-in or production fixture bypass exists. Private upload integration still needs a separate test Blob store; UI and manual register workflows must not claim uploads/extraction work without it.

The old Wrangler fixture scripts are retained for historical reference and are not the Vercel preview workflow. Browser verification of the new branding and deployed storage/auth must still be completed when Chrome access is restored.
