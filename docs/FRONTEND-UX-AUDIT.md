# Fleet Desk — frontend and UX audit

Reviewed: 18 September 2026. Scope: recommendations, not an implemented redesign.

## Recommendation

Keep the newer green workspace, Geist typography, restrained cards and familiar navigation. Focus the redesign on completing the three essential tasks: understanding the two vehicles' recorded status, finding records that need attention, and reviewing the evidence accurately. A new visual theme alone would not solve the main problems.

The published site and the local workspace currently show different interfaces. The published site presents historical file reconciliation; the local project contains the newer operational workspace. Reuse the operational shell and carry the useful historical comparison and provenance features into it. Keep the historical preview clearly identified as historical data.

## What was reviewed

| Surface | Review performed | Limit |
| --- | --- | --- |
| Published historical dashboard | Overview, actual trips, Zoho bookings, image bookings, data quality, sources and trip comparison dialog | Its historical records do not establish a working automatic Zoho connection |
| Local operational workspace | Overview, bookings, trip register, fuel and expenses, permission review, register uploads, alerts and settings; staff access inspected without changes | Local records were empty, so populated operational workflows were inspected in source |
| Responsive behavior | Desktop around 1280 × 720; phone viewport 390 × 844 | This is not a complete browser/device certification |
| Implementation | Dashboard, shared controls, review workspaces, sample dashboard and styles | No redesign implementation, production load test or end-to-end screen-reader test was performed |

Browser interactions were read-only. No records, permissions, connection settings or uploaded files were changed. No deployment was performed.

## Keep these strengths

- Clear distinction between recorded trip status and permission status.
- Explicit historical-data labels, missing-evidence explanations and unknown vehicle availability.
- Provenance links and original extracted values; these are essential evidence, not clutter to delete.
- Separate treatment of approved bookings with no recorded usage.
- The operational workspace's green palette, workspace/manage navigation groups and four settings tabs.
- Existing filters, active filter chips, metric drill-downs, loading skeletons and source preview.
- Existing focus styling, skip link and reduced-motion support. Extend and test them rather than rebuilding them unnecessarily.
- Existing private access and server-enforced roles. Improving the interface must preserve these restrictions.

## Concrete findings

| Finding | Evidence | Implication |
| --- | --- | --- |
| Primary phone actions are hard to reach in historical tables | At 390 px viewport width, the actual-trip table measured about 839 px across. Distance, candidate evidence and Review were beyond the initial horizontal view. The page itself did not overflow. | Mobile needs a record layout with the primary action visible; changing overall page width will not solve this. |
| Too much content appears before the records | On the published desktop register, the first rows began around 550 px down. On the local phone overview, the setup card and filters occupied the first screen. | Compress persistent context and move secondary controls behind disclosure. |
| Some small explanatory text is too faint | Settings step descriptions use `#91a08f` on white: calculated contrast **2.75:1**, at 12 px. | Darken this text. Normal text generally needs 4.5:1 under WCAG AA. |
| Some historical filters are unclear visually | Two selectors display “All”; accessible names identify their purposes, but visible labels do not. | Add visible Vehicle and Candidate result labels; accessible names alone do not help sighted users. |
| Review requires scrolling between evidence | In the historical comparison dialog, trip details appear first and booking candidates are farther down. Raw date-only values can display an ISO timestamp with midnight. | Align compared fields and distinguish known dates from unknown times. |
| Setup describes steps that cannot be completed from that screen | The local Connections tab requests an application URL without providing its input; initial connection buttons are disabled pending external configuration. | Build executable setup steps, or provide exact administrator setup instructions and a return-to-verify action. |
| Zero use can produce a visible bar | The operational vehicle chart applies a minimum nonzero bar width, including to a vehicle with zero trips when other trips exist. | Render a true zero-length data bar; retain a separate clickable row. |
| Operational tables lack the historical version's pagination | Historical tables paginate 20 rows. The operational shared table has no pagination or sorting controls and callers render their full lists. | Carry pagination forward and add predictable ordering before the record volume grows. |
| Filter requests can race | Snapshot loading follows every query change, without cancellation or a latest-request guard. | A slower old response could replace the newer filtered result. This is a source-level risk, not a reproduced production incident. |
| Recovered requests can leave an old error visible | Successful snapshot loading does not clear its earlier error state. | Clear the relevant error on successful recovery, while preserving unrelated errors. |
| Upload feedback is batch-wide | Selected files upload sequentially inside one operation; one failure interrupts the loop. A detailed success message is subsequently replaced by the generic operation notice. | Show progress and outcomes per file, and retry only failures. |
| Navigation context is temporary | Both dashboards store the current view in component state rather than the URL. | Refresh, browser Back and a shared link cannot reliably restore the selected view and filters. |

