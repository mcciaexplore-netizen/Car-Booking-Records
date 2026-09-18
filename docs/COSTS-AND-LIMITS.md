# Recurring services and limits — checked 8 September 2026

Account-specific costs, credits and eligibility are **not verified**. Do not assume the integration, hosting or extraction will be free. Public Cloudflare list prices below describe a direct Cloudflare account and are **not** a quotation for OpenAI Sites hosting.

| Service | Published basis / limit | What remains to verify |
|---|---|---|
| Zoho Creator | Standard developer API: Free 250/day; Standard 250/user/day; Professional 500/user/day; Enterprise and Zoho One 1,000/user/day. Other integrations also consume allowance. | Account edition, purchased users, API access, report access, other consumption, reset window, paid extra allowance and actual subscription invoice. |
| OpenAI Sites | This implementation uses a Worker, D1 database and R2 uploads; hosted Worker memory is 128 MB per isolate. | Account hosting/storage entitlements, recurring charges, export volume, private service scheduling availability and sharing rules. No free-service promise. |
| Direct Cloudflare Workers alternative | Paid plan has a $5/month subscription baseline; usage charges depend on requests and CPU. | Account eligibility, actual CPU, traffic, identity gateway costs and scheduler deployment. |
| D1 direct list price | Paid storage: first 5 GB included, then $0.75/GB-month; rows read/written have separate allowances and charges. | Number and size of retained source snapshots, query scans, backups and actual hosting billing. |
| R2 Standard direct list price | $0.015/GB-month, $4.50/million Class A operations, $0.36/million Class B; published included allowance is 10 GB-month, 1 million A and 10 million B operations monthly. | Whether these allowances apply to the hosting account; original sizes, extracted JSON, retention and backup copies. |
| Azure Document Intelligence Layout | Billed by analyzed page and selected regional tier/model. Official public page renders prices dynamically; a reliable account-specific numerical Layout quote was not available. | Region, tier, quoted per-1,000-page rate, currency, tax, spending cap and data processing terms. |
| Notifications | No delivery service active. | Authorized recipients/channel and provider price before implementation. |

References: [Zoho API limits](https://www.zoho.com/creator/help/api/v2.1/api-limits.html), [Creator pricing](https://www.zoho.com/creator/pricing-comparison.html), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [Azure regional pricing](https://azure.microsoft.com/en-us/pricing/details/document-intelligence/).

Planning formulas:

- Zoho daily report calls ≈ completed runs/day × total pages across selected reports, plus metadata inspection, retries and full-reconciliation calls. 3 one-page reports hourly require at least 72 report calls/day; 15-minute runs require at least 288. These are illustrative workload calculations, not company data.
- Original storage ≈ documents/month × average MB × retained months / 1,024, plus extraction JSON, historical backups and object operations. For planning only, 300 documents/month × 3 MB × 12 months is approximately 10.55 GB before overhead.
- OCR monthly charge ≈ analyzed pages/month × the **verified regional Layout price per 1,000 pages** / 1,000, plus any selected features/tax. At 300 pages this is 0.3 times the quoted per-1,000-page rate. No paid analysis was executed during development.

Fleet Desk caps each upload at 10 MB, each automatic extraction at 30 configured pages or fewer, and uses a configured monthly page reservation budget. Azure's F0 limits are narrower: 4 MB input and only the first two PDF/TIFF pages. Do not mistake successful partial extraction for completion. Operator confirmation must account for every source page; larger registers can be split into explicit page-range files. [Azure input requirements](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/layout?view=doc-intel-4.0.0)

Historical source snapshots and append-only review history grow over time. Final hosting sizing and performance need actual row counts, upload volume, agreed retention and a load test. Authentication/sharing on an alternative host also needs explicit planning; the current Sites identity headers are not safe to trust on an exposed standalone Worker.

## Frontend change cost impact — 18 September 2026

This upgrade introduces **no new paid provider or runtime package** and did not activate document analysis, notifications or a scheduler. The public price references above retain their 8 September verification date; they were not freshly repriced during this frontend task. Account costs and entitlements remain unverified.

Bounded responses and on-demand original/record detail reduce browser payloads, but the server still evaluates the active evidence generation for reconciliation and filtered aggregates. The open, visible dashboard refreshes its local stored-data snapshot about once per minute; extraction status polling is limited to the relevant visible workflow. Those are hosting requests, not automatic Zoho API calls. Additional tabs/users and private thumbnail reads can increase Worker/D1/R2 usage. Retained source generations and review history continue to grow.

Before rollout measure row counts, concurrent users, original/page volume, retention and per-request CPU/database reads, then confirm actual Sites/Zoho/Azure charges and limits. No claim of free operation is made.
