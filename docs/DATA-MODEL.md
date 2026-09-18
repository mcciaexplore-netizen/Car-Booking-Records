# Fleet Desk data model, rules and metric definitions

## Durable records

Schema is declared in `db/schema.ts`; production migrations are generated under `drizzle/`.

| Store | Purpose and relationships |
|---|---|
| `source_records` | Versioned Zoho vehicles, employees, drivers, bookings, approval events, trips, fuel and maintenance; `kind` separates record types. Key: generation + kind + stable `zoho:{report}:{ID}`. Contains original source ID, report, raw JSON, mapped JSON and fetch timestamp. |
| `sync_runs` | Full/incremental import state, cursors, pages, timestamps, errors and mapping hash. `settings.activeGeneration` selects one complete snapshot. |
| `documents` | Original private object key, SHA-256, MIME, size, source type, uploader, processing state, extraction result object and deletion tombstone. |
| `extracted_rows` | Document foreign key, source page/row, original extracted JSON, corrected values, uncertainty flags, draft/confirmed state, reviewer, review time and optimistic version. |
| `actual_trips` | One confirmed actual trip per register row, linked by a unique row foreign key. |
| `fuel_purchases` | One fuel purchase per confirmed row, linked by a unique row foreign key; can accompany a movement row. |
| `reconciliations` | Trip ID, input evidence hash, matching-rule version and immutable classification snapshot. |
| `review_decisions` | Append-only reason, action, booking/duplicate link, reviewer, timestamp, evidence hash and original result. |
| `change_history` | Append-only before/after history for corrections, access, policies, uploads and snapshot activation. |
| `users` | Active role grants keyed to authenticated staff email. |
| `settings`, `api_budget`, `alerts` | Non-secret policies, daily call budget and deduplicated internal alerts. |

Zoho source entities are logical typed records in a versioned source table, rather than separate physical tables. Cross-source associations use stable IDs and explicit booking references; source raw JSON is retained. Local documents/rows/trips/fuel have relational foreign keys. OAuth refresh tokens are not database records.

## Field mapping is intentionally empty until inspection

No actual Creator reports or fields have been inspected without account credentials. No report name is assumed to exist. A mapping entry has this structure, with the report/form/field values selected from inspected metadata:

```ts
type Mapping = {
  kind: 'vehicles' | 'employees' | 'drivers' | 'bookings' |
        'approvals' | 'trips' | 'fuel' | 'maintenance';
  report: string;
  form: string;
  fields: Record<string, string>; // canonical key -> actual field link path
  dateFormat: 'iso-offset' | 'iso-local-ist' | 'dd-MMM-yyyy HH:mm:ss';
  decisionValues?: Record<string, string>; // actual decision -> normalized event
  modifiedField?: string; // only an inspected, tested modified-time field
  criteria?: string; // explicit selected history/report scope
};
```

Mappings must reference discovered reports and inspected form field names. Nested lookup paths are allowed only below an inspected top-level field. Configure fields for what is actually present, including the report's visible field scope, rather than interpreting an object display label as a stable ID.

| Source type | Canonical fields to map when available |
|---|---|
| Vehicle | `registration`, `name`, `capacity`, `fuelLevel`, `fuelLevelAt` |
| Employee / driver | `name` and appropriate original identity/department fields; retain original source ID |
| Booking | `bookingRef`, `vehicleId`, `employee`, `employeeId`, `driver`, `driverId`, `department`, `departure`, `expectedReturn`, `passengers`, `destination`, `purpose`, `status` |
| Approval history | `bookingRef`, `decision`, `decidedAt`, `approver`; normalize actual values to `approved`, `rejected`, `cancelled` or unknown |
| Actual trip | Register fields below, using verified explicit timestamps; only map a report that represents actual movement, not requests |
| Fuel / maintenance | `registerDate`, `vehicleId`, `litres`, `amount`, `payer`, `receiptRef`, `startOdo`, `remarks` as applicable |

`vehicleId` is the registration string used consistently across these mappings and the paper registers. `employeeId` and `driverId` must use the same verified identity namespace in both sources; when absent, exact normalized names are compared, with fuzzy names restricted to suggestions. No inferred signature identity is allowed. More complex lookup/subform structures require an actual sample record and a reviewed mapping extension.

Register fields: register date, vehicle registration, employee/requester and optional ID, driver and optional ID, department, booking reference, destination, purpose, passenger count, departure, return, expected return, start/end odometer, litres purchased, amount, payer, receipt reference, remarks/damage, optional signature presence, fuel level and its timestamp. All missing values are null. Monetary amounts use INR; distances use km; quantities use litres.

## Matching rule `fleet-2026-09-08.1`

