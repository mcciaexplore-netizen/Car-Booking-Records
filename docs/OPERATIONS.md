# Fleet Desk — operations and connection setup

The existing Fleet Desk design is retained. The new route reads durable server data. The previous prototype's samples are not imported or displayed. No company account or document-extraction account has been connected during development.

## Authentication and access

Fleet Desk runs outside Zoho on the existing private Sites project. Sites performs ChatGPT sign-in and supplies authenticated identity headers. The application checks an active staff membership and role on **every** records, image, export and mutation endpoint. It does not trust a role sent by the browser.

The existing site's sole owner email is configured as `FLEET_ADMIN_EMAIL` to bootstrap the first administrator. This bootstrap is restricted to that exact authenticated email; it is not first-visitor access. Administrators subsequently grant, update or disable staff in Settings. Sharing access to the private Site and granting a Fleet Desk role are both required. No staff invitations or notifications were sent.

| Role | Read records, private images and CSV | Upload/correct/confirm registers | Permission decisions | Connections and staff |
|---|---|---|---|---|
| Administrator | Yes | Yes | Yes | Yes |
| Manager | Yes | Yes | Yes | No |
| Register operator | Yes | Yes | No | No |
| Viewer | Yes | No | No | No |

These are company-wide roles. Department-scoped access is not configured. All same-origin write requests also require an exact Origin match. CSV cells are escaped against spreadsheet formula injection. Browser responses containing records have `private, no-store` caching. Uploads are held in private R2 objects and only streamed through authenticated routes, including after export.

The identity headers are trusted **only behind the Sites dispatcher**. Do not expose the worker directly on an unprotected hostname: a different hosting target needs an authenticated identity proxy or an OIDC adapter that validates tokens. Tests substitute identity only inside a separate test bundle; there is no development-login bypass in the production application.

## Read-only Zoho OAuth setup

1. Obtain the actual Creator app URL, owner link name, app link name, account data centre, plan, purchased users, and the account's remaining API allowance. Confirm that the consenting account can read the complete relevant reports and history.
2. Register a server-based OAuth client in the account's regional Zoho API console. Use Zoho's authorization-code flow (or its Self Client flow for an internal single-account integration) to obtain a refresh token. Exchange codes only in a secure server/admin environment. Never put tokens in a browser URL, browser code, Git, logs, screenshots or this dashboard's JSON settings.
3. Request only `ZohoCreator.report.READ`, `ZohoCreator.meta.application.READ` and `ZohoCreator.meta.form.READ`. No booking, approval, form-create, record-update or record-delete scopes are used. Do not add write-back scopes without explicit authorization.
4. Add the following production runtime values through the hosting secret manager; a deployment applies them:

| Runtime key | Secret? | Meaning |
|---|---|---|
| `ZOHO_CLIENT_ID` | Yes | Registered OAuth client |
| `ZOHO_CLIENT_SECRET` | Yes | Client secret |
| `ZOHO_REFRESH_TOKEN` | Yes | Regional-account refresh token |
| `ZOHO_DC` | No | One of `IN`, `US`, `EU`, `AU`, `JP`, `CA`, `SA`, `CN`, `UAE`; do not assume IN from the display timezone |
| `ZOHO_OWNER` | No | Actual owner link name |
| `ZOHO_APP` | No | Actual application link name |

Access tokens are refreshed on the server and retained only for the request. OAuth responses are never logged. The returned `api_domain` is checked against the configured regional allowlist. Refresh tokens stay in hosting secrets and are never saved to the application database.

5. In Settings, edit `syncConfig`. Keep `mappings: []`, set `dailyApiBudget` from verified available account allowance, select an interval of at least 15 minutes, and set `allowanceVerified: true`. Fleet Desk's local daily counter resets at UTC midnight; leave room for other Creator integrations and the account's own reset window. The Zoho limit is still authoritative.
6. Select **Discover reports**, then **Inspect fields** for each actual form from the metadata. Only after reading that evidence, create the mappings described in DATA-MODEL.md. Reports that do not exist stay unmapped. Inspect a representative real source record to verify nested lookups, timestamp formats, approval events and passenger semantics.
7. Run **Import history**. It uses `max_records=1000` and the returned `record_cursor` response header. Completion activates the whole staged snapshot atomically. The initial historical scope is the entire selected report unless an explicit, reviewed `criteria` is supplied.
8. Check record counts against Creator, update one authorized test record in Creator, synchronize, and verify the same stable ID updates. Test a deletion or report removal with an account administrator. Fleet Desk never deletes a Zoho record.

