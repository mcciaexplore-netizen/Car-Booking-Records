# Fleet Desk

Interactive dashboard prototype for two company vehicles. All names, trips and costs are samples. No Zoho account is connected. State exists only in React memory and resets on reload. The private Site is intended for the owner to review, not for company operations.

Implemented: overview, two vehicle status panels, booking creation and approval/rejection, departure and return register, fuel entries, permission review decisions with original evidence retained, search, status filters and CSV export. Sample baseline: 5 September 2026, 11:30 IST. New approvals use current IST, so approving a past booking cannot retrospectively authorize an earlier trip.

Run `npm run dev` for development and `npm run build` to build. Core permission and register checks: `node --test lib/fleet.test.ts`.

## Connecting Zoho Creator

Before using real records, replace sample state with authenticated server-side access to Creator forms for Vehicles, Bookings, Trips, Fuel and Review Decisions. Obtain account owner, app link names, form/report field link names and the account data centre from the actual account. Keep OAuth credentials in server secrets. Implement role enforcement in Creator/server endpoints; the demo admin label is not authentication. Recheck vehicle reservations atomically at approval and checkout to prevent concurrent conflicts. Require trustworthy prior approval evidence and an independent gate/key register for actual vehicle movements. Store permission decisions as append-only records. Add photo/receipt storage, retries, idempotency keys and scheduled reconciliation only when configured. A dashboard cannot identify an unreported journey on its own.

Booking references join requests to trips. Both employee and driver are checked separately. Vehicle, departure tolerance (-30/+60 minutes), passenger count and approval timestamp are compared. Missing or mismatched evidence becomes Needs review. Confirmed Unauthorized and Exception accepted outcomes preserve the original result; accepted exceptions never count as prior approval.

## Validation limitations

Browser interaction/visual testing was not requested. Imperative WebMCP navigation and read tools are feature-detected; no supported WebMCP validation context was available during development. They are not required for using the UI.
