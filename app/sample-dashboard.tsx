'use client';
import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import {
  CarFront,
  LayoutDashboard,
  ClipboardList,
  CalendarDays,
  Files,
  ShieldCheck,
  Search,
  Download,
  ArrowUpRight,
  CircleHelp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';

import {
  reconcile,
  summarize,
  outcomes,
  type SampleInput,
  type TripReview,
  type BookingReview,
  type SourceRow,
} from '@/lib/reconcile';
import { csv } from '@/lib/fleet';

const nav = [
  ['Overview', LayoutDashboard],
  ['Actual trips', ClipboardList],
  ['Zoho bookings', CalendarDays],
  ['Image bookings', Files],
  ['Data quality', ShieldCheck],
  ['Sources', Files],
] as const;
type View = (typeof nav)[number][0];
const text = (v: unknown) =>
  v === null || v === undefined || v === '' ? 'Not supplied' : String(v);
const count = (n: number) => n.toLocaleString('en-IN');
const shortDate = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)
    ? new Date(v.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : text(v);
const tones: Record<string, string> = {
  'Exact candidate': 'green',
  'Similar-name candidate': 'blue',
  'Date / vehicle candidate': 'neutral',
  'Multiple candidates': 'amber',
  'No candidate': 'amber',
  'Insufficient date': 'red',
};
function Badge({ value }: { value: string }) {
  return (
    <span className={'badge ' + (tones[value] ?? 'neutral')}>{value}</span>
  );
}
function Picker({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? 'All')}>
      <SelectTrigger aria-label={label} className="min-h-10">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((v) => (
          <SelectItem key={v} value={v}>
            {v}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Grid({
  headers,
  empty,
  children,
}: {
  headers: string[];
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {empty ? (
          <TableRow>
            <TableCell colSpan={headers.length}>
              <div className="empty-state">No records match these filters.</div>
            </TableCell>
          </TableRow>
        ) : (
          children
        )}
      </TableBody>
    </Table>
  );
}
export default function SampleDashboard({ input }: { input: SampleInput }) {
  const records = reconcile(input);
  const [view, setView] = useState<View>('Overview'),
    [query, setQuery] = useState(''),
    [vehicle, setVehicle] = useState('All'),
    [outcome, setOutcome] = useState('All'),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<SourceRow | null>(null);
  const invalidRange = !!(from && to && from > to);
  const matches = (r: SourceRow) =>
    !invalidRange &&
    (vehicle === 'All' || r.vehicle === vehicle) &&
    (!from || (typeof r.dateISO === 'string' && r.dateISO >= from)) &&
    (!to || (typeof r.dateISO === 'string' && r.dateISO <= to)) &&
    (!query || JSON.stringify(r).toLowerCase().includes(query.toLowerCase()));
  const actual = records.actual.filter(
    (r) => matches(r) && (outcome === 'All' || r.outcome === outcome),
  );
  const zoho = records.zoho.filter(matches),
    image = records.imageBookings.filter(matches),
    quality = actual.filter((r) => r.issues.length > 0);
  const stats = summarize(actual);
  const shown =
    view === 'Zoho bookings'
      ? zoho
      : view === 'Image bookings'
        ? image
        : view === 'Data quality'
          ? quality
          : actual;
  const maxPage = Math.max(1, Math.ceil(shown.length / 20)),
    currentPage = Math.min(page, maxPage),
    pageRows = shown.slice((currentPage - 1) * 20, currentPage * 20);
  const current = useRef({ view, actual, zoho, image });
  current.current = { view, actual, zoho, image };
  function navigate(v: View) {
    setView(v);
    setPage(1);
    setOutcome('All');
  }
  function change(fn: () => void) {
    fn();
    setPage(1);
  }
  const distribution = useMemo(
    () =>
      outcomes.map((o) => ({
        label: o,
        count: actual.filter((t) => t.outcome === o).length,
      })),
    [actual],
  );
  function exportData() {
    const p = new URLSearchParams({ view, query, vehicle, outcome, from, to });
    window.location.href = '/api/fleet/historical-export?' + p.toString();
  }
  useEffect(() => {
    const ctx = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => unknown;
        };
      }
    ).modelContext;
    if (!ctx?.registerTool) return;
    const controller = new AbortController();
    try {
      void Promise.resolve(
        ctx.registerTool(
          {
            name: 'read_sample_reconciliation',
            description:
              'Read the currently filtered sample trip reconciliation. Candidate matches do not establish permission.',
            inputSchema: {
              type: 'object',
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: () => ({
              view: current.current.view,
              summary: summarize(current.current.actual),
              trips: current.current.actual,
              zohoBookings: current.current.zoho,
              imageBookings: current.current.image,
            }),
          },
          { signal: controller.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => controller.abort();
  }, []);
  const selectedTrip = selected
    ? records.actual.find((t) => t.id === selected.id)
    : undefined;
  const headerTitle = view === 'Overview' ? 'Your records, reconciled' : view;
  return (
    <SidebarProvider>
      <Sidebar className="fleet-sidebar">
        <SidebarHeader>
          <div className="brand">
            <span className="brand-icon">
              <CarFront size={23} />
            </span>
            <div>
              Fleet Desk<small>COMPANY VEHICLES</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-label">SAMPLE RECONCILIATION</p>
          <SidebarMenu>
            {nav.map(([name, Icon]) => (
              <SidebarMenuItem key={name}>
                <SidebarMenuButton
                  isActive={view === name}
                  onClick={() => navigate(name)}
                >
                  <Icon />
                  <span>{name}</span>
                  {name === 'Actual trips' && (
                    <span className="nav-count">374</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="connection">
            Three supplied files<small>Imported 8 September 2026</small>
            <small>Automatic Zoho sync not connected</small>
          </div>
          <a className="profile" href="/demo">
            <span className="avatar">FD</span>
            <div>
              Try workflow demo<small>Separate fictitious records</small>
            </div>
            <ArrowUpRight size={16} />
          </a>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <span>
              Fleet Desk <span className="slash">/</span>
              {view}
            </span>
          </div>
          <span className="demo-label">SUPPLIED SAMPLES</span>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">ZOHO REQUESTS + REGISTER RECORDS</p>
              <h1>{headerTitle}</h1>
              <p className="muted">
                Innova and Ertiga · Historical records, not live vehicle status
              </p>
            </div>
            {view !== 'Sources' && (
              <Button
                variant="outline"
                onClick={exportData}
                disabled={!shown.length}
              >
                <Download />
                Export {view === 'Overview' ? 'trips' : 'view'}
              </Button>
            )}
          </div>
          <div className="sample-evidence">
            <ShieldCheck size={20} />
            <div>
              <b>Booking candidates are not approval confirmation.</b>
              <p>
                Zoho provides “Assigned” status, but no approval timestamp. The
                register has no actual departure times or shared booking IDs.
              </p>
            </div>
          </div>
          {view !== 'Sources' && (
            <>
              <div className="sample-filters">
                <div className="search-box">
                  <Search size={18} />
                  <Input
                    aria-label="Search records"
                    placeholder="Search name, place or row…"
                    value={query}
                    onChange={(e) => change(() => setQuery(e.target.value))}
                  />
                </div>
                <Picker
                  label="Vehicle"
                  value={vehicle}
                  onChange={(v) => change(() => setVehicle(v))}
                  options={['All', 'Innova', 'Ertiga', 'TUV']}
                />
                <label>
                  From
                  <Input
                    type="date"
                    aria-label="From date"
                    value={from}
                    onChange={(e) => change(() => setFrom(e.target.value))}
                  />
                </label>
                <label>
                  To
                  <Input
                    type="date"
                    aria-label="To date"
                    value={to}
                    onChange={(e) => change(() => setTo(e.target.value))}
                  />
                </label>
                {['Actual trips', 'Data quality'].includes(view) && (
                  <Picker
                    label="Candidate result"
                    value={outcome}
                    onChange={(v) => change(() => setOutcome(v))}
                    options={['All', ...outcomes]}
                  />
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setVehicle('All');
                    setQuery('');
                    setFrom('');
                    setTo('');
                    setOutcome('All');
                    setPage(1);
                  }}
                >
                  Clear
                </Button>
              </div>
              {invalidRange && (
                <p className="form-error mb-4" role="alert">
                  The end date must be on or after the start date.
                </p>
              )}
              {(from || to) && (
                <p className="muted mb-4">
                  Date filters use the original recorded dates and exclude
                  undated rows. Flagged dates have not been corrected.
                </p>
              )}
            </>
          )}
          {view === 'Overview' && (
            <>
              <section className="metrics">
                <Metric
                  label="Actual register rows"
                  value={count(stats.rows)}
                  detail="Consolidated duplicates excluded"
                  onClick={() => navigate('Actual trips')}
                />
                <Metric
                  label="Exact booking candidates"
                  value={count(stats.outcomes['Exact candidate'])}
                  detail="Same name, date and vehicle"
                  onClick={() => {
                    navigate('Actual trips');
                    setOutcome('Exact candidate');
                  }}
                />
                <Metric
                  label="Odometer distance"
                  value={count(stats.distance) + ' km'}
                  detail={`${stats.distanceRows} valid pairs · ${stats.rows - stats.distanceRows} missing`}
                />
                <Metric
                  label="Dates to check"
                  value={count(stats.dateReview)}
                  detail="Missing dates or month conflicts"
                  onClick={() => {
                    navigate('Data quality');
                    setOutcome('Insufficient date');
                  }}
                />
              </section>
              <div className="section-heading">
                <h2>Two vehicles, one register</h2>
                <span className="muted">Historical sample coverage</span>
              </div>
              <section className="vehicle-grid">
                {['Innova', 'Ertiga'].map((v) => {
                  const rows = actual.filter((t) => t.vehicle === v),
                    s = summarize(rows),
                    dates = rows
                      .map((r) => r.dateISO)
                      .filter((x): x is string => !!x)
                      .sort();
                  return (
                    <article className="vehicle" key={v}>
                      <div className="vehicle-heading">
                        <div className="vehicle-icon">
                          <CarFront size={30} />
                        </div>
                        <div>
                          <h3>{v}</h3>
                          <span className="muted">
                            {count(s.rows)} register rows
                          </span>
                        </div>
                        <Badge value="Live status unknown" />
                      </div>
                      <div className="vehicle-route">
                        <strong>{count(s.distance)} km</strong>
                        <span className="muted">
                          {dates.length
                            ? shortDate(dates[0]) +
                              ' to ' +
                              shortDate(dates[dates.length - 1])
                            : 'No dated records in this filter'}
                        </span>
                        <span className="muted">
                          {s.outcomes['Exact candidate']} exact candidates ·{' '}
                          {s.missingDriver} missing driver names
                        </span>
                      </div>
                      <div className="vehicle-footer">
                        <span>Fuel spend: not supplied</span>
                        <Button
                          variant="ghost"
                          onClick={() => {
                            navigate('Actual trips');
                            setVehicle(v);
                          }}
                        >
                          View records
                          <ArrowUpRight />
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </section>
              <div className="bottom-grid">
                <section className="panel">
                  <div className="section-heading">
                    <h2>Booking comparison</h2>
                    <span className="muted">
                      {count(actual.length)} actual rows
                    </span>
                  </div>
                  <div className="outcome-bars">
                    {distribution.map((d) => (
                      <button
                        key={d.label}
                        onClick={() => {
                          navigate('Actual trips');
                          setOutcome(d.label);
                        }}
                      >
                        <span>{d.label}</span>
                        <div>
                          <i
                            style={{
                              width:
                                (actual.length
                                  ? (d.count / actual.length) * 100
                                  : 0) + '%',
                            }}
                          />
                        </div>
                        <b>{d.count}</b>
                      </button>
                    ))}
                  </div>
                  <p className="muted mt-4">
                    Similar names are suggestions. Date/car-only candidates have
                    no name agreement.
                  </p>
                </section>
                <section className="panel">
                  <div className="section-heading">
                    <h2>Evidence gaps</h2>
                    <CircleHelp size={19} />
                  </div>
                  <div className="gap-list">
                    <div>
                      <span>Prior approval</span>
                      <b>Not evidenced</b>
                    </div>
                    <div>
                      <span>Missing driver</span>
                      <b>{stats.missingDriver} rows</b>
                    </div>
                    <div>
                      <span>Missing employee</span>
                      <b>{stats.missingEmployee} rows</b>
                    </div>
                    <div>
                      <span>Odometer differences</span>
                      <b>{stats.odoDiscrepancies} rows</b>
                    </div>
                    <div>
                      <span>Fuel and receipt data</span>
                      <b>Not supplied</b>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="mt-5"
                    onClick={() => navigate('Data quality')}
                  >
                    Inspect data quality
                    <ArrowUpRight />
                  </Button>
                </section>
              </div>
              <section className="panel bookings-panel mt-6">
                <div className="section-heading">
                  <div>
                    <h2>Across your three sources</h2>
                    <p className="muted">
                      Booking records are never counted as actual trips.
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => navigate('Sources')}>
                    Source details
                    <ArrowUpRight />
                  </Button>
                </div>
                <div className="source-totals">
                  <button onClick={() => navigate('Zoho bookings')}>
                    <strong>{zoho.length}</strong>
                    <span>Zoho requests in filter</span>
                  </button>
                  <button onClick={() => navigate('Image bookings')}>
                    <strong>{image.length}</strong>
                    <span>Image booking rows in filter</span>
                  </button>
                  <button onClick={() => navigate('Image bookings')}>
                    <strong>
                      {image.filter((r) => r.zohoRefs.length).length}
                    </strong>
                    <span>Image rows with exact Zoho counterparts</span>
                  </button>
                </div>
                <p className="muted mt-4">
                  The full import excludes 144 repeated consolidated rows and
                  retains 23 historical TUV bookings outside the current two-car
                  fleet.
                </p>
              </section>
            </>
          )}
          {[
            'Actual trips',
            'Data quality',
            'Zoho bookings',
            'Image bookings',
          ].includes(view) && (
            <section className="panel bookings-panel">
              <div className="section-heading">
                <div>
                  <h2>{count(shown.length)} records</h2>
                  <p className="muted">
                    Open a row to see its source and comparison evidence.
                  </p>
                </div>
              </div>
              {['Actual trips', 'Data quality'].includes(view) ? (
                <Grid
                  headers={[
                    'Employee / source',
                    'Vehicle / driver',
                    'Recorded dates',
                    'Distance',
                    'Candidate result',
                    'Details',
                  ]}
                  empty={!pageRows.length}
                >
                  {(pageRows as TripReview[]).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>
                        <b>{text(t.employee)}</b>
                        <small>
                          {t.sheet} row {t.row}
                        </small>
                        <small>{text(t.destination)}</small>
                      </TableCell>
                      <TableCell>
                        {text(t.vehicle)}
                        <small>{text(t.driver)}</small>
                      </TableCell>
                      <TableCell>
                        {shortDate(t.dateISO)}
                        {t.dateUncertain && (
                          <small className="form-error">
                            Date needs review
                          </small>
                        )}
                        <small>
                          {t.returnISO
                            ? 'Return: ' + shortDate(t.returnISO)
                            : 'Return date not supplied'}
                        </small>
                      </TableCell>
                      <TableCell>
                        {t.distance === null
                          ? 'Not supplied'
                          : count(t.distance) + ' km'}
                        <small>Reported: {text(t.reportedKm)} km</small>
                      </TableCell>
                      <TableCell>
                        <Badge value={t.outcome} />
                        {view === 'Data quality' && (
                          <small>{t.issues.join(' · ')}</small>
                        )}
                        {t.sharedCandidate && (
                          <small>Candidate shared by multiple trip rows</small>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          onClick={() => setSelected(t)}
                        >
                          Review
                          <ArrowUpRight />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </Grid>
              ) : (
                <Grid
                  headers={[
                    'Employee / source',
                    'Vehicle / driver',
                    'Travel date',
                    'Destination / purpose',
                    'Source status',
                    'Cross-reference',
                    'Details',
                  ]}
                  empty={!pageRows.length}
                >
                  {pageRows.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell>
                        <b>{text(b.employee)}</b>
                        <small>
                          {b.sheet} row {b.row}
                        </small>
                      </TableCell>
                      <TableCell>
                        {text(b.vehicle)}
                        <small>{text(b.driver)}</small>
                      </TableCell>
                      <TableCell>
                        {shortDate(b.dateISO)}
                        {view === 'Zoho bookings' && (
                          <small>{text(b.startTime)}</small>
                        )}
                      </TableCell>
                      <TableCell>
                        {text(b.company)}
                        <small>{text(b.destination)}</small>
                      </TableCell>
                      <TableCell>
                        <Badge value={text(b.status)} />
                        <small>Approval time not supplied</small>
                      </TableCell>
                      <TableCell>
                        {view === 'Zoho bookings' ? (
                          <>
                            <span>
                              {(b as BookingReview).tripRefs.length} name-based
                              trip candidates
                            </span>
                            <small>
                              {(b as BookingReview).imageRefs.length}{' '}
                              image-booking counterparts
                            </small>
                          </>
                        ) : (
                          <span>
                            {(b.zohoRefs as string[]).length} exact Zoho
                            counterparts
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          onClick={() => setSelected(b)}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </Grid>
              )}
              <div className="pager">
                <span>
                  {shown.length
                    ? `${(currentPage - 1) * 20 + 1}–${Math.min(currentPage * 20, shown.length)} of ${shown.length}`
                    : '0 records'}
                </span>
                <div>
                  <Button
                    aria-label="Previous page"
                    variant="outline"
                    disabled={currentPage === 1}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <ChevronLeft />
                  </Button>
                  <span>
                    Page {currentPage} / {maxPage}
                  </span>
                  <Button
                    aria-label="Next page"
                    variant="outline"
                    disabled={currentPage === maxPage}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </section>
          )}
          {view === 'Sources' && (
            <div className="source-panels">
              <section className="panel">
                <h2>Files supplied by you</h2>
                {input.sources.map((s, i) => (
                  <article className="source-file" key={s.file}>
                    <Files size={24} />
                    <div>
                      <h3>{s.file}</h3>
                      <p className="muted">
                        {i === 2
                          ? 'Zoho Creator export'
                          : i === 1
                            ? 'Booking records derived from images'
                            : 'Actual-trip records derived from images'}
                      </p>
                      <p>
                        {i === 2
                          ? '369 request rows, including 23 TUV records.'
                          : i === 1
                            ? '332 booking rows; 306 have exact name/date/car/company counterparts in Zoho.'
                            : '374 detailed trip rows. All 144 consolidated rows are copies, excluded from totals.'}
                      </p>
                    </div>
                  </article>
                ))}
              </section>
              <section className="panel">
                <h2>How this comparison works</h2>
                <ol className="method-list">
                  <li>
                    Use only the Innova and Ertiga detail sheets for actual trip
                    counts. Pivot summaries, totals and blank/formula-only rows
                    are excluded.
                  </li>
                  <li>
                    Vehicle identity comes from the sheet label because parts of
                    the Ertiga vehicle column contain lookup dates or errors.
                  </li>
                  <li>
                    Keep original dates. Six missing dates and seven
                    section/month conflicts are withheld from candidate
                    matching. No day/month swaps are applied.
                  </li>
                  <li>
                    Search Zoho for the same recorded date and vehicle. Rank
                    exact employee names first, then spelling or partial-name
                    suggestions. Other same-day requests remain weak context
                    only.
                  </li>
                  <li>
                    Link image booking rows by exact normalized name, travel
                    date, vehicle and company. These corroborate a request, not
                    a journey or approval.
                  </li>
                  <li>
                    Count distance from valid odometer pairs. Preserve the
                    reported distance alongside it: 54,070 km calculated versus
                    54,072 km reported, with one missing pair.
                  </li>
                  <li>
                    Keep “Assigned,” “Not Requested” and “Drive Requested” as
                    source labels. They are not converted into verified
                    authorization.
                  </li>
                </ol>
              </section>
              <section className="panel">
                <h2>What is still missing</h2>
                <p className="muted mt-3">
                  Approval decisions and timestamps, shared booking IDs, actual
                  departure times, original images, fuel purchases, receipts and
                  live availability. The files are imported snapshots; no
                  automatic Zoho sync or image extraction service is connected.
                  OTP codes and internal account identifiers are omitted from
                  this dashboard.
                </p>
              </section>
            </div>
          )}
          <footer className="page-footer">
            Fleet Desk · Supplied sample records
            <span>Imported 8 September 2026 · Original files unchanged</span>
          </footer>
        </div>
      </main>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[88dvh] overflow-y-auto p-6">
          <DialogTitle className="text-xl">
            {selectedTrip ? 'Trip evidence' : 'Source record'} · {selected?.id}
          </DialogTitle>
          <DialogDescription>
            {selected?.source} · {selected?.sheet} · row {selected?.row}.
            Original register images were not supplied.
          </DialogDescription>
          {selectedTrip ? (
            <>
              <div className="evidence-grid">
                <section>
                  <h3>Register entry</h3>
                  <dl>
                    <Detail label="Employee" value={selectedTrip.employee} />
                    <Detail label="Driver" value={selectedTrip.driver} />
                    <Detail label="Vehicle" value={selectedTrip.vehicle} />
                    <Detail
                      label="Original departure date"
                      value={selectedTrip.date}
                    />
                    <Detail
                      label="Original return date"
                      value={selectedTrip.returnDate}
                    />
                    <Detail
                      label="Destination"
                      value={selectedTrip.destination}
                    />
                    <Detail
                      label="Start / end odometer"
                      value={`${text(selectedTrip.startKm)} / ${text(selectedTrip.endKm)}`}
                    />
                    <Detail
                      label="Source status"
                      value={selectedTrip.sourceStatus}
                    />
                  </dl>
                  <p className="muted mt-3">
                    {selectedTrip.consolidatedRefs.length
                      ? 'Also appears in ' +
                        selectedTrip.consolidatedRefs.join(', ')
                      : 'No consolidated duplicate.'}
                  </p>
                </section>
                <section>
                  <h3>Comparison result</h3>
                  <div className="my-3">
                    <Badge value={selectedTrip.outcome} />
                  </div>
                  <p className="muted">
                    Prior approval cannot be established without approval
                    evidence and actual departure time.
                  </p>
                  {selectedTrip.issues.length > 0 && (
                    <ul className="issue-list">
                      {selectedTrip.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  )}
                  {selectedTrip.sharedCandidate && (
                    <p className="muted mt-3">
                      A candidate appears against multiple trip rows. These may
                      be journey legs; no one-to-one match is assumed.
                    </p>
                  )}
                </section>
              </div>
              <h3 className="mt-3">
                Zoho booking candidates ({selectedTrip.candidates.length})
              </h3>
              {!selectedTrip.candidates.length && (
                <p className="muted">
                  {selectedTrip.dateUncertain
                    ? 'Correct or confirm the departure date before comparing.'
                    : 'No request with the same date and vehicle was found in the supplied Zoho export.'}
                </p>
              )}
              {selectedTrip.candidates.map((c) => {
                const b = records.zoho.find((b) => b.id === c.id)!;
                return (
                  <section className="candidate" key={c.id}>
                    <div className="section-heading">
                      <h3>{text(b.employee)}</h3>
                      <Badge value={c.basis} />
                    </div>
                    <p className="muted">
                      Zoho row {b.row} · {text(b.vehicle)} ·{' '}
                      {shortDate(b.dateISO)} · Driver: {text(b.driver)}
                    </p>
                    <p>
                      {text(b.company)} · {text(b.destination)}
                    </p>
                    <p className="muted">
                      Status: {text(b.status)} · Requested:{' '}
                      {text(b.requestedAt)} · Planned start: {text(b.startTime)}
                    </p>
                    <p className="muted">
                      {b.imageRefs.length
                        ? `Also found in ${b.imageRefs.join(', ')}.`
                        : 'No exact image-booking counterpart.'}{' '}
                      Request time is not approval time.
                    </p>
                  </section>
                );
              })}
            </>
          ) : (
            selected && (
              <>
                <dl className="record-detail">
                  {Object.entries(selected)
                    .filter(
                      ([key]) =>
                        ![
                          'id',
                          'source',
                          'sheet',
                          'row',
                          'issues',
                          'imageRefs',
                          'tripRefs',
                          'zohoRefs',
                        ].includes(key),
                    )
                    .map(([key, value]) => (
                      <Detail
                        key={key}
                        label={key.replace(/([A-Z])/g, ' $1')}
                        value={value}
                      />
                    ))}
                </dl>
                {'issues' in selected &&
                  (selected.issues as string[]).length > 0 && (
                    <ul className="issue-list">
                      {(selected.issues as string[]).map((v) => (
                        <li key={v}>{v}</li>
                      ))}
                    </ul>
                  )}
                <p className="muted">
                  References:{' '}
                  {[
                    ...((selected.imageRefs as string[]) ?? []),
                    ...((selected.tripRefs as string[]) ?? []),
                    ...((selected.zohoRefs as string[]) ?? []),
                  ].join(', ') || 'No linked records'}
                </p>
              </>
            )
          )}
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
function Metric({
  label,
  value,
  detail,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  onClick?: () => void;
}) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      {onClick ? (
        <button className="metric-link" onClick={onClick}>
          <strong>{value}</strong>
          <ArrowUpRight size={18} />
        </button>
      ) : (
        <strong>{value}</strong>
      )}
      <small>{detail}</small>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{text(value)}</dd>
    </div>
  );
}