## Proposed page hierarchy

### Overview

1. Compact title and source freshness, with one role-appropriate primary action.
2. Date range and vehicle filter; an accessible More filters control reveals the remainder.
3. The two vehicle panels, showing recorded availability, employee/driver, expected return and evidence timestamps.
4. Four primary operational metrics: recorded trips, open trips, trips requiring review and pending image reviews.
5. A compact secondary metric group retaining matched prior approval, confirmed unauthorized, distance, litres purchased and fuel spend. All nine required metrics remain available with definitions and exclusions.
6. Records needing attention, followed by recent trips and historical charts.

For a completely empty workspace, replace repetitive zero charts with a short setup state and one next action. Explain “No records imported” rather than implying that zero activity has been established. After the first import, the normal overview appears.

### Navigation

Keep the existing Workspace and Manage groups. Use proper navigable destinations with URL-backed filters and detail views. Preserve the historical file preview as a clearly labeled secondary destination. Show useful pending counts for reviews and uploads, without turning every item into a notification badge.

On mobile, retain a compact navigation drawer with a comfortably sized trigger. Keep page title, active filters and the relevant task action easy to reach. A new bottom-navigation system is optional; do not add it unless user testing shows frequent switching among a small set of destinations.

### Evidence review

Use a dedicated review page, or a full-height workspace with a stable header and action area. On desktop, show the original document beside the correction/comparison panel. Within the comparison panel, use aligned columns: Register value, Booking/approval value and Finding. Offer a separate history tab for original values, corrections, reviewer decisions and rule version.

On a phone, use clear Document / Entry / Booking / History tabs with saved draft state, instead of compressing multiple columns. Keep the current row number and next/previous controls visible. Status and decision controls must remain separate.

## Prioritized improvement backlog

Priority definitions: **P1** improves task completion, trust or accessibility; **P2** improves routine efficiency; **P3** is finishing polish. “Frontend + API” means the interface needs supporting server work; it is not a CSS-only change.

### Shared layout, navigation and filtering

| ID | Priority | Change | Completion check |
| --- | --- | --- | --- |
| 01 | P1 | Reduce repeated warning banners to a compact persistent evidence/freshness summary, with expandable details and prominent warnings where a decision depends on them. | The first useful record is visible sooner, and missing approval evidence remains unmistakable. |
| 02 | P1 | Give every filter a visible label and meaningful value: “All vehicles”, “All permission outcomes”, etc. | Adjacent selectors are understandable without opening them. |
| 03 | P1 | Put view, date range, filters, pagination and selected record in the URL. Restore scroll position when returning to a list. | Refresh and browser Back preserve context; direct links reopen the intended authorized view. |
| 04 | P1 | Debounce text search and cancel or ignore superseded requests. Mark results as updating and clear recovered request errors. | Rapid filter changes never display an older response as the latest result. |
| 05 | P2 | Keep date and vehicle visible; put employee, driver, department, permission and source in More filters. Add date presets and readable chips. | “Metric: review” becomes a user-facing label such as “Trips requiring review”; Clear and removal work predictably. |
| 06 | P2 | Make the primary action contextual. On Register uploads, “Upload registers” should open file selection; on settings, connection setup should take precedence. | No primary button merely selects the page already open. |
| 07 | P2 | Use searchable employee/driver/destination selectors when lists grow, and preserve explicit unknown/missing options where relevant. | Staff can find a person without scrolling a long menu; missing data is still discoverable. |

### Overview and vehicle panels

| ID | Priority | Change | Completion check |
| --- | --- | --- | --- |
| 08 | P1 | Create distinct states for no source connected, first import pending, usable records, syncing, stale records and failed synchronization. | Zero, unknown, not imported and unavailable are never interchangeable. |
| 09 | P1 | Bring the two vehicle panels and open/review workload higher on the populated overview. Reduce duplicate onboarding calls to action in the empty state. | A manager can identify recorded vehicle status and outstanding work without reading setup prose. |
| 10 | P1 | Keep definition, denominator and exclusions accessible from every metric, including the secondary group. | Distance explains its confirmed valid odometer pairs; excluded records open a relevant list. |
| 11 | P1 | Fix zero-length chart bars and show missing/unknown records explicitly in group summaries. | Chart marks match values; known groups do not silently imply complete coverage. |
| 12 | P2 | Make vehicle panels open a vehicle history view with trips, bookings, fuel and issues. Show the timestamp beside each last-recorded fact. | A historical fuel reading cannot be mistaken for current fuel level; no location or availability is labeled live without evidence. |
| 13 | P2 | Add an attention section grouped by overdue trip, missing return/odometer, permission review and image correction. | Every count opens the exact corresponding records and preserves the date/vehicle context. |