Official references: [OAuth scopes and data centres](https://www.zoho.com/creator/help/api/v2.1/oauth-overview.html), [Get Records and pagination](https://www.zoho.com/creator/help/api/v2.1/get-records.html), [report metadata](https://www.zoho.com/creator/help/api/v2.1/get-reports.html), [form field metadata](https://www.zoho.com/creator/help/api/v2.1/get-fields.html).

## Synchronization and scheduling

Each import has a durable run, cursor, report index, lease, attempt count and retry time. One active run is enforced by a database constraint. HTTP 429, transient server/network errors and daily budget exhaustion defer work with bounded exponential backoff. Staged rows are idempotent. A failed import does not replace the active generation, and the UI displays the prior successful timestamp. Stale means the last successful import is older than twice the configured interval.

Full imports reconcile changes and records absent from the selected report; previous generations retain their raw evidence. Absence can mean deletion, access change or report filtering, and must not be represented as proof of deletion. Incremental mode is optional and requires an inspected modified-time field for every selected report plus a verified Creator criteria format. It copies the active generation and imports changes with a five-minute overlap. A daily full import is still needed for absence/deletion reconciliation.

Manual synchronization advances page-by-page while the browser stays open. Durable state permits continuation after closing it. If a run is retrying, the next permitted step waits until its retry time.

Automatic scheduling is **not yet activated**. `scripts/scheduler-worker.ts` and its five-minute cron configuration are supplied for a hosting account that can attach a private `FLEET_SERVICE` service binding to the dashboard Worker. Configure the same strong `SCHEDULER_SECRET` on both workers. Each tick advances one page; the dashboard enforces the configured sync interval and API budget. For a three-report import with one page per report, a five-minute tick can take about 20 minutes including activation. The tick cadence and expected completion time must be planned with the actual report volume.

The existing private Sites sign-in gateway cannot be bypassed by a generic unauthenticated cron HTTP request. A supported private scheduler binding or platform scheduling capability must be provisioned and verified before claiming unattended sync. Do not publish the company dashboard publicly to make a scheduler work. No cron service was purchased or deployed in this build.

## Register uploads and extraction

Operators can immediately upload multiple JPEG, PNG or PDF files, one at a time per request, up to 10 MB each. The server checks type, file signature and size, hashes the original with SHA-256, and reuses existing byte-identical documents. Different photos of the same page may have different hashes; trip reconciliation and reviewer duplicate decisions handle those cases. Originals are never public URLs.

Manual workflow: choose the document type, upload, enter the actual source page and row numbers, select **Add row**, and transcribe beside the original. Blank fields remain null. Date/time input uses explicit dates and IST. Do not silently invent AM/PM or an overnight return. Save corrections as drafts or confirm a row. Reopening a confirmed row removes it from confirmed metrics until reconfirmation. Original extraction and every corrected version are retained.

### Proposed extraction provider

Azure Document Intelligence Layout (`prebuilt-layout`, API `2024-11-30`) is implemented as a disabled adapter. It receives the original document bytes, including any names, handwriting, signatures and other visible content, in the configured Azure region. It returns text, tables, page coordinates and confidence. The adapter does not identify people from handwriting or signatures.

Required setup: an Azure subscription, Document Intelligence resource/region, key, reviewed data-handling terms, verified regional price, and billing alerts. Store `AZURE_DOCUMENT_ENDPOINT` and `AZURE_DOCUMENT_KEY` as server secrets. Set `EXTRACTION_ENABLED=true` only after that setup is authorized. No pages have been sent to Azure in this build.

Configure `extractionBudget` with `monthlyPages` and `maxPagesPerDocument` (1–30). Each submission reserves its maximum page range before sending, including failed/uncertain submissions, to prevent uncontrolled costs. Pages beyond that range require a separate upload. Provider free-tier page limits can truncate analysis; use an appropriate tier and compare source page counts during pilot verification. Azure's documented F0 cap processes only the first two PDF/TIFF pages and caps input at 4 MB; Fleet Desk's 10 MB upload cap does not override the provider's limit.

`registerColumns` maps **observed, exact printed table headers** to Fleet Desk field keys. Unknown columns are retained as raw cells. Unmapped fields remain null. Raw date/time handwriting requires explicit reviewer interpretation. Illegible numbers, low-confidence handwriting and missing source coordinates are flagged. Non-tabular documents fall back to page drafts with OCR lines for human transcription. Layout extraction quality on your registers is not yet verified; a custom layout/model may be needed for merged cells, repeated headers, vertical handwriting, Marathi/Hindi text or irregular receipts.

The upload view polls pending extraction jobs while open. Submission timeouts are marked uncertain and are not automatically resubmitted; check Azure's request history before retrying to avoid duplicate charges.

Provider references: [Layout features and input limits](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout?view=doc-intel-4.0.0), [regional pricing](https://azure.microsoft.com/en-us/pricing/details/document-intelligence/).

## Reviews and notifications

Managers can confirm a candidate booking link, leave a trip unresolved, confirm unauthorized use after review, accept a documented exception, or link a duplicate actual trip. A reason is mandatory. A booking link is not proof of permission: the deterministic rules are applied afterward. A later approval or exception never becomes prior approval. Changed evidence invalidates a prior override for current metrics while retaining the original decision and reason in history.

Alerts are an internal deduplicated attention queue. Categories can be enabled or disabled in `notificationRules`. No delivery adapter or recipients are active. External delivery remains forcibly disabled until recipients, channel, credentials and authorization are implemented together.

## Retention and recovery

Original documents are retained until an administrator agrees a retention policy. Set `retention.originalDays` (minimum 30, or null). An administrator can POST a documented reason to `/api/fleet/purge/{documentId}` for an expired, fully reviewed upload. This removes private original/extraction objects, retains the SHA-256 tombstone and audit evidence, and cannot delete a document with unconfirmed rows. Purge is manual, not scheduled. Retention exceptions/legal holds and deletion of employee identifiers in historical audit records need a company policy before production use.

D1 and R2 are the durable stores. Back up both with the hosting administrator before migrations or company rollout; a restore drill is still required. Historical snapshots and audit rows intentionally accumulate and must be included in the storage budget. Large histories currently load into server memory for filtering, reconciliation and CSV export; load-test your selected retention range before company rollout. This implementation is intended for the requested small fleet, and no unlimited-record performance claim is made.