1. Exclude unconfirmed extraction from confirmed trip metrics and permission decisions.
2. Use an exact unique booking reference. Without it, suggest candidates by vehicle and a one-day departure window, ranked by employee, driver and destination. Fuzzy names affect candidate ordering only. Ambiguous references remain unresolved.
3. Require the last recorded decision strictly **before departure** to be approved. A rejection/cancellation before departure supersedes an earlier approval. Conflicting same-time events or undated history are insufficient evidence. An approval at exactly the same timestamp is not proven prior approval.
4. Check vehicle, employee, driver, passenger count, vehicle capacity and booked departure. Default tolerance is 30 minutes early and 60 minutes late, configurable from 0 to 1,440 minutes. Departure after the booked expected return differs from permission. Missing required evidence stays insufficient.
5. Keep explicit overnight dates. Internally use UTC instants and display IST. Do not derive AM/PM or assume a next-day return.
6. Compare destination when available. Classify differences for review; do not convert them into unauthorized use.
7. Human overrides require a reason and the currently displayed evidence hash. Changed source or corrected values require re-review. Previous classifications and decisions remain available.

Trip states: In progress, Returned, Overdue, Incomplete information. Permission states: Matched prior approval; Approval found, details differ; No matching approval found; Insufficient evidence; Confirmed unauthorized after review; Documented exception accepted.

Approved bookings with no linked trip appear as **No recorded usage**, never automatic no-shows. A signed register only establishes signature presence if explicitly reviewed; it does not prove identity or permission.

Cross-source trip deduplication requires exact vehicle, booking reference, departure, start odometer, employee and driver, plus non-conflicting return/end odometer. The register record is canonical and linked source IDs are preserved. Other possible duplicates require a reviewer decision. Fuel purchases merge across sources only with matching vehicle, register date, receipt reference, quantity and amount; ambiguous purchases stay separate.

## Metric definitions

Global filters are applied on the server using the same function as CSV exports. Dates are inclusive IST calendar dates, based on departure or register date for date-only records. Date-filtered records with no date are excluded. Employee, driver, department and permission filters are exact, case-normalized matches; free-text search is separate. Fuel/maintenance records without attributes for a selected trip-specific filter do not match it.

| Metric | Definition / denominator |
|---|---|
| Recorded trips | Count of confirmed, deduplicated actual records matching the filters. Missing-distance trips remain in this count. |
| Matched prior approval | Count with prior approval after all rule checks; denominator for coverage is all recorded trips. |
| Trips requiring review | Count of differing approval details, no matching approval, or insufficient evidence. |
| Confirmed unauthorized | Count with a current, explicit human unauthorized decision. |
| Recorded distance | Sum of valid nonnegative confirmed odometer differences with valid explicit departure/return pairs. Missing or invalid pairs are excluded, not zero. If no valid pairs exist, display a dash. |
| Fuel purchased | Sum of recorded, known purchase quantities. Missing quantities are counted separately. |
| Fuel spend | Sum of recorded, known INR purchase amounts. Missing amounts are counted separately. |
| Open trips | In progress plus overdue; no inferred trips from bookings alone. |
| Pending image reviews | Count of nondeleted documents with no rows or at least one unconfirmed row, across the whole workspace. |

Vehicle panels show the most recent recorded evidence across dates, separately from report filters. An old returned trip is labelled recorded returned, not live available. Unknown names, fuel levels and odometers stay unknown. Fuel purchased is not fuel consumed. Km/l stays **Insufficient data** until a full-tank or fuel-balance methodology and source evidence exist. Utilization is omitted until the available-hours schedule and maintenance treatment are agreed. Odometer differences and fuel-price variation are investigation prompts only.

## Frontend contract additions — 18 September 2026

No new table or migration is required. The existing settings store now also holds non-secret `zohoApplication` (saved owner/app link names), `oauthVerifiedAt`, `schedulerLastSeen` and `schedulerLastCompleted`. Tokens remain in server secrets. Observed scheduler timestamps describe authenticated calls/completed checks, not verified recurrence.

Extracted-row `original` JSON may additionally contain original normalized values, source cells/column mappings and page geometry. Original raw cell text is retained separately from corrections. A highlight requires valid page-specific geometry; absence of coordinates is not repaired by guessing. Correction flags remain until explicit confirmation. Old original payloads without these optional fields continue to display textual references.

The snapshot accepts stable person IDs, pagination/sort/layout context and a separate `outcome` drill-down constraint. `outcome` intersects the global permission filter instead of replacing it. Server filtering and metrics precede page slicing; clients receive bounded lists and row references, with original/corrected evidence available only through authorized detail routes. Exports remove pagination and use the same filters and ordering. Fuel date filtering, grouping and ordering prefer purchase/register date over journey departure; fuel ignores trip-only permission/outcome/issue metrics. Booking lists likewise do not interpret trip permission status as booking approval.

All API attachments, detail views and exports still require active server-side membership. Date-only values retain their precision. Default sort puts known dates newest first with stable ID tie breaking; undated records sort last. Pending documents are selected before pagination and the pending KPI counts whole-workspace documents. Full-history server reconciliation remains a performance consideration documented in the implementation report.