### Registers, bookings, data quality and exports

| ID | Priority | Change | Completion check |
| --- | --- | --- | --- |
| 14 | P1 | Use mobile trip cards showing date, vehicle, employee, trip status, permission status and Review; expand secondary detail. | Review is reachable without horizontal scrolling at narrow widths. Desktop retains a table. |
| 15 | P1 | Add pagination to operational lists, explicit default ordering, sortable useful columns and visible result counts. Use server pagination when volume requires it. | Record ordering is predictable; changing filters resets or clamps the page correctly. Frontend + API for large datasets. |
| 16 | P1 | Provide a booking detail view with request facts, permitted users, approval/cancellation timeline and linked usage. Preserve No recorded usage separately. | “Assigned” and an exact candidate are never visually presented as proven prior approval. |
| 17 | P1 | Turn data quality into issue groups with issue type, affected field and review state. | Staff can isolate missing return dates, ambiguous handwriting, missing approval evidence or invalid odometers without reading every row. |
| 18 | P2 | Put source filename/page/row in a compact provenance control or detail area; retain an immediately recognizable source indicator in each row. | Essential facts are easier to scan and evidence remains one action away. |
| 19 | P2 | Add Daily / Monthly register views and a small set of useful saved filters, such as Open trips and Awaiting review. | Saved filters are clear and do not override permission restrictions. |
| 20 | P2 | Make Export explain its scope and row count; use the same filter definition as the list. | Exports reflect the full filtered result, not only the visible page, and preserve access checks. |

### Upload and extraction review

| ID | Priority | Change | Completion check |
| --- | --- | --- | --- |
| 21 | P1 | Replace the batch-wide upload state with a per-file queue: selected, validating, uploading, saved, duplicate, extracting, needs correction and failed. | One failed file does not hide successful uploads; retries do not upload completed files again. Frontend + API for extraction progress. |
| 22 | P1 | Either implement drag-and-drop in the dashed upload area or style it clearly as a file chooser. Keep keyboard selection and mobile camera/library choices available. | The visual affordance matches actual behavior, with file type/size guidance before submission. |
| 23 | P1 | Surface extraction availability before upload. Explain when automated extraction is unconfigured and when manual entry is available. | An upload success message never implies OCR completed. No provider is selected or activated by this design audit. |
| 24 | P1 | Group extracted fields into Vehicle and people, Journey, Odometer, Fuel and Notes. Adapt visible groups to document type. | Staff do not face an undifferentiated form of roughly two dozen fields. Hidden fields remain preserved. |
| 25 | P1 | Provide image/PDF zoom, rotation, fit-to-width, page navigation and row highlighting when trustworthy coordinates exist. | Staff can read the original and locate the current row. If coordinates are unavailable, show page/row references without fabricating a highlight. |
| 26 | P1 | Mark uncertain fields individually with text and an icon; preserve blanks as null. Show original and corrected values on demand. | Dates/times remain explicit; ambiguous AM/PM and overnight journeys are not silently resolved. |
| 27 | P1 | Separate Save correction from Confirm register entry. Add dirty-state protection or a clearly labeled server-side draft save, plus next/previous row controls. | Closing review does not silently discard edits; a draft cannot become an unauthorized-use finding. |
| 28 | P2 | Give each document a thumbnail, type, page count, processing state, reviewed-row progress and a focused Resume review action. | Staff can identify unfinished work without reading a long list of row buttons. |

### Permission review

