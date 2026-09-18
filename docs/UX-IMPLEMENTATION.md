# Fleet Desk frontend implementation — 18 September 2026

The operational workspace has been upgraded in the existing React/Vinext, Base UI, Tailwind, Lucide and Geist stack. The forest-green identity and supplied-file historical comparison are preserved. Existing uncommitted changes were retained. No production records, staff grants, provider subscriptions, notifications or deployments were changed.

The published site was reinspected and still shows the older supplied-file reconciliation. The new operational interface is local. Historical rows remain behind authentication at `/source-preview` and outside operational totals; `/demo` remains explicitly fictitious.

## Verification result

- **Passed:** 36 automated acceptance tests; TypeScript validation; production build. The baseline was 27 acceptance tests.
- **Passed in the isolated browser workspace:** all nine KPI destinations, page/filter state, direct record links and Back, stable person selection, partial upload failure and duplicates, correction and confirmation, reviewer reason/history, later-approval warning, transient-error recovery and revoked-access clearing.
- **Passed within the inspected screens:** responsive layouts at 360, 390, 768, 1280 and 1440 px; no page-level horizontal overflow; 44 px mobile review actions; focus return; keyboard person selection; 61 sampled review text nodes met 4.5:1 contrast (lowest 5.11:1).
- **Failed:** the repository's strict lint command. See [remaining diagnostics](LINT-STATUS.md). Existing and new modules still contain explicit `any` contracts, React compiler/effect diagnostics, promise and accessibility lint diagnostics. This is outstanding engineering work, not a passing release gate. TypeScript and browser results do not erase this failure.
- **Not run:** real Zoho import/mapping and API allowance, real OCR/handwriting quality, unattended private scheduler, production role pilot, company-scale load/restore tests, physical-device camera/PDF viewer checks, screen reader, 200% text zoom and OS-level reduced-motion testing. CSS reduced-motion behavior was inspected, not certified with assistive technology.

See [verification details](VERIFICATION.md), [operations](OPERATIONS.md), [deployment](DEPLOYMENT.md) and [costs and limits](COSTS-AND-LIMITS.md).

## Coverage matrix

Status **IV** means implemented and verified by the specific local check in that row; it does not mean every browser or external service is certified. **EV** means the independent implementation is present but full verification awaits the named dependency. No item is marked complete solely because a disabled control exists. Cross-cutting lint failure remains open across the matrix.

