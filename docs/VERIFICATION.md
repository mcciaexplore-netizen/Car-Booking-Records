# Verification and outstanding inputs

Verified locally on 8 September 2026. Fixtures are generated only inside isolated tests. No company records were created, synchronized or sent to an OCR provider.

## Automated acceptance suite

`npm test` runs production domain, persistence, document, sync and API-handler code against SQLite in memory, an R2 test adapter, simulated authenticated headers and mocked Zoho HTTP responses. It checks:

1. Required identity, vehicle, capacity and time evidence for prior approval.
2. Late/equal-time approval and rejection/cancellation before departure.
3. Missing approval as a review item; unconfirmed rows never unauthorized.
4. Fuzzy names and reference-free candidates as suggestions only.
5. Explicit overnight dates and ambiguous-time null handling.
6. Missing/invalid odometer exclusion and unknown distance.
7. Cross-source trip deduplication with source linkage and conflict rejection.
8. Idempotent duplicate uploads and file-signature checks.
9. Illegible OCR numbers and dates flagged rather than guessed.
10. Correction history, reviewer identity and metric recalculation.
11. Reopened extraction excluded until reconfirmed.
12. Mandatory review reasons, current evidence hashes and invalidated stale overrides.
13. Unauthenticated/ungranted users blocked from records, images and exports.
14. Viewer writes blocked and cross-origin requests rejected.
15. Identical filtering for dashboard/CSV plus formula escaping.
16. Complete 1,002-record pagination, repeated sync, updates and absent/deleted records.
17. Failed sync retaining prior data with visible retry/backoff state.
18. API budget enforcement and absence of secret values in snapshot output.
19. Invalid calendar dates rejected rather than normalized.
20. Concurrent sync starts sharing one durable active run.
21. Uninspected mappings blocked.
22. Accepted exceptions preserving original evidence and staying outside matched counts.
23. Deduplicated alerts with no external delivery.
24. Incremental import preserving unchanged rows and using an overlap criterion.

All 24 checks passed. TypeScript validation and the production build passed. A local HTTP smoke check through the Sites development sign-in returned an Administrator snapshot with **0 trips, 0 documents, Zoho disconnected**. This confirms an empty real-data workspace rather than seeded samples.

Production dependency audit (`npm audit --omit=dev`) reported **0 vulnerabilities** after updating the inherited React/framework packages. Development-tool advisories remain in the broader dependency tree; the preview binds to localhost. There was no independent penetration test. Browser visual/interaction testing on physical mobile devices was not performed.

## Not yet connected or verified

| Item | Exact input or remaining check |
|---|---|
| Zoho account | Actual app URL, owner/app link names, regional data centre and authorized read-only OAuth client/refresh token in server secrets. |
| Real report/field mappings | Discovered vehicle, booking, approval-history and driver reports; optional trip/fuel/maintenance reports; sample source records to verify nested fields and timestamp semantics. No report names are prefilled. |
| API allowance | Account edition, purchased licenses, other API use, scope completeness and approved daily sync budget. |
| Vehicle master | Real names, registrations, capacities and identity conventions for both vehicles. |
| Registers | Representative movement/driver/fuel register pages and receipts, including difficult handwriting and overnight entries. |
| OCR | Azure resource region, secret key, enabled tier, verified page price, data-handling authorization, header mappings, budgets and quality validation. No real extraction has run. |
| Background sync | Private scheduler binding/platform support, configured secret, deployed trigger and unattended success/failure checks through the real host. |
| Staff | Authorized manager/operator/viewer emails and private-site access grants; real role end-to-end checks. |
| Notifications | Explicitly authorized recipients and channels, plus a delivery implementation. External delivery remains disabled. |
| Company policies | Departure tolerance acceptance, approval-history completeness, retention/deletion policy, recovery/restore drill, data-region requirements and expected volumes. |
| Deployment | Existing-site publication needs an explicit request; a saved version alone is not a published upgrade. Real hosting migration and login checks follow publication. |
| Costs | Actual Zoho/Sites/Azure account charges, included allowances and billing alerts. Public rates are documented, not an account quotation. |

Automated mocked integration checks do not prove that the real Zoho account, OCR accuracy, production roles, remote storage, browser interactions or scheduler work. Those remain mandatory pilot checks before company rollout.

A concurrent update to the existing site was preserved: /source-preview holds the supplied-file historical comparison, with server-gated data and authenticated exports. It is distinct from the operational database and does not establish prior approval. Those source files do not include original register images, reliable actual departure times or approval-history evidence.

The preserved prototype/historical comparison also passed its 16 regression checks. A build-asset check found zero sampled historical record IDs in publicly served client JavaScript; the historical dataset is supplied only after server authentication.