| ID | Priority | Change | Completion check |
| --- | --- | --- | --- |
| 29 | P1 | Align actual and approved values by field, and highlight differences with readable explanations. | Vehicle, employee, driver, departure tolerance and passengers can be compared without scrolling between unrelated blocks. |
| 30 | P1 | Replace the all-bookings picker with searchable candidate cards showing why each was suggested and what evidence is missing. | A weak/fuzzy name match is labeled a suggestion, with no approval-colored treatment. |
| 31 | P1 | Show an ordered evidence timeline: approval, rejection/cancellation, departure, return and later decisions. Explicitly state when timestamps are absent. | Approval after departure and accepted exceptions remain distinct from prior approval. |
| 32 | P1 | Make the final decision action specific to the choice and retain the required reason. Show what classification will change before saving. | “Accept documented exception” and “Confirm unauthorized after review” cannot be confused with confirming an extracted row. No extra confirmation for ordinary corrections. |
| 33 | P2 | Replace raw JSON history as the primary presentation with a readable change timeline; keep raw source details in an advanced disclosure. | Reviewer, timestamp, original outcome, changed values and matching-rule version remain inspectable. |

### Fuel, expenses and reporting

| ID | Priority | Change | Completion check |
| --- | --- | --- | --- |
| 34 | P1 | Retain “Fuel purchased” and “Insufficient data” for efficiency without adequate evidence. Show missing quantities/amounts next to totals. | A polished chart cannot imply fuel consumption, unsupported km/l or misuse. |
| 35 | P2 | Add readable monthly fuel quantity and spend charts with separate units, vehicle comparison and record drill-down. Prefer simple bars or lines over decorative charts. | Currency and litres are not placed on an unexplained shared scale; zero and missing data differ. |
| 36 | P2 | Add a fuel-purchase detail view linking payer, receipt, vehicle and source, and a chronological odometer issue view. | A suspicious reading is an investigation item with supporting evidence, not an automatic accusation. |

### Connections, staff access, alerts and errors

| ID | Priority | Change | Completion check |
| --- | --- | --- | --- |
| 37 | P1 | Turn Zoho setup into executable steps: secure authorization/setup, application selection, discovered report mapping, history selection, verification and first import. | Each step has an action and recovery guidance. Secrets remain server-side. OAuth/setup support requires backend work. |
| 38 | P1 | Replace mapping JSON as the main interface with discovered report and field selectors plus a mapping preview. Keep JSON as an advanced option. | Staff select actual inspected names; unavailable reports are optional rather than invented. Frontend + API. |
| 39 | P1 | Distinguish credentials configured, access verified, first import complete and automatic synchronization activated. Show per-report sync progress and retry details. | A configured secret is not proof of a successful connection or running schedule. |
| 40 | P1 | Make empty and error states specific to each page. Use “No successful sync yet”, not “Unknown IST”; distinguish no alerts from monitoring not configured. | A failed fetch preserves usable records and shows a retry action; authorization failures remain distinct. |
| 41 | P2 | Add a concise role capability preview and explain site access versus Fleet Desk role access. Show current record details when editing an existing staff entry. | Administrators understand the effect of a role change before saving; server authorization remains authoritative. |
| 42 | P2 | Give alerts type, first/last seen, linked evidence and resolution state. Clearly show whether external delivery is configured. | Repeated alerts remain grouped; no real message is sent until recipients/channels are explicitly configured and authorized. |

### Visual system, accessibility and interaction polish

| ID | Priority | Change | Completion check |
| --- | --- | --- | --- |
| 43 | P1 | Darken low-contrast explanatory text; audit placeholder, badge, helper, error and chart text colors across states. | Normal text reaches 4.5:1 and qualifying large text 3:1. Color is never the only status cue. |
| 44 | P1 | Increase mobile primary touch targets toward 44 × 44 px and improve spacing around small actions. The observed sidebar trigger was about 28 × 32 px. | Controls remain easy to use at narrow widths and text zoom. The WCAG AA minimum is 24 × 24 px with exceptions; 44 px is a comfort target, not that minimum requirement. |
| 45 | P1 | Test keyboard navigation, dialogs, focus return, errors and asynchronous announcements end to end. Announce meaningful update completion without reading every background refresh. | Keyboard users can filter, inspect evidence, correct entries and recover from an error without losing focus. |
| 46 | P2 | Consolidate reusable color, spacing, type and state tokens across existing styles. Verify that portaled dialogs/selects receive the intended theme outside `.fleet-shell`. | Popovers, dialogs and pages look consistent without relying on accidental CSS override order. Portal theming is a verification item, not a confirmed browser defect. |
| 47 | P2 | Use a small consistent type/spacing scale, tabular figures for metrics and numeric table columns, and right-aligned amounts. Keep long destinations expandable. | Dense screens remain readable without truncating evidence beyond retrieval. |
| 48 | P3 | Add restrained transition feedback to drawers, tabs, successful saves and validation. Respect reduced motion and preserve native scrolling. | Motion clarifies a state change; numbers do not animate in ways that imply changing live telemetry. |