| ID | Baseline → delivered change | Dependency / main files | Verification evidence | Status |
|---|---|---|---|---|
| 01 | Large repeated warnings → compact freshness/evidence disclosure; important review warnings retained | UI: dashboard, evidence | Stale overview and later-approval review inspected | IV |
| 02 | Repeated All values → visible labels and descriptive defaults, including historical selectors | UI: dashboard, UI controls, sample dashboard | Rendered selectors and searchable picker inspected | IV |
| 03 | Ephemeral navigation → URL views, filters, sorting, page and detail; focus/scroll restoration | UI: navigation, review | Refresh page 2, direct detail refresh, Back and opener-focus checks | IV |
| 04 | Racing filter requests → debounce, abort and latest-request guard; separate request/mutation errors | UI + latest-request helper | Two asynchronous regression tests; rapid search and retry browser checks | IV |
| 05 | Crowded filters → primary date/vehicle, More filters, presets, chips, individual removal | UI: dashboard | Person/search filters, clear and retained context tested | IV |
| 06 | Page-selection actions → file chooser, connection setup and specific save actions | UI: dashboard, uploads, review | Multi-file chooser and both correction/decision save paths exercised | IV |
| 07 | Long selectors → searchable people/destination/candidate controls with unknown options and stable IDs | UI + snapshot options | Keyboard ArrowDown selection persisted employee ID in URL | IV |
| 08 | Ambiguous empty/error display → no source, import pending, syncing, stale, failure, empty and denied states | UI + API | Empty baseline, populated stale, induced failure/recovery and denied tested; sync states in acceptance suite | IV |
| 09 | Setup-heavy overview → two vehicles, four primary/five secondary KPIs, attention and recent records | UI: records | Populated 1440 px screenshot and narrow layouts inspected | IV |
| 10 | Incomplete metric help → nine definitions, denominators and actionable exclusions | UI + reporting/domain | All nine drill-downs; exclusion/unknown/zero and permission-intersection tests | IV |
| 11 | Misleading minimum bars → true zero widths and explicit unknown groups | UI + reporting | Zero/missing/IST grouping regression; chart markup/rendering inspection | IV |
| 12 | Static vehicles → linked vehicle history and timestamped latest recorded facts | UI + detail API | Vehicle panels inspected with old, missing and conflicting evidence; detail response implementation checked | IV |
| 13 | Scattered work → grouped overdue, missing information, permission and image attention | UI + reporting | Filter destinations inspected; counts use the same server summaries | IV |
| 14 | Wide mobile trips → readable cards and visible Review trip action | UI: records, upgrade CSS | 360/390 px browser checks; 44 px action measurement | IV |
| 15 | Whole client lists → bounded server responses, counts, stable sorting, reset/clamp and paging | API + reporting + records | 23-record pagination/full-metric/export regression; browser page refresh/filter reset | IV; company-scale load test remains |
| 16 | No booking inspector → request, permitted users, chronology and linked usage details | API + review | Evidence timeline/component inspection; no-usage and prior-approval rules covered by tests | IV |
| 17 | Generic quality warnings → field/issue groups and targeted records | API + records | Distinct missing return/odometer/time/approval/conflict groups inspected and filtered | IV |
| 18 | Repeated provenance text → concise sources with detailed IDs, page/row and original evidence | UI + detail API | Register original, purchase source and historical details opened | IV |
| 19 | Single trip table → records/daily/monthly views and useful saved filters | UI + reporting | IST month boundary/grouping test; URL view implementation checked | IV |
| 20 | Unclear exports → full filtered scope/count and matching order, formula protection | API + reporting | Full result exceeds visible page in regression; existing authorization/formula tests pass | IV |
| 21 | Batch-wide upload → independent file states, duplicate result and per-file retry | UI + document API | Batch produced one duplicate, one failed type and one saved original without losing successes | IV; real extraction transitions EV |
| 22 | Decorative drop zone → real drag handlers and keyboard file chooser with limits | UI + server validation | Multi-file selection/type error and server signature tests; mobile camera hardware unavailable | IV within desktop file workflow |
| 23 | Implicit OCR success → configuration notice, awaiting extraction and manual workflow | UI + existing Azure adapter | Unconfigured upload remains awaiting extraction; no provider call performed | EV: authorized Azure account and representative pages |
| 24 | Flat correction form → Vehicle/people, Journey, Odometer, Fuel, Notes groups | UI: review | Original row corrected and saved; hidden data retained in value model | IV |
| 25 | Basic preview → image zoom/rotate/fit and valid-coordinate highlight; private PDF viewer/page controls | UI + evidence helper | Image controls and geometry regression passed; textual fallback inspected | EV: representative multipage PDF/browser support |
| 26 | Implicit uncertainty → field flags, original/corrected values, typed fields and null preservation | UI + documents | Corrected row retained missing return/odometer and flags; original text/invalid-coordinate tests | IV |
| 27 | Conflated save/confirm → separate actions, dirty guard, tab-preserved drafts and row progress | UI + documents | Keep editing, tab switch, save correction then confirm and metric refresh exercised | IV |
| 28 | Unstructured uploads → private thumbnail, metadata, row progress and Resume review | UI + API | Fixture document reached 2/2 confirmed; new upload correctly shows no rows yet | IV |
| 29 | Scattered evidence → desktop aligned comparison; tablet/mobile Document/Entry/Booking/History tabs | UI: evidence/review/CSS | Review screenshots at 360, 390, 768 and 1280 px | IV |
| 30 | All-bookings dropdown → searchable candidate cards with reasons and differences | API + review | Candidate/late approval visibly separated; candidate-only and fuzzy-match tests pass | IV |
| 31 | Incomplete chronology → dated events and explicitly undated evidence | UI + domain | Approval 10:30 after 09:30 departure shown as not prior approval; overnight and undated rules tested | IV |
| 32 | Generic decision save → explicit action, reason and intended outcome | UI + review API | Leave unresolved reason saved; unauthorized/exception/reason rules tested | IV |
| 33 | Raw history first → readable actor/time/value changes and advanced source details | UI + immutable history | Correction before/after and decision reason/history inspected | IV |
| 34 | Fuel ambiguity → purchased quantities, missing-value counts and insufficient efficiency evidence | UI + domain | Missing vs zero regression; exact recorded purchase displayed | IV |
| 35 | Limited fuel reports → separate monthly litres/spend and vehicle drill-down | UI + reporting | Purchase date grouping/order regressions; filtered purchase view inspected | IV |
| 36 | No purchase inspector → payer/receipt/source detail and dated odometer investigations | API + review/records | Date-only purchase and INR 2,051.75 detail inspected; no misuse classification added | IV |
| 37 | Passive setup → secure utility instructions, application save, discovery, mapping and import actions | UI + Zoho/API | Admin/app validation tests; setup rendered truthfully with no credentials | EV: regional OAuth bundle, actual app and allowance |
| 38 | Raw mapping JSON → discovered report/field selectors and mapping preview; advanced JSON retained | UI + Zoho validation | Uninspected mapping rejection test; no invented options in empty UI | EV: actual metadata and representative source records |
| 39 | Credentials mistaken for connection → eight milestones, persisted access check, per-report rows/retry and scheduler observations | UI + API + Zoho | Status/progress rendered; OAuth refresh/verification and mocked sync tests pass | EV: real OAuth/import and private scheduled trigger |
| 40 | Generic empty/error pages → contextual explanations, retained cache and Retry | UI + LatestRequest | Induced error retained seven filtered records; recovery cleared request error; denied cleared protected records | IV |
| 41 | Unclear staff changes → capability preview, prefilled existing grants and dual-access explanation | UI + API roles | Role restrictions/server rejection tests; no real grants edited | EV: authorized production role pilot |
| 42 | Thin alerts → type, first/last seen, evidence link and resolved state; delivery explicitly inactive | UI + alerts API | Deduplication/no-delivery acceptance test; external sending absent | IV for internal alerts; external delivery intentionally blocked |
| 43 | Low contrast → shared readable foreground/helper/badge tokens | UI: upgrade CSS | 61 visible review text nodes checked, minimum 5.11:1; all-surface accessibility audit outstanding | IV for measured review screen |
| 44 | Small mobile actions → 44 px controls and 16 px mobile inputs | UI: upgrade CSS | Review trip buttons measured 44 px at 360 px; mobile review screenshots | IV; physical touch/text zoom unverified |
| 45 | Inconsistent focus → dialog return, main focus, labels, update/error announcements | UI + Base UI controls | Keyboard selector, dirty guard and dialog opener focus verified | EV: screen reader, text zoom and full keyboard-only audit |
| 46 | Dispersed style behavior → shared operational tokens including portaled controls | UI: upgrade CSS, layout | Portaled picker/review and desktop/mobile appearance inspected | IV |
| 47 | Dense inconsistent type → consistent scale, numeric alignment and expandable details | UI: records/CSS | Long-name fixture and INR decimals inspected across widths | IV |
| 48 | Abrupt feedback → restrained transitions/save state; reduced-motion CSS | UI: upgrade CSS | CSS and browser state transitions inspected; no animated counters or forced scrolling | EV: OS-level reduced-motion and assistive-technology check |

