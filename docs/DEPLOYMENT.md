# Deployment and rollback

The checkout is bound to the existing private Company Car Register / Fleet Desk project in `.openai/hosting.json`. Reuse that project ID and preserve its private audience.

1. Review the version and account hosting/storage charges. Confirm publication to the existing private audience.
2. Keep `FLEET_ADMIN_EMAIL` set to the verified owner in hosting settings. That non-secret value is configured, along with `EXTRACTION_ENABLED=false`; no Zoho or Azure credentials have been installed.
3. Use Node 24 and run `npm ci`, `npm test`, `npm run typecheck`, then `npm run build`. Build output contains `dist/server/index.js` and client assets. Tests never seed production.
4. Commit and push the exact tested source to the existing Sites source repository with a temporary per-command credential. Never put credentials in a remote URL or file.
5. Package the validated build with the Sites helper, including `.openai/hosting.json` and the generated `drizzle` SQL and metadata. On Windows, the same `prepare-site-build.cjs` core can be run with a verified workspace staging path and native tar. Do not archive source, local environment files or secrets.
6. Save a version using the exact pushed commit SHA and validated archive. Publish the existing Site only when deployment is requested. Use private deployment for its owner-only access; do not widen sharing.
7. Check that deployment reaches `succeeded`. Migrations execute before Worker upload, so a failed deploy may still have applied migrations. Never rewrite an applied migration.
8. Sign in as owner and confirm empty/unknown real-data states, Settings, private attachments and staff roles. Company rollout still requires the real-account checks in OPERATIONS.md and VERIFICATION.md.

## Local review

The development server binds to localhost. The Sites plugin prints its local test identity. The ignored `.dev.vars` sets that local identity as administrator and leaves extraction disabled. It is a local development identity, not real company authentication.

For a fresh local database, apply generated SQL migrations once with Wrangler against `DB`, `--local`, `--config dist/server/wrangler.json`, and `--persist-to .wrangler/state`. Keep Wrangler logs inside the project or disable log writing. Do not rerun CREATE TABLE migrations on an already initialized emulator. Local D1/R2 state stays in ignored `.wrangler/`.

## Unattended scheduling

The supplied scheduler Worker and five-minute cron configuration require a private `FLEET_SERVICE` service binding and matching `SCHEDULER_SECRET` values. A tick advances a durable import and the dashboard enforces its configured sync interval and API budget. Daily full reconciliation is retained for deleted/absent source records.

The current private Sites gateway does not allow a generic unauthenticated cron HTTP request. A supported private binding or platform scheduler must be provisioned and verified with the hosting operator. **Unattended scheduling is not deployed or verified.** Do not publish company records publicly to make scheduling work.

On a company-owned Cloudflare account, provision actual D1/R2 resources, migrate the schema, configure a validated authentication proxy, secret storage and private service bindings, then schedule. Do not trust `oai-authenticated-user-*` headers outside the Sites dispatcher. Migrating hosts requires reviewing identity and storage topology.

## Recovery

Back up both database and originals before migrations. Roll back to a compatible saved application version when required; this does not undo schema changes. Forward-fix applied migrations. Restore D1 and R2 together to preserve links. Company backup/restore testing and retention approval remain outstanding.

Monitor sync errors, API counters, uncertain extraction submissions, pending reviews and historical storage growth. No external notification provider is active.

## Frontend upgrade deployment notes — 18 September 2026

The current source was built locally and has not been published. Review UX-IMPLEMENTATION.md and the failed strict-lint gate before a release decision. The frontend adds no runtime dependency and no new SQL migration. Additive settings use the existing settings table; document evidence uses the existing original JSON column. Existing D1/R2 data must be preserved.

The Sites `build-site.mjs` helper was attempted on Windows and failed while resolving an npm executable under the workspace's `node_modules/npm/bin`. The project command `npm.cmd run build` successfully built the same application. This is a local helper limitation; a passing build is not a saved/published Site version. Packaging, source push, private publication and deployed smoke checks still require the existing documented release flow and an explicit publication request.

### Reproduce the isolated populated UI checks

Use a separate development terminal. These commands do not seed the normal local workspace or production:

```powershell
npm.cmd test
node scripts/seed-ux-fixtures.mjs
$env:FLEET_UX_FIXTURES='1'
npm.cmd run dev -- --host 127.0.0.1 --port 3000
```

The fixture seed preserves an existing fixture database rather than overwriting it. It stores clearly synthetic records in `.wrangler/ux-fixtures/v3`, separate from `.wrangler/state`. Fixture mode is restricted to development serving. Its runtime exposes only isolated database/object bindings and the local test administrator, omitting integration secrets; do not repurpose this mechanism for production authentication. Fixture pictures explicitly say TEST FIXTURE, NOT LIVE COMPANY DATA.

For failure/recovery checks, `node scripts/ux-fixture-scenario.mjs failure`, `recover`, `denied` or `allow` changes only the synthetic namespace after verifying its marker. Always restore `recover` and `allow`. Do not run analogous mutations against real company data or staff.

Stop the fixture server, then run `Remove-Item Env:FLEET_UX_FIXTURES` in that same terminal and start the normal preview. This removes the process environment flag only; it does not delete data. Unset is the normal default. No fixture seeding script runs in a production build.

### Release gates still required

Resolve lint; perform the remaining keyboard/assistive-technology/PDF checks; verify real OAuth, inspected mappings, import counts and account budgets; verify authorized production roles/images/exports; configure/test the supported private scheduler; validate extraction against approved real documents; and confirm billing/retention/backup/scale. Then request publication of this concrete version to the existing private audience.