## Visual direction

Reuse the current forest-green accent and off-white background. Use a darker neutral for primary text and a sufficiently contrasted secondary text color. Keep white surfaces, light borders and modest corner radii. Reserve shadows for overlays rather than every card.

Use approximately 28–32 px page headings, 18–20 px section headings, 14–16 px normal interface text and 12–13 px supporting labels where readable. On mobile, aim for 16 px form input text. Apply a consistent spacing scale such as 4, 8, 12, 16, 24 and 32 px. Validate these choices with real long names, destinations, numbers and validation messages.

Status semantics should remain stable:

| Meaning | Treatment |
| --- | --- |
| Matched prior approval / confirmed entry | Green plus explicit text |
| Needs review / missing or conflicting evidence | Amber plus a precise reason |
| Confirmed unauthorized after human review | Red plus explicit decision wording |
| Candidate match | Blue or neutral; never visually equivalent to verified approval |
| Unknown / not connected / not recorded | Neutral; elevate to amber only when action is actually required |
| Accepted documented exception | Distinct labeled treatment, preserving its difference from prior approval |

The existing React, Base UI, Tailwind, Lucide and charting stack is sufficient for this direction. No additional paid design system is necessary for the proposed frontend work. This says nothing about hosting, storage, Zoho or document-extraction charges.

## Implementation order

1. **Trust and navigation:** truthful states, visible labels, request-race protection, contrast, URL state and mobile record actions.
2. **Daily work:** simpler overview, table pagination/sorting, booking details, review comparison and per-file upload progress.
3. **Setup and reporting:** executable connection flow, visual field mapping, sync progress, richer fuel/quality views and export scope.
4. **Finish and verify:** consistent tokens, readable histories, keyboard/mobile checks, motion and populated-state testing.

Preserve the existing design and working behavior through incremental changes. Do not use a wholesale visual rewrite as a substitute for the workflow work. Publishing the operational workspace is a separate release task after connection, permissions and data behavior are verified.

## Acceptance checks for the redesign

These are proposed checks, not tests claimed to have passed in this audit.

- At 360, 390, 768, 1280 and 1440 px widths, the primary task remains reachable. Test long text and browser text zoom, not only empty screens.
- A manager can identify both vehicles' recorded status, its freshness and the review workload from the overview.
- A register operator can upload multiple files, recover one failure, reopen the saved source, correct an uncertain field and confirm a row without losing work.
- A reviewer can compare actual versus approved details and see the approval/departure order before recording a reasoned decision.
- Explicit overnight dates, missing times and date-only historical entries remain unambiguous in every view.
- Rapid filter changes, refresh, Back, direct links and drill-down/return preserve correct context.
- Every KPI and chart opens the intended filtered records. CSV export uses the same filters and permissions.
- Screen-reader and keyboard checks cover navigation, menus, filters, tables, mobile cards, dialogs, error announcements and focus restoration.
- Loading, empty, no matches, denied access, expired sign-in, failed upload, stale data and recovered connection each have a specific usable state.
- Fixtures used for populated review must be isolated and labeled as test data. They must not appear as live company activity.

## Implementation references

Paths below refer to the project version inspected for this audit; line numbers will move during edits.

| File | Relevant area |
| --- | --- |
| `app/fleet-dashboard.tsx` | Local view/filter state and fetching around lines 178–210; metric definitions around 298; global filters around 704; overview around 834; chart minimum width around 985; uploads around 1307 |
| `app/fleet-workspaces.tsx` | Register correction around 40; permission review around 235; settings around 460; connection controls around 630; advanced mapping and staff access later in the file |
| `app/fleet-ui.tsx` | Shared picker around 74, table and empty states around 109, request helper near the end |
| `app/sample-dashboard.tsx` | Historical navigation/filter state around 157; candidate coloring around 85; comparison dialog near the end |
| `app/workspace.css` | Operational shell and tokens; low-contrast setup descriptions around 758–764 |
| `app/fleet.css` | Shared and historical layout; review dialog/grid around 863–883; mobile review overrides near the end |

Accessibility references: [W3C — Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) supports the text contrast thresholds; [W3C — Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) explains the 24 px AA requirement and exceptions.
