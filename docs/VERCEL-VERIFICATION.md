# Car Booking Details — migration verification

18 September 2026. Local verification only; **not a successful production deployment**.

| Check | Result |
| --- | --- |
| Existing acceptance suite plus staged-upload cases | 38 passed |
| New auth/database/platform suite and migration-runner test | 10 passed |
| TypeScript | Passed |
| Vercel production build | Passed; Build Output API v3 with Node 24 server route |
| Generated server `/` and `/login` | 200; renamed app and MCCIA image reference present |
| Generated server records, original attachment and historical CSV without a session | 401, including requests carrying forged old Sites identity headers |
| Unknown generated-server page | 404 |
| Vercel function size on Windows | Approximately 100.6 MiB, below standard 250 MB limit; Vercel must rebuild on Linux |
| Static output inspection | No application auth/database server modules or historical-record payload; setting names in admin help/shared SDK are expected |
| Logo provenance | Public image SHA-256 matches the user-supplied MCCIA screenshot; no alteration of the logo image |

Tests use isolated SQLite/libSQL databases, synthetic identities and mocked document storage. They verify real Better Auth password hashing/session validation, forged-header rejection, invitation binding/expiry/single-use, disabled-account authorization, origin validation, persistent rate limits, logout revocation, atomic database rollback and affected-row counts. Database setup is repeated with existing data, and changed applied checksums are rejected.

An 8 MB synthetic PDF passes the staged-upload/finalization path, retains one document after repeated finalization and duplicate content, and creates no confirmed trip automatically. Other tests reject ownership/signature mismatches and confirm cleanup leaves originals intact. This verifies application logic, **not actual Blob networking, credentials, deployment streaming or provider billing**.

## Outstanding checks and release gates

- Browser automation could not connect to Chrome. The Vercel team/project, production settings and final mobile/desktop appearance have not been inspected through that session. The earlier in-app Vercel account lacked project access. No Vercel settings, subscription, audience or deployment were changed.
- Turso and private Blob resources/secrets, administrator activation and production role checks still need provisioning/verification.
- Existing production D1/R2 records and files have not been exported, migrated or reconciled. Preserve the old host and verify counts, IDs, checksums and links before cutover.
- Zoho credentials, actual report mappings, selected history, API allowance and unattended cron remain unconnected/unverified. Azure extraction remains disabled/unverified; notification delivery remains disabled.
- Strict lint remains an existing release gate, documented separately in LINT-STATUS.md. Passing build/type checks do not imply lint passes.
- Dependency audit after removing obsolete Cloudflare hosting packages reports **4 moderate** findings in the Drizzle Kit / esbuild-kit / older nested esbuild chain, including with `--omit=dev`. No force downgrade was applied. Review/update the schema tooling before a production release; do not expose its development server. No high or critical findings were reported in that final audit.
- The build emits framework warnings about dynamic imports, duplicate identical CSS emission and optional packages that its tracer cannot find. The generated-server smoke checks pass; Vercel/Linux deployment and authenticated browser checks remain required. Vinext/Nitro prerelease versions are pinned.

Use [VERCEL-DEPLOYMENT.md](VERCEL-DEPLOYMENT.md) for setup and cutover and [VERCEL-COSTS.md](VERCEL-COSTS.md) for account-dependent cost checks. The previous Sites-specific verification remains historical evidence, not verification of this deployment.
