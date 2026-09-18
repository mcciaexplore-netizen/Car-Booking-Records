# Verification and outstanding inputs

## Token setup utility — 9 September 2026

The separate Windows administrator utility `scripts/zoho_token_exchange.py` passed all **18 tests** with `python -m unittest discover -s tests -p test_zoho_token_exchange.py -v`. Network calls were mocked; credentials were test fixtures. The tests performed real Windows DPAPI encryption/decryption and ciphertext tamper rejection, and checked regional endpoints, POST payload, timeouts, redirects, OAuth errors, missing tokens, malformed/oversized responses, no automatic retry, hidden-input failure, secret-free output, existing-bundle preservation and failed-exchange cleanup. The command-line help and source whitespace check passed. After an empty legacy bundle was reported, additional checks verified a clear empty-file message, no final bundle during input, cancellation cleanup, and retention of recoverable encrypted credentials if finalization fails.

No real grant code was submitted, no real credential bundle was created, and no hosting secrets or deployed dashboard were changed. Replace credentials exposed in conversation before a real exchange. This utility is a local provisioning step, not a completed Zoho connection; see [token setup](ZOHO-TOKEN-SETUP.md). The dashboard validation results below remain those of the previously verified application build.

## Dashboard — 8 September 2026

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

## Frontend verification — 18 September 2026

This section supersedes older test counts for the current local implementation; earlier dated results above remain historical evidence.

### Passed

- `npm.cmd test`: **36 passed, 0 failed, 0 skipped**. The pre-change baseline was 27 tests. Added checks cover bounded pages with full metrics/exports, pending-document pagination and detail authorization, unknown/zero/purchase dates and IST boundaries, application selection, original values/coordinate validity, stale-response rejection, access cancellation, KPI/global-permission intersections, and purchase-date ordering.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build`: passed, all five Vinext build phases and four routes. The Sites build helper was attempted first but its Windows npm path resolution failed; the equivalent project build command completed. Vite emitted a nonblocking future JSON-import-attributes warning.
- Browser checks used a separate `.wrangler/ux-fixtures` D1/R2 namespace and a clearly visible synthetic-data banner. All integration secrets are omitted by the dev-only fixture runtime. No real data was edited, and no documents were submitted for external extraction.
- Overview and review layouts inspected at 360, 390, 768, 1280 and 1440 px. No page-level horizontal overflow on inspected screens. The 768 px review was changed to tabs after identifying a cramped split view. Mobile review actions measured 44 px.
- All nine KPI destinations, page-two refresh, direct trip-link refresh, browser Back, searchable employee ID selection, rapid search, preserved filter context after retry, and dialog focus return worked.
- Multi-file upload retained successful outcomes when one file failed type validation. The same image returned the existing document; a new original stayed awaiting extraction with no fabricated rows. Per-file Retry remained available; network-failure retry was not separately simulated.
- Correction retained original fields/source/history and missing return/odometer values. Save correction remained distinct from confirmation. Confirmation updated pending documents and trip/distance metrics consistently.
- Review tabs retained an unsaved reason; the dirty-state guard offered Keep editing/Discard. A Leave unresolved decision persisted its reason, actor, timestamp and original classification. Later approval was explicitly labeled as after departure.
- A fixture-only corrupt read response preserved seven cached filtered records and their export link. Restoring the fixture and Retry recovered without losing filters. Disabling the fixture member then cleared protected rows/exports on the next request; restoring it recovered access. The fixture was restored to valid settings and active access afterward.
- Fuel detail preserved a date-only purchase, unknown quantity and exact INR 2,051.75 amount. Historical source preview opened its original row and candidate comparison with explicit absence of prior-approval evidence.
- Contrast was calculated from the rendered permission-review screen: 61 visible text elements, lowest sampled ratio 5.11:1. This is a scoped check, not a whole-product accessibility certification.

### Failed / outstanding engineering checks

The strict `npm.cmd run lint` gate **fails**. The diagnostics span inherited UI/backend/test code and newly introduced loose API/prop types and state effects. They include explicit `any`, floating promises, React compiler/effect rules, label/component semantics and related typed lint rules. This is not solely preexisting debt. The transient export generic type diagnostic was corrected and TypeScript validation rerun; the repository still requires lint cleanup. The local diagnostic artifact is `work/ux-lint-final.json` (ignored development output).

### Not run / externally unverified

Real Zoho access, discovered mapping round-trip, full source count comparison, actual API allowance, live incremental/deletion reconciliation, OCR quality and costs, a multipage PDF across supported browsers, mobile camera/library on physical devices, production identities/roles/storage, unattended private scheduler, external notification delivery, company-scale performance, backups/restore and company policy signoff are unverified.

Keyboard selection and dialog return were exercised, but a complete keyboard-only audit, screen reader, 200% text zoom and OS-level reduced-motion test were not completed. Reduced-motion CSS was inspected. Do not describe these as passed.

See [all 48 audit items and screenshot evidence](UX-IMPLEMENTATION.md). The published site remains the earlier historical reconciliation; no upgrade was published.

Final source checks: TypeScript and production build passed again after the historical focus fix. Strict lint reported 294 errors and 1 warning; see LINT-STATUS.md. No checked fixture record identifiers appeared in production client JavaScript. git diff --check passed (line-ending notices only).
