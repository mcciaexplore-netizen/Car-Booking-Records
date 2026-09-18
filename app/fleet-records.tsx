'use client';
import {
  ArrowUpRight,
  CarFront,
  FileText,
  ChevronRight,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableRow, TableCell } from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from '@/components/ui/pagination';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Badge,
  DataTable,
  Picker,
  Field,
  fmt,
  money,
  date,
  display,
} from './fleet-ui';
import { ISSUE_LABELS } from '@/lib/reporting';
import { PERMISSIONS } from '@/lib/domain';

export function Pager({ meta, nav }: any) {
  if (!meta) return null;
  return (
    <div className="list-pagination">
      <span>
        {meta.total
          ? `${(meta.page - 1) * meta.pageSize + 1}–${Math.min(meta.page * meta.pageSize, meta.total)}`
          : '0'}{' '}
        of {fmt(meta.total)} records
      </span>
      <Pagination aria-label="Record pages">
        <PaginationContent>
          <PaginationItem>
            <Button
              variant="outline"
              disabled={meta.page <= 1}
              onClick={() => nav.write({ page: String(meta.page - 1) })}
            >
              Previous
            </Button>
          </PaginationItem>
          <PaginationItem>
            <span>
              Page {meta.page} of {meta.pages}
            </span>
          </PaginationItem>
          <PaginationItem>
            <Button
              variant="outline"
              disabled={meta.page >= meta.pages}
              onClick={() => nav.write({ page: String(meta.page + 1) })}
            >
              Next
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
      <Field label="Per page">
        <Picker
          label="Records per page"
          value={String(meta.pageSize)}
          onChange={(v) => nav.write({ pageSize: v, page: null })}
          options={[10, 20, 50].map((n) => ({
            value: String(n),
            label: String(n),
          }))}
        />
      </Field>
    </div>
  );
}
export function RecordToolbar({ nav, kind, count }: any) {
  return (
    <div className="record-toolbar">
      <span className="muted">
        {fmt(count)} matching records · dates in IST
      </span>
      <Field label="Sort by">
        <Picker
          label="Sort records"
          value={nav.sort}
          onChange={(v) => nav.write({ sort: v, page: null })}
          options={[
            { value: 'date', label: 'Date' },
            { value: 'vehicleId', label: 'Vehicle' },
            ...(kind === 'fuel'
              ? [
                  { value: 'amount', label: 'Amount' },
                  { value: 'litres', label: 'Litres' },
                ]
              : [
                  { value: 'employee', label: 'Employee' },
                  ...(kind === 'trips'
                    ? [{ value: 'distance', label: 'Distance' }]
                    : []),
                ]),
          ]}
        />
      </Field>
      <Button
        variant="outline"
        aria-label={
          nav.direction === 'desc'
            ? 'Change to ascending order'
            : 'Change to descending order'
        }
        onClick={() =>
          nav.write({
            direction: nav.direction === 'desc' ? 'asc' : 'desc',
            page: null,
          })
        }
      >
        {nav.direction === 'desc' ? 'Descending ↓' : 'Ascending ↑'}
      </Button>
    </div>
  );
}
export function Provenance({ record }: any) {
  return (
    <details className="provenance">
      <summary>
        <FileText size={13} />
        {record.source ?? 'Zoho'} source
      </summary>
      <dl>
        <dt>Record</dt>
        <dd>{record.sourceId ?? record.id}</dd>
        {record.documentId && (
          <>
            <dt>Document</dt>
            <dd>
              <a
                href={
                  '/api/fleet/document/' + encodeURIComponent(record.documentId)
                }
                target="_blank"
                rel="noreferrer"
              >
                Open original
              </a>
            </dd>
            <dt>Location</dt>
            <dd>
              Page {record.page ?? 'unknown'}, row {record.row ?? 'unknown'}
            </dd>
          </>
        )}
        {record.linkedSourceIds?.length > 0 && (
          <>
            <dt>Linked source records</dt>
            <dd>{record.linkedSourceIds.join(', ')}</dd>
          </>
        )}
      </dl>
    </details>
  );
}
export function TripRecords({ rows, open, filtered = false }: any) {
  return (
    <>
      <div className="desktop-records">
        <DataTable
          headers={[
            'Employee / driver',
            'Vehicle / destination',
            'Journey · IST',
            'Distance',
            'Trip status',
            'Permission',
            'Details',
          ]}
          empty={!rows.length}
          filtered={filtered}
        >
          {rows.map((t: any) => (
            <TableRow key={t.id}>
              <TableCell>
                <b>{display(t.employee)}</b>
                <small>{display(t.driver)}</small>
                <Provenance record={t} />
              </TableCell>
              <TableCell>
                <b>{display(t.vehicleId)}</b>
                <small className="wrap-value">{display(t.destination)}</small>
              </TableCell>
              <TableCell>
                {date(t.departure ?? t.registerDate)}
                <small>Return: {date(t.returnAt)}</small>
              </TableCell>
              <TableCell className="numeric">
                {t.distance == null
                  ? 'Not recorded'
                  : fmt(t.distance, 1) + ' km'}
              </TableCell>
              <TableCell>
                <Badge text={t.tripStatus} />
              </TableCell>
              <TableCell>
                <Badge text={t.permission} />
              </TableCell>
              <TableCell>
                <Button variant="outline" onClick={() => open('trip', t.id)}>
                  Review <ChevronRight size={15} />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
      <div className="mobile-records">
        {!rows.length && (
          <div className="empty-state">
            <strong>
              {filtered ? 'No matching trips' : 'No confirmed trips yet'}
            </strong>
            <p>
              {filtered
                ? 'Clear a filter or widen the date range.'
                : 'Import reports or confirm a register entry.'}
            </p>
          </div>
        )}
        {rows.map((t: any) => (
          <article className="record-card" key={t.id}>
            <div className="section-heading">
              <b>{display(t.vehicleId)}</b>
              <span>{date(t.departure ?? t.registerDate)}</span>
            </div>
            <h3>{display(t.employee)}</h3>
            <p>{display(t.destination)}</p>
            <div className="status-pair">
              <Badge text={t.tripStatus} />
              <Badge text={t.permission} />
            </div>
            <Button variant="outline" onClick={() => open('trip', t.id)}>
              Review trip <ArrowUpRight size={15} />
            </Button>
            <details>
              <summary>Journey and source details</summary>
              <p>Driver: {display(t.driver)}</p>
              <p>Return: {date(t.returnAt)}</p>
              <p>
                Distance:{' '}
                {t.distance == null
                  ? 'Not recorded'
                  : fmt(t.distance, 1) + ' km'}
              </p>
              <Provenance record={t} />
            </details>
          </article>
        ))}
      </div>
    </>
  );
}
export function IssueGroups({ data, nav }: any) {
  return (
    <section className="quality-groups" aria-label="Data quality filters">
      {data.summaries?.issues.map((g: any) => (
        <button
          className={
            'issue-chip ' + (nav.filters.issue === g.key ? 'selected' : '')
          }
          key={g.key}
          onClick={() =>
            nav.setFilters((f: any) => ({
              ...f,
              issue: f.issue === g.key ? '' : g.key,
            }))
          }
          aria-pressed={nav.filters.issue === g.key}
        >
          <span>{ISSUE_LABELS[g.key]}</span>
          <b>{g.count}</b>
        </button>
      ))}
    </section>
  );
}
export function RegisterWorkspace({ data, nav, review = false }: any) {
  const rows = data.trips;
  const aggregate =
    nav.layout === 'monthly' ? data.summaries?.monthly : data.summaries?.daily;
  return (
    <section className="panel records-panel">
      <div className="section-heading">
        <h2>
          {review ? 'Booking-to-register reconciliation' : 'Recorded journeys'}
        </h2>
        <span className="muted">
          {data.metrics.distanceExcluded} distances excluded
        </span>
      </div>
      <div className="saved-views">
        <span>Quick views</span>
        {[
          ['', 'All trips'],
          ['open', 'Open trips'],
          ['review', 'Awaiting review'],
          ['missing', 'Missing details'],
        ].map(([value, label]) => (
          <Button
            key={label}
            variant={nav.filters.metric === value ? 'default' : 'outline'}
            onClick={() =>
              nav.setFilters((f: any) => ({
                ...f,
                metric: value,
                issue: '',
                permission: '',
              }))
            }
          >
            {label}
          </Button>
        ))}
      </div>
      <IssueGroups data={data} nav={nav} />
      {!review && (
        <Tabs
          value={nav.layout}
          onValueChange={(v) => nav.write({ layout: v, page: null })}
        >
          <TabsList aria-label="Register layout">
            <TabsTrigger value="records">Records</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>
          {['daily', 'monthly'].map((mode) => (
            <TabsContent key={mode} value={mode}>
              <div className="period-register">
                {!aggregate?.length && (
                  <p>No recorded journeys in this period.</p>
                )}
                {aggregate?.map((g: any) => (
                  <button
                    className="outcome-row"
                    key={g.key}
                    disabled={g.key === 'Unknown date'}
                    onClick={() => {
                      const start = g.key.length === 7 ? g.key + '-01' : g.key;
                      const end =
                        g.key.length === 7
                          ? g.key +
                            '-' +
                            new Date(
                              Number(g.key.slice(0, 4)),
                              Number(g.key.slice(5, 7)),
                              0,
                            ).getDate()
                          : g.key;
                      nav.setFilters((f: any) => ({
                        ...f,
                        from: start,
                        to: end,
                      }));
                      nav.write({ layout: 'records' });
                    }}
                  >
                    <span>{g.key}</span>
                    <span>
                      {g.count} trips ·{' '}
                      {g.distance == null
                        ? 'Distance unknown'
                        : fmt(g.distance, 1) + ' km'}{' '}
                      · {g.excluded} incomplete
                    </span>
                  </button>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      )}
      {(review || nav.layout === 'records') && (
        <>
          <RecordToolbar
            nav={nav}
            kind="trips"
            count={data.pagination?.trips.total}
          />
          <TripRecords
            rows={rows}
            open={nav.open}
            filtered={Object.values(nav.filters).some(Boolean)}
          />
          <Pager meta={data.pagination?.trips} nav={nav} />
        </>
      )}
      {data.issues.length > 0 && (
        <details className="quality-detail">
          <summary>Odometer checks ({data.issues.length})</summary>
          <p>Differences are investigation prompts, not findings of misuse.</p>
          {data.issues.map((x: any) => (
            <button
              className="outcome-row"
              key={x.tripId + x.message}
              onClick={() => nav.open('trip', x.tripId)}
            >
              {x.message}
              <ArrowUpRight size={14} />
            </button>
          ))}
        </details>
      )}
      {!review && (
        <div className="usage-groups">
          {['employee', 'department'].map((key) => (
            <section key={key}>
              <h3>Usage by {key}</h3>
              {data.summaries?.[key]?.map((g: any) => (
                <button
                  key={g.key}
                  className="outcome-row"
                  onClick={() =>
                    nav.setFilters((f: any) => ({ ...f, [key]: g.key }))
                  }
                >
                  <span>{g.key === '__unknown' ? 'Not recorded' : g.key}</span>
                  <b>{g.count} trips</b>
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
      {review && (
        <p className="metric-footnote">
          Missing approval evidence requires review. An unconfirmed extraction
          cannot establish unauthorized use. Matching rule: {data.ruleVersion}.
        </p>
      )}
    </section>
  );
}
export function BookingWorkspace({ data, nav }: any) {
  return (
    <section className="panel records-panel">
      <div className="section-heading">
        <h2>Zoho booking requests</h2>
        <Badge text="Read-only source" />
      </div>
      <div className="saved-views">
        <Button
          variant={nav.filters.metric === 'no-usage' ? 'outline' : 'default'}
          onClick={() => nav.setFilters((f: any) => ({ ...f, metric: '' }))}
        >
          All bookings
        </Button>
        <Button
          variant={nav.filters.metric === 'no-usage' ? 'default' : 'outline'}
          onClick={() =>
            nav.setFilters((f: any) => ({ ...f, metric: 'no-usage' }))
          }
        >
          No recorded usage · {data.counts.noUsage}
        </Button>
      </div>
      <p className="muted">
        No recorded usage means an approved booking has no linked trip. It does
        not establish a no-show.
      </p>
      <RecordToolbar
        nav={nav}
        kind="bookings"
        count={data.pagination?.bookings.total}
      />
      <div className="desktop-records">
        <DataTable
          headers={[
            'Booking / employee',
            'Vehicle / driver',
            'Departure · IST',
            'Source decision',
            'Approval history',
            'Details',
          ]}
          empty={!data.bookings.length}
          filtered={Object.values(nav.filters).some(Boolean)}
          emptyTitle="No booking requests imported"
          emptyDescription="An administrator can connect the relevant Zoho reports in Settings."
        >
          {data.bookings.map((b: any) => (
            <TableRow key={b.id}>
              <TableCell>
                <b>{display(b.bookingRef ?? b.sourceId)}</b>
                <small>
                  {display(b.employee)} · {display(b.department)}
                </small>
              </TableCell>
              <TableCell>
                {display(b.vehicleId)}
                <small>{display(b.driver)}</small>
              </TableCell>
              <TableCell>
                {date(b.departure ?? b.registerDate)}
                <small>{display(b.destination)}</small>
              </TableCell>
              <TableCell>{display(b.status)}</TableCell>
              <TableCell>
                {data.approvals.some((a: any) =>
                  [b.id, b.bookingRef, b.sourceId].includes(a.bookingRef),
                )
                  ? 'Open timeline'
                  : 'No approval history supplied'}
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  onClick={() => nav.open('booking', b.id)}
                >
                  Details
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
      <div className="mobile-records">
        {!data.bookings.length && <p>No matching booking requests.</p>}
        {data.bookings.map((b: any) => (
          <article className="record-card" key={b.id}>
            <b>
              {display(b.vehicleId)} · {date(b.departure ?? b.registerDate)}
            </b>
            <h3>{display(b.employee)}</h3>
            <p>{display(b.destination)}</p>
            <p>Source decision: {display(b.status)}</p>
            <Button variant="outline" onClick={() => nav.open('booking', b.id)}>
              Booking evidence
            </Button>
          </article>
        ))}
      </div>
      <Pager meta={data.pagination?.bookings} nav={nav} />
    </section>
  );
}
export function FuelWorkspace({ data, nav }: any) {
  const months = data.summaries?.fuelMonths ?? [];
  const selectMonth = (month: string) => {
    if (month === 'Unknown date') return;
    nav.setFilters((f: any) => ({
      ...f,
      from: month + '-01',
      to:
        month +
        '-' +
        new Date(
          Number(month.slice(0, 4)),
          Number(month.slice(5, 7)),
          0,
        ).getDate(),
    }));
  };
  return (
    <section className="panel records-panel">
      <div className="section-heading">
        <h2>Fuel purchases</h2>
        <span>
          {fmt(data.metrics.litres, 2)} L · {money(data.metrics.spend)}
        </span>
      </div>
      <p className="muted">
        Purchases are not consumption. Fuel efficiency:{' '}
        <strong>Insufficient data</strong>. A full-tank or fuel-balance method
        is required.
      </p>
      <div className="saved-views">
        <Button
          variant="ghost"
          onClick={() =>
            nav.setFilters((f: any) => ({
              ...f,
              metric: 'fuel-quantity-missing',
            }))
          }
        >
          {data.metrics.fuelQuantityExcluded} quantities missing
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            nav.setFilters((f: any) => ({
              ...f,
              metric: 'fuel-amount-missing',
            }))
          }
        >
          {data.metrics.fuelAmountExcluded} amounts missing
        </Button>
      </div>
      <div className="report-charts">
        {['litres', 'amount'].map((key) => {
          const max = Math.max(1, ...months.map((g: any) => g[key] ?? 0));
          return (
            <section key={key}>
              <h3>
                {key === 'litres'
                  ? 'Monthly fuel purchased · litres'
                  : 'Monthly fuel spend · INR'}
              </h3>
              {!months.length && (
                <p className="muted">
                  No purchases recorded for these filters.
                </p>
              )}
              {months.map((g: any) => (
                <button
                  key={g.key}
                  className="chart-record"
                  disabled={g.key === 'Unknown date'}
                  onClick={() => selectMonth(g.key)}
                >
                  <span>{g.key}</span>
                  <span className="chart-track">
                    <i style={{ width: ((g[key] ?? 0) / max) * 100 + '%' }} />
                  </span>
                  <b>
                    {g[key] == null
                      ? 'Not recorded'
                      : key === 'amount'
                        ? money(g[key])
                        : fmt(g[key], 2) + ' L'}
                  </b>
                  <small>
                    {key === 'amount' ? g.amountMissing : g.quantityMissing}{' '}
                    missing values
                  </small>
                </button>
              ))}
            </section>
          );
        })}
      </div>
      <details className="quality-detail">
        <summary>Purchases by vehicle</summary>
        {data.summaries?.fuelVehicles.map((g: any) => (
          <button
            key={g.key}
            className="outcome-row"
            onClick={() =>
              nav.setFilters((f: any) => ({ ...f, vehicleId: g.key }))
            }
          >
            <span>
              {g.key === '__unknown' ? 'Vehicle not recorded' : g.key}
            </span>
            <span>
              {fmt(g.litres, 2)} L · {money(g.amount)}
            </span>
          </button>
        ))}
      </details>
      <RecordToolbar
        nav={nav}
        kind="fuel"
        count={data.pagination?.fuel.total}
      />
      <div className="desktop-records">
        <DataTable
          headers={[
            'Purchase date',
            'Vehicle',
            'Litres',
            'Amount',
            'Paid by',
            'Receipt / source',
            'Details',
          ]}
          empty={!data.fuel.length}
          filtered={Object.values(nav.filters).some(Boolean)}
          emptyTitle="No fuel purchases recorded"
          emptyDescription="Upload a fuel receipt or connect the relevant Zoho report."
        >
          {data.fuel.map((f: any) => (
            <TableRow key={f.id}>
              <TableCell>{date(f.registerDate ?? f.departure)}</TableCell>
              <TableCell>{display(f.vehicleId)}</TableCell>
              <TableCell className="numeric">{fmt(f.litres, 2)}</TableCell>
              <TableCell className="numeric">{money(f.amount)}</TableCell>
              <TableCell>{display(f.payer)}</TableCell>
              <TableCell>
                {display(f.receiptRef)}
                <small>{f.source}</small>
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  onClick={() => nav.open('fuel', f.id)}
                >
                  Details
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
      <div className="mobile-records">
        {data.fuel.map((f: any) => (
          <article className="record-card" key={f.id}>
            <b>
              {display(f.vehicleId)} · {date(f.registerDate ?? f.departure)}
            </b>
            <h3>
              {money(f.amount)} · {fmt(f.litres, 2)} L
            </h3>
            <p>Paid by {display(f.payer)}</p>
            <Button variant="outline" onClick={() => nav.open('fuel', f.id)}>
              Receipt and source
            </Button>
          </article>
        ))}
      </div>
      <Pager meta={data.pagination?.fuel} nav={nav} />
      <details className="quality-detail">
        <summary>Maintenance expenses · {data.counts.maintenance}</summary>
        <DataTable
          headers={['Date', 'Vehicle', 'Amount', 'Remarks']}
          empty={!data.maintenance.length}
          emptyTitle="No maintenance expenses recorded"
          emptyDescription="This optional report has no records for the selected filters."
        >
          {data.maintenance.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell>{date(r.registerDate)}</TableCell>
              <TableCell>{display(r.vehicleId)}</TableCell>
              <TableCell>{money(r.amount)}</TableCell>
              <TableCell>{display(r.remarks)}</TableCell>
            </TableRow>
          ))}
        </DataTable>
        <Pager meta={data.pagination?.maintenance} nav={nav} />
      </details>
    </section>
  );
}
export function FleetOverview({ data, nav, drill }: any) {
  const m = data.metrics;
  const metrics = [
    {
      name: 'Recorded trips',
      value: fmt(m.trips),
      help: 'Confirmed, deduplicated trips in the selected filters.',
      view: 'Trip register',
      metric: '',
    },
    {
      name: 'Open trips',
      value: fmt(m.open),
      help: `In progress or overdue, out of ${m.trips} confirmed recorded trips. Trips with insufficient timing evidence are classified separately.`,
      view: 'Trip register',
      metric: 'open',
    },
    {
      name: 'Trips requiring review',
      value: fmt(m.review),
      help: `Missing approval, differing details or insufficient evidence, out of ${m.trips} recorded trips.`,
      view: 'Permission review',
      metric: 'review',
    },
    {
      name: 'Pending image reviews',
      value: fmt(m.pending),
      help: `Documents with unconfirmed rows or no rows yet, out of ${data.counts.documents} retained uploads. Whole workspace; independent of trip filters.`,
      view: 'Register uploads',
      metric: 'pending',
    },
    {
      name: 'Matched prior approval',
      value: fmt(m.matched),
      help: `Trips passing all prior-approval rules, out of ${m.trips} recorded trips.`,
      permission: PERMISSIONS[0],
    },
    {
      name: 'Confirmed unauthorized',
      value: fmt(m.unauthorized),
      help: `Trips with a current human unauthorized-use decision and reason, out of ${m.trips} confirmed recorded trips. Drafts and unresolved findings are excluded.`,
      permission: PERMISSIONS[4],
    },
    {
      name: 'Recorded distance',
      value: m.distance == null ? 'Not recorded' : fmt(m.distance, 1) + ' km',
      help: `Sum of valid confirmed odometer pairs from ${m.trips - m.distanceExcluded} of ${m.trips} trips. ${m.distanceExcluded} trips excluded, not counted as zero.`,
      view: 'Trip register',
      metric: 'distance',
    },
    {
      name: 'Fuel purchased',
      value: m.litres == null ? 'Not recorded' : fmt(m.litres, 2) + ' L',
      help: `Sum of quantities from ${data.counts.fuel - m.fuelQuantityExcluded} of ${data.counts.fuel} filtered purchase records. ${m.fuelQuantityExcluded} missing quantities excluded. Not fuel consumed.`,
      view: 'Fuel & expenses',
      metric: '',
    },
    {
      name: 'Fuel spend',
      value: money(m.spend),
      help: `Sum of INR amounts from ${data.counts.fuel - m.fuelAmountExcluded} of ${data.counts.fuel} filtered purchases. ${m.fuelAmountExcluded} missing amounts excluded.`,
      view: 'Fuel & expenses',
      metric: '',
    },
  ];
  return (
    <div className="overview-content">
      <section className="vehicle-grid" aria-label="Vehicle status">
        {!data.vehicles.length ? (
          <div className="panel compact-empty">
            <CarFront />
            <h2>Vehicle master not imported</h2>
            <p>
              Availability remains unknown until vehicle records and confirmed
              journeys are available.
            </p>
          </div>
        ) : (
          data.vehicles.map((v: any) => (
            <article className="vehicle-panel" key={v.id}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{display(v.registration)}</span>
                  <h2>{display(v.name)}</h2>
                </div>
                <Badge text={v.availability} />
              </div>
              <dl className="vehicle-facts">
                <div>
                  <dt>Recorded employee</dt>
                  <dd>{display(v.current?.employee)}</dd>
                </div>
                <div>
                  <dt>Recorded driver</dt>
                  <dd>{display(v.current?.driver)}</dd>
                </div>
                <div>
                  <dt>Expected return · IST</dt>
                  <dd>{date(v.current?.expectedReturn)}</dd>
                </div>
                <div>
                  <dt>Confirmed odometer</dt>
                  <dd>
                    {v.odometer == null ? 'Unknown' : fmt(v.odometer) + ' km'}
                    <small>
                      {v.odometerAt
                        ? date(v.odometerAt)
                        : 'No confirmed reading'}
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Recorded fuel level</dt>
                  <dd>
                    {v.fuelLevel == null ? 'Unknown' : fmt(v.fuelLevel) + '%'}
                    <small>
                      {v.fuelLevelAt
                        ? date(v.fuelLevelAt)
                        : 'No recorded timestamp'}
                    </small>
                  </dd>
                </div>
              </dl>
              <div className="vehicle-panel-footer">
                <small>
                  Latest evidence: {date(v.recordedAt)} · whole workspace
                </small>
                <Button
                  variant="ghost"
                  onClick={() => nav.open('vehicle', v.id)}
                >
                  Vehicle history <ArrowUpRight size={15} />
                </Button>
              </div>
            </article>
          ))
        )}
      </section>
      <section
        className="metrics primary-metrics"
        aria-label="Operational metrics"
      >
        {metrics.slice(0, 4).map((k) => (
          <article className="metric-card" key={k.name}>
            <button
              onClick={() =>
                drill(k.view ?? 'Trip register', 'metric', k.metric ?? '')
              }
            >
              <span className="metric-label">{k.name}</span>
              <strong>{k.value}</strong>
            </button>
            <details className="metric-help">
              <summary>
                <Info size={13} /> Definition
              </summary>
              <p>{k.help}</p>
            </details>
          </article>
        ))}
      </section>
      <section
        className="secondary-metrics"
        aria-label="Approval and cost metrics"
      >
        {metrics.slice(4).map((k) => (
          <article key={k.name}>
            <button
              onClick={() =>
                drill(
                  k.view ?? 'Trip register',
                  k.permission ? 'permission' : 'metric',
                  k.permission ?? k.metric ?? '',
                )
              }
            >
              <span>{k.name}</span>
              <strong>{k.value}</strong>
            </button>
            <details className="metric-help">
              <summary>Definition</summary>
              <p>{k.help}</p>
              {k.name === 'Recorded distance' && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    drill('Trip register', 'metric', 'distance-missing')
                  }
                >
                  View {m.distanceExcluded} exclusions
                </Button>
              )}
            </details>
          </article>
        ))}
      </section>
      <div className="overview-secondary">
        <section className="panel">
          <div className="section-heading">
            <h2>Needs attention</h2>
            <span className="muted">Recorded evidence</span>
          </div>
          {[
            [
              'overdue',
              'Overdue trips',
              data.summaries.overdue,
              'Trip register',
            ],
            [
              'missing',
              'Missing return or odometer',
              data.summaries.missing,
              'Trip register',
            ],
            ['review', 'Permission review', m.review, 'Permission review'],
            ['pending', 'Image reviews', m.pending, 'Register uploads'],
          ].map(([key, label, count, view]) => (
            <button
              className="outcome-row"
              key={key}
              onClick={() => drill(view, 'metric', key)}
            >
              <span>{label}</span>
              <b>
                {count}
                <ChevronRight size={14} />
              </b>
            </button>
          ))}
        </section>
        <section className="panel">
          <h2>Trips and distance by vehicle</h2>
          {data.summaries.vehicle.length === 0 && (
            <p className="muted">No confirmed trips for these filters.</p>
          )}
          {data.summaries.vehicle.map((g: any) => (
            <button
              key={g.key}
              className="chart-record"
              onClick={() => drill('Trip register', 'vehicleId', g.key)}
            >
              <span>
                {g.key === '__unknown' ? 'Vehicle not recorded' : g.key}
              </span>
              <span className="chart-track">
                <i
                  style={{
                    width: m.trips ? (g.count / m.trips) * 100 + '%' : '0%',
                  }}
                />
              </span>
              <b>{g.count} trips</b>
              <small>
                {g.distance == null
                  ? 'Distance not recorded'
                  : fmt(g.distance, 1) + ' km'}{' '}
                · {g.excluded} excluded
              </small>
            </button>
          ))}
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <h2>Permission outcomes</h2>
          <span className="muted">Of {m.trips} confirmed recorded trips</span>
        </div>
        <div className="outcome-grid">
          {data.summaries.permission.map((g: any) => (
            <button
              key={g.key}
              className="outcome-row"
              onClick={() => drill('Permission review', 'permission', g.key)}
            >
              <Badge text={g.key} />
              <b>{g.count}</b>
            </button>
          ))}
        </div>
      </section>
      <section className="panel records-panel">
        <div className="section-heading">
          <h2>Recent recorded trips</h2>
          <Button variant="ghost" onClick={() => nav.setView('Trip register')}>
            All trips <ArrowUpRight size={15} />
          </Button>
        </div>
        <TripRecords
          rows={data.recentTrips ?? data.trips.slice(0, 5)}
          open={nav.open}
          filtered={Object.values(nav.filters).some(Boolean)}
        />
      </section>
      <p className="metric-footnote">
        Journey dates use departure, or the register date when departure is
        unknown. Fuel uses the recorded purchase date and ignores trip
        permission, issue and trip-only metric filters. Date ranges are
        inclusive in IST. Vehicle panels and pending image reviews describe the
        whole workspace. Fuel economy and utilization remain unavailable without
        sufficient evidence and an agreed schedule.
      </p>
    </div>
  );
}