## Main implementation files

- `app/fleet-dashboard.tsx`: authorized workspace state, filters, request recovery and navigation.
- `app/fleet-navigation.ts`, `lib/latest-request.ts`: shareable state, focus/scroll behavior and race prevention.
- `app/fleet-records.tsx`, `lib/reporting.ts`: overview, vehicles, bounded registers, quality, fuel, summaries and definitions.
- `app/fleet-uploads.tsx`, `app/fleet-review.tsx`, `app/fleet-evidence.tsx`, `lib/evidence-view.ts`: upload queue, original document viewer, corrections, matching and history.
- `app/fleet-setup.tsx`, `app/fleet-workspaces.tsx`: executable setup, visual mapping, sync progress, internal alerts and staff roles.
- `app/api/fleet/[...path]/route.ts`, `lib/data.ts`, `lib/documents.ts`, `lib/zoho.ts`: authorized detail/paging/setup contracts, preserved extraction evidence and connection state.
- `app/fleet-upgrade.css`: shared visual tokens and responsive review/record layouts.

No new runtime package or database table was introduced. Additive non-secret settings and original-evidence JSON fields are documented in DATA-MODEL.md. The server still loads the active evidence generation to reconcile and compute full filtered aggregates before returning bounded lists; it does not send that generation to the client. Company-scale query/CPU optimization needs a measured load test and may require materialized reconciliation/aggregate tables.

## Screenshots

These screenshots contain **isolated synthetic test records**, not live company activity. Saved after browser verification:

- [Populated overview, 1440 px](screenshots/overview-1440.png)
- [Desktop permission review, 1280 px](screenshots/desktop-permission-review-1280.png)
- [Mobile original-register review, 390 px](screenshots/mobile-register-review-390.png)
- [Permission comparison, 360 px](screenshots/permission-review-360.png)
- [Tablet review, 768 px](screenshots/permission-review-768.png)
- [Access denied, 1280 px](screenshots/access-denied-1280.png)

## Remaining release work

1. Resolve strict lint diagnostics and repeat that gate. They are not all inherited.
2. Complete the assistive-technology, text-zoom, PDF and physical-device checks above.
3. Provision verified regional OAuth secrets, inspect actual Creator reports/fields and reconcile a real import against source counts. A local encrypted bundle is not evidence that production is connected.
4. Approve and configure the existing extraction provider, price/tier/region/page budgets and data handling; validate real difficult register pages before confirming extraction quality.
5. Provision the supported private scheduler, test unattended failures/retries, and run real role/attachment/export access checks with authorized staff.
6. Verify actual hosting/API/storage/extraction costs and company retention, backup and scale requirements.
7. Publish only after an explicit deployment request. No deployment was performed here.
