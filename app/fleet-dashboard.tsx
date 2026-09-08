'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  CarFront,
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Fuel,
  ShieldCheck,
  Upload,
  Settings,
  RefreshCw,
  ArrowUpRight,
  Download,
  AlertCircle,
  ChevronRight,
  LogOut,
  LockKeyhole,
  Bell,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { TableRow, TableCell } from '@/components/ui/table';
import { PERMISSIONS, type Trip } from '@/lib/domain';
import {
  api,
  Badge,
  Picker,
  DataTable,
  Field,
  fmt,
  money,
  date,
  display,
} from './fleet-ui';
import {
  RegisterReview,
  PermissionReview,
  SettingsPanel,
} from './fleet-workspaces';

const NAV = [
  ['Overview', LayoutDashboard],
  ['Bookings', CalendarDays],
  ['Trip register', ClipboardList],
  ['Fuel & expenses', Fuel],
  ['Permission review', ShieldCheck],
  ['Register uploads', Upload],
  ['Alerts', Bell],
  ['Settings', Settings],
] as const;
type View = (typeof NAV)[number][0];
export default function Dashboard() {
  const [view, setView] = useState<View>('Overview'),
    [data, setData] = useState<any>(null),
    [filters, setFilters] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [auth, setAuth] = useState(0),
    [alerts, setAlerts] = useState<any[]>([]),
    [rowId, setRowId] = useState<string | null>(null),
    [tripId, setTripId] = useState<string | null>(null),
    [uploadKind, setUploadKind] = useState('movement');
  const query = new URLSearchParams(
    Object.entries(filters).filter(([, v]) => v),
  ).toString();
  const load = useCallback(async () => {
    try {
      setData(await api('snapshot?' + query));
      setAuth(0);
    } catch (e: any) {
      setError(e.message);
      setAuth(e.status ?? 0);
      if (e.status === 401 || e.status === 403) setData(null);
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => void load(), 60000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (view === 'Alerts')
      api('alerts')
        .then((s) => setAlerts(s.alerts))
        .catch((e) => setError(e.message));
  }, [view]);
  const role = data?.user?.role,
    canUpload = ['Administrator', 'Manager', 'Register operator'].includes(
      role ?? '',
    ),
    canReview = ['Administrator', 'Manager'].includes(role ?? ''),
    admin = role === 'Administrator';
  const run = async (work: () => Promise<any>, message = 'Saved.') => {
    setBusy(true);
    setError('');
    try {
      await work();
      await load();
      setNotice(message);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  function filter(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
  }
  function drill(next: View, key?: string, value?: string) {
    setView(next);
    setFilters((f) => {
      const next = { ...f };
      delete next.metric;
      delete next.permission;
      if (key) next[key] = value ?? '';
      return next;
    });
  }
  async function sync() {
    await run(async () => {
      await api('sync', { mode: 'full' });
      for (let i = 0; i < 10000; i++) {
        const result = await api('sync', { step: true });
        await load();
        if (result.done || result.retryAt || result.error || result.busy) break;
      }
    }, 'Synchronization status updated.');
  }
  useEffect(() => {
    if (view !== 'Register uploads' || !canUpload) return;
    const pending =
      data?.documents?.filter((d: any) => d.status === 'extracting') ?? [];
    if (!pending.length) return;
    const timer = setInterval(() => {
      void (async () => {
        try {
          for (const doc of pending.slice(0, 3))
            await api('poll/' + doc.id, {});
          await load();
        } catch (e: any) {
          setError(e.message);
        }
      })();
    }, 8000);
    return () => clearInterval(timer);
  }, [view, data?.documents, canUpload, load]);
  const m = data?.metrics ?? {},
    fresh = data?.freshness,
    rows = data?.trips ?? [];
  const kpis = [
    [
      'Recorded trips',
      fmt(m.trips),
      'Confirmed, deduplicated records',
      'Trip register',
      'metric',
      '',
    ],
    [
      'Matched prior approval',
      fmt(m.matched),
      `Of ${fmt(m.trips)} recorded trips`,
      'Trip register',
      'permission',
      PERMISSIONS[0],
    ],
    [
      'Trips requiring review',
      fmt(m.review),
      'Missing or conflicting evidence',
      'Permission review',
      'metric',
      'review',
    ],
    [
      'Confirmed unauthorized',
      fmt(m.unauthorized),
      'Human decision with a reason',
      'Permission review',
      'permission',
      PERMISSIONS[4],
    ],
    [
      'Recorded distance',
      fmt(m.distance, 1) + ' km',
      `${fmt(m.distanceExcluded)} trips excluded`,
      'Trip register',
      'metric',
      'distance',
    ],
    [
      'Fuel purchased',
      fmt(m.litres, 2) + ' L',
      `${fmt(m.fuelQuantityExcluded)} quantities missing`,
      'Fuel & expenses',
    ],
    [
      'Fuel spend',
      money(m.spend),
      `${fmt(m.fuelAmountExcluded)} amounts missing`,
      'Fuel & expenses',
    ],
    [
      'Open trips',
      fmt(m.open),
      'In progress or overdue',
      'Trip register',
      'metric',
      'open',
    ],
    [
      'Pending image reviews',
      fmt(m.pending),
      'Documents awaiting confirmation',
      'Register uploads',
    ],
  ];
  const tripTable = (items: Trip[]) => (
    <DataTable
      headers={[
        'Employee & source',
        'Vehicle / destination',
        'Recorded journey · IST',
        'Distance',
        'Trip status',
        'Permission',
        '',
      ]}
      empty={!items.length}
    >
      {items.map((t) => (
        <TableRow key={t.id}>
          <TableCell>
            <b>{display(t.employee)}</b>
            <small>
              {display(t.driver)} · {t.source}
            </small>
          </TableCell>
          <TableCell>
            <b>{display(t.vehicleId)}</b>
            <small>{display(t.destination)}</small>
          </TableCell>
          <TableCell>
            {date(t.departure)}
            <small>Return: {date(t.returnAt)}</small>
          </TableCell>
          <TableCell>{fmt(t.distance, 1)} km</TableCell>
          <TableCell>
            <Badge text={t.tripStatus ?? 'Incomplete information'} />
          </TableCell>
          <TableCell>
            <Badge text={t.permission ?? PERMISSIONS[3]} />
          </TableCell>
          <TableCell>
            <Button
              variant="ghost"
              onClick={() => setTripId(t.id)}
              aria-label={`Inspect trip for ${t.employee ?? 'unknown employee'}`}
            >
              <ChevronRight />
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </DataTable>
  );
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
          <p className="nav-label">WORKSPACE</p>
          <SidebarMenu>
            {NAV.filter(([v]) => v !== 'Settings' || admin).map(([v, Icon]) => (
              <SidebarMenuItem key={v}>
                <SidebarMenuButton
                  isActive={view === v}
                  onClick={() => setView(v)}
                >
                  <Icon />
                  <span>{v}</span>
                  {v === 'Permission review' && m.review > 0 && (
                    <span className="nav-count">{m.review}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="connection">
            <span
              className={
                'connection-dot ' + (fresh?.connected ? 'connected' : '')
              }
            />
            {fresh?.connected
              ? 'Zoho connection configured'
              : 'Zoho not connected'}
            <small>
              {fresh?.lastSuccess
                ? 'Last sync: ' + date(fresh.lastSuccess)
                : 'Awaiting first successful import'}
            </small>
          </div>
          <div className="profile">
            <span className="avatar">
              <LockKeyhole size={16} />
            </span>
            <div>
              {data?.user?.name ?? 'Private workspace'}
              <small>{role ?? 'Sign-in required'}</small>
            </div>
            {data && (
              <a
                href="/signout-with-chatgpt?return_to=/"
                target="_top"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </a>
            )}
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace">
        <header className="topbar">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <span>
              Workspace <span className="slash">/</span>
              {view}
            </span>
          </div>
          <span className="demo-label">
            <LockKeyhole size={13} /> PRIVATE · IST
          </span>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <h1>{view}</h1>
              <p className="muted">
                {view === 'Overview'
                  ? 'A clear record of permission, journeys and vehicle costs.'
                  : view === 'Register uploads'
                    ? 'Keep the original. Check the handwriting. Confirm the record.'
                    : view === 'Permission review'
                      ? 'Review the evidence before making a permission decision.'
                      : 'Company vehicle records · India Standard Time'}
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {data &&
                [
                  'Trip register',
                  'Fuel & expenses',
                  'Bookings',
                  'Permission review',
                ].includes(view) && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      window.location.href =
                        '/api/fleet/export?' +
                        query +
                        '&type=' +
                        (view === 'Fuel & expenses'
                          ? 'fuel'
                          : view === 'Bookings'
                            ? 'bookings'
                            : 'trips');
                    }}
                  >
                    <Download />
                    Export CSV
                  </Button>
                )}
              {admin && (
                <Button
                  variant="outline"
                  disabled={busy || !fresh?.connected}
                  onClick={sync}
                >
                  <RefreshCw className={busy ? 'spin' : ''} />
                  Sync now
                </Button>
              )}
              {canUpload && (
                <Button
                  className="primary-action"
                  onClick={() => setView('Register uploads')}
                >
                  <Upload />
                  Upload registers
                </Button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="error-banner">
              <AlertCircle size={18} />
              <span>{error}</span>
              <Button variant="ghost" onClick={() => setError('')}>
                Dismiss
              </Button>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              {notice}
            </div>
          )}
          {!data && (
            <section className="panel sign-in">
              <LockKeyhole size={32} />
              <h2>
                {loading
                  ? 'Loading your private workspace'
                  : auth === 403
                    ? 'Access has not been granted'
                    : 'Your fleet records stay private'}
              </h2>
              <p className="muted">
                {loading
                  ? 'Checking your account and retrieving saved records.'
                  : auth === 403
                    ? 'Ask the Fleet Desk administrator to add your account.'
                    : 'Sign in with an authorized account to view records, attachments and reports.'}
              </p>
              {!loading && auth !== 403 && (
                <a
                  className="signin-link"
                  href="/signin-with-chatgpt?return_to=/"
                  target="_top"
                >
                  Sign in with ChatGPT <ArrowUpRight size={16} />
                </a>
              )}
              {!loading && (
                <Button variant="outline" onClick={() => void load()}>
                  Retry connection
                </Button>
              )}
            </section>
          )}
          {data && (
            <>
              {(!fresh.connected ||
                !fresh.lastSuccess ||
                fresh.stale ||
                ['failed', 'retrying'].includes(fresh.sync?.status)) && (
                <div className="status-banner">
                  <AlertCircle size={18} />
                  <div>
                    <strong>
                      {!fresh.connected
                        ? 'Ready for your real records'
                        : fresh.stale
                          ? 'Zoho data may be stale'
                          : fresh.sync?.status === 'failed'
                            ? 'Synchronization needs attention'
                            : 'Waiting for the first complete import'}
                    </strong>
                    <p>
                      {fresh.lastSuccess
                        ? `Last successful sync: ${date(fresh.lastSuccess)} IST. Existing records remain available.`
                        : 'Zoho data has not been imported. No sample trips, permissions or expenses are included.'}
                    </p>
                  </div>
                  {admin && (
                    <Button variant="ghost" onClick={() => setView('Settings')}>
                      Connection settings <ArrowUpRight />
                    </Button>
                  )}
                </div>
              )}
              {fresh.sync?.status === 'syncing' && (
                <div className="notice" role="status">
                  Syncing · {fresh.sync.count} records staged across{' '}
                  {fresh.sync.pages} pages. The last complete import stays
                  visible.
                </div>
              )}
              {[
                'Overview',
                'Bookings',
                'Trip register',
                'Fuel & expenses',
                'Permission review',
              ].includes(view) && (
                <section
                  className="global-filters"
                  aria-label="Global record filters"
                >
                  <Field label="From">
                    <Input
                      aria-label="Start date"
                      type="date"
                      value={filters.from ?? ''}
                      onChange={(e) => filter('from', e.target.value)}
                    />
                  </Field>
                  <Field label="To">
                    <Input
                      aria-label="End date"
                      type="date"
                      value={filters.to ?? ''}
                      onChange={(e) => filter('to', e.target.value)}
                    />
                  </Field>
                  <Field label="Vehicle">
                    <Picker
                      label="Filter vehicle"
                      value={filters.vehicleId ?? ''}
                      onChange={(v) => filter('vehicleId', v)}
                      options={[
                        { value: '', label: 'All vehicles' },
                        ...data.vehicles.map((v: any) => ({
                          value: v.registration ?? v.id,
                          label: v.registration ?? v.name ?? v.id,
                        })),
                      ]}
                    />
                  </Field>
                  <Field label="Employee">
                    <Input
                      placeholder="All employees"
                      value={filters.employee ?? ''}
                      onChange={(e) => filter('employee', e.target.value)}
                    />
                  </Field>
                  <details className="more-filters">
                    <summary>
                      More filters (
                      {Object.values(filters).filter(Boolean).length})
                    </summary>
                    <div className="expanded-filters">
                      {['driver', 'department'].map((k) => (
                        <Field key={k} label={k}>
                          <Input
                            value={filters[k] ?? ''}
                            onChange={(e) => filter(k, e.target.value)}
                            placeholder={'All ' + k + 's'}
                          />
                        </Field>
                      ))}
                      <Field label="Permission">
                        <Picker
                          label="Permission status"
                          value={filters.permission ?? ''}
                          onChange={(v) => filter('permission', v)}
                          options={[
                            { value: '', label: 'All permission outcomes' },
                            ...PERMISSIONS.map((p) => ({ value: p, label: p })),
                          ]}
                        />
                      </Field>
                      <Field label="Data source">
                        <Picker
                          label="Data source"
                          value={filters.source ?? ''}
                          onChange={(v) => filter('source', v)}
                          options={[
                            { value: '', label: 'All sources' },
                            { value: 'zoho', label: 'Zoho Creator' },
                            { value: 'register', label: 'Confirmed register' },
                          ]}
                        />
                      </Field>
                      <Field label="Search">
                        <Input
                          value={filters.q ?? ''}
                          onChange={(e) => filter('q', e.target.value)}
                          placeholder="Reference or destination"
                        />
                      </Field>
                    </div>
                  </details>
                  <Button variant="ghost" onClick={() => setFilters({})}>
                    Reset
                  </Button>
                </section>
              )}
              {view === 'Overview' && (
                <>
                  <section className="metrics expanded-metrics">
                    {kpis.map((k) => (
                      <button
                        key={k[0]}
                        className="metric"
                        onClick={() => drill(k[3] as View, k[4], k[5])}
                      >
                        <span className="metric-label">
                          {k[0]}
                          <ArrowUpRight size={15} />
                        </span>
                        <strong>{k[1]}</strong>
                        <small>{k[2]}</small>
                      </button>
                    ))}
                  </section>
                  <div className="section-heading">
                    <h2>Your two vehicles</h2>
                    <span className="muted">
                      Last recorded state · not live tracking
                    </span>
                  </div>
                  <section className="vehicle-grid">
                    {Array.from(
                      { length: Math.max(2, data.vehicles.length) },
                      (_, i) => data.vehicles[i] ?? null,
                    ).map((v: any, i) => (
                      <article className="vehicle" key={v?.id ?? i}>
                        <div className="vehicle-heading">
                          <span className="vehicle-icon">
                            <CarFront size={25} />
                          </span>
                          <div>
                            <h3>
                              {v?.name ??
                                `Vehicle ${String(i + 1).padStart(2, '0')}`}
                            </h3>
                            <p className="muted">
                              {v?.registration ?? 'Registration not connected'}
                            </p>
                          </div>
                          <Badge text={v?.availability ?? 'Unknown'} />
                        </div>
                        <div className="vehicle-route">
                          <div className="vehicle-detail">
                            <span>Recorded employee</span>
                            <b>{display(v?.current?.employee)}</b>
                          </div>
                          <div className="vehicle-detail">
                            <span>Recorded driver</span>
                            <b>{display(v?.current?.driver)}</b>
                          </div>
                          <div className="vehicle-detail">
                            <span>Expected return</span>
                            <b>{date(v?.current?.expectedReturn)}</b>
                          </div>
                          <p className="muted">
                            State recorded: {date(v?.recordedAt)}
                          </p>
                        </div>
                        <div className="vehicle-footer">
                          <span>
                            {fmt(v?.odometer)} km{' '}
                            <small>confirmed odometer</small>
                          </span>
                          <span>
                            {v?.fuelLevel == null
                              ? 'Unknown fuel level'
                              : fmt(v.fuelLevel) + '% fuel'}
                            <small>{date(v?.fuelLevelAt)}</small>
                          </span>
                        </div>
                      </article>
                    ))}
                  </section>
                  <div className="bottom-grid">
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Trips by vehicle</h2>
                        <span className="muted">{m.trips} recorded</span>
                      </div>
                      {!rows.length ? (
                        <div className="chart-empty">
                          <CarFront size={26} />
                          <p>
                            Usage patterns will appear after records are
                            confirmed.
                          </p>
                        </div>
                      ) : (
                        data.vehicles.map((v: any) => {
                          const ts = rows.filter(
                            (t: Trip) =>
                              t.vehicleId === (v.registration ?? v.id),
                          );
                          return (
                            <button
                              className="bar-row"
                              key={v.id}
                              onClick={() =>
                                drill(
                                  'Trip register',
                                  'vehicleId',
                                  v.registration ?? v.id,
                                )
                              }
                            >
                              <span>{v.registration ?? v.name}</span>
                              <span className="bar-track">
                                <i
                                  style={{
                                    width:
                                      Math.max(
                                        2,
                                        (ts.length / Math.max(1, m.trips)) *
                                          100,
                                      ) + '%',
                                  }}
                                />
                              </span>
                              <strong>{ts.length}</strong>
                            </button>
                          );
                        })
                      )}
                      <p className="metric-footnote">
                        Distance uses confirmed, valid odometer pairs. Unknown
                        distance stays unknown.
                      </p>
                    </section>
                    <section className="panel">
                      <div className="section-heading">
                        <h2>Permission outcomes</h2>
                        <ShieldCheck size={20} />
                      </div>
                      {PERMISSIONS.map((p) => (
                        <button
                          className="outcome-row"
                          key={p}
                          onClick={() =>
                            drill('Permission review', 'permission', p)
                          }
                        >
                          <span>{p}</span>
                          <strong>
                            {
                              rows.filter((t: Trip) => t.permission === p)
                                .length
                            }
                          </strong>
                        </button>
                      ))}
                    </section>
                  </div>
                  <section className="panel bookings-panel recent-panel">
                    <div className="section-heading">
                      <h2>Recent recorded journeys</h2>
                      <Button
                        variant="ghost"
                        onClick={() => setView('Trip register')}
                      >
                        Open register <ArrowUpRight />
                      </Button>
                    </div>
                    {tripTable(rows.slice(0, 5))}
                  </section>
                  <details className="metric-definitions">
                    <summary>How these metrics are calculated</summary>
                    <p>
                      Trip KPIs count filtered, confirmed, deduplicated trips.
                      Prior-approval coverage uses all recorded trips as its
                      denominator. Review includes missing approval, differing
                      details and insufficient evidence. Unauthorized requires a
                      current human review decision. Distance excludes missing
                      or invalid odometer pairs and missing return timestamps.
                    </p>
                    <p>
                      Fuel totals count known purchases independently. Fuel
                      purchased is not fuel consumed. Km/l:{' '}
                      <b>Insufficient data</b>. Utilization is not calculated
                      until available hours and maintenance exclusions are
                      agreed. Pending image reviews and vehicle panels describe
                      the whole workspace.
                    </p>
                  </details>
                </>
              )}
              {view === 'Trip register' && (
                <section className="panel bookings-panel">
                  <div className="section-heading">
                    <h2>Daily & monthly register</h2>
                    <span className="muted">
                      {rows.length} trips · {m.distanceExcluded} distances
                      excluded
                    </span>
                  </div>
                  {tripTable(rows)}
                  {data.issues.length > 0 && (
                    <div className="issue-list">
                      <h3>Odometer checks</h3>
                      {data.issues.map((x: any) => (
                        <button
                          key={x.tripId + x.message}
                          onClick={() => setTripId(x.tripId)}
                        >
                          {x.message} <ArrowUpRight size={14} />
                        </button>
                      ))}
                      <p className="muted">
                        Recording gaps are investigation prompts, not findings
                        of misuse.
                      </p>
                    </div>
                  )}
                  <div className="usage-groups">
                    {['employee', 'department'].map((key) => (
                      <div key={key}>
                        <h3>Usage by {key}</h3>
                        {[
                          ...new Set<string>(
                            rows.map((t: any) => t[key]).filter(Boolean),
                          ),
                        ].map((name) => (
                          <button
                            className="outcome-row"
                            key={name}
                            onClick={() => filter(key, name)}
                          >
                            <span>{name}</span>
                            <b>
                              {rows.filter((t: any) => t[key] === name).length}{' '}
                              trips
                            </b>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {view === 'Bookings' && (
                <section className="panel bookings-panel">
                  <div className="section-heading">
                    <h2>Zoho booking requests</h2>
                    <Badge text="Read-only source" />
                  </div>
                  <DataTable
                    headers={[
                      'Booking / employee',
                      'Vehicle & driver',
                      'Requested journey · IST',
                      'Decision',
                      'Approval evidence',
                    ]}
                    empty={!data.bookings.length}
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
                          {date(b.departure)}
                          <small>{display(b.destination)}</small>
                        </TableCell>
                        <TableCell>{display(b.status)}</TableCell>
                        <TableCell>
                          {data.approvals
                            .filter((a: any) =>
                              [b.id, b.bookingRef, b.sourceId].includes(
                                a.bookingRef,
                              ),
                            )
                            .map((a: any) => (
                              <small key={a.id}>
                                {display(a.decision)} · {date(a.decidedAt)} ·{' '}
                                {display(a.approver)}
                              </small>
                            ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </DataTable>
                  <div className="no-usage">
                    <h3>
                      No recorded usage <span>{data.noUsage.length}</span>
                    </h3>
                    <p className="muted">
                      Approved bookings without a linked actual trip. This does
                      not establish a no-show.
                    </p>
                    {data.noUsage.map((b: any) => (
                      <div className="outcome-row" key={b.id}>
                        <span>
                          {display(b.bookingRef)} · {display(b.employee)}
                        </span>
                        <span>{date(b.departure)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {view === 'Fuel & expenses' && (
                <section className="panel bookings-panel">
                  <div className="section-heading">
                    <h2>Fuel purchases</h2>
                    <span className="muted">
                      Purchased {fmt(m.litres, 2)} L · {money(m.spend)}
                    </span>
                  </div>
                  <DataTable
                    headers={[
                      'Date',
                      'Vehicle',
                      'Quantity',
                      'Amount',
                      'Paid by',
                      'Receipt / source',
                    ]}
                    empty={!data.fuel.length}
                  >
                    {data.fuel.map((f: any) => (
                      <TableRow key={f.id}>
                        <TableCell>
                          {date(f.registerDate ?? f.departure)}
                        </TableCell>
                        <TableCell>{display(f.vehicleId)}</TableCell>
                        <TableCell>{fmt(f.litres, 2)} L</TableCell>
                        <TableCell>{money(f.amount)}</TableCell>
                        <TableCell>{display(f.payer)}</TableCell>
                        <TableCell>
                          {display(f.receiptRef)}
                          <small>{f.source}</small>
                        </TableCell>
                      </TableRow>
                    ))}
                  </DataTable>
                  <div className="no-usage">
                    <h3>Monthly fuel spend</h3>
                    {[
                      ...new Set<string>(
                        data.fuel.map((f: any) =>
                          (f.registerDate ?? f.departure ?? 'Unknown').slice(
                            0,
                            7,
                          ),
                        ),
                      ),
                    ]
                      .sort()
                      .map((month) => (
                        <button
                          className="outcome-row"
                          key={month}
                          onClick={() => {
                            if (month !== 'Unknown') {
                              filter('from', month + '-01');
                              const end = new Date(
                                Number(month.slice(0, 4)),
                                Number(month.slice(5, 7)),
                                0,
                              ).getDate();
                              filter('to', month + '-' + end);
                            }
                          }}
                        >
                          <span>{month}</span>
                          <b>
                            {money(
                              data.fuel
                                .filter((f: any) =>
                                  (
                                    f.registerDate ??
                                    f.departure ??
                                    'Unknown'
                                  ).startsWith(month),
                                )
                                .reduce(
                                  (sum: number, f: any) =>
                                    sum + (f.amount ?? 0),
                                  0,
                                ),
                            )}
                          </b>
                        </button>
                      ))}
                    <p className="muted">
                      Fuel economy: <b>Insufficient data</b>. A fuel-balance or
                      full-tank method must be established first. Price
                      differences do not establish misuse.
                    </p>
                  </div>
                  <h3>Maintenance expenses</h3>
                  <DataTable
                    headers={['Date', 'Vehicle', 'Expense', 'Remarks']}
                    empty={!data.maintenance.length}
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
                </section>
              )}
              {view === 'Permission review' && (
                <section className="panel bookings-panel">
                  <div className="section-heading">
                    <h2>Booking-to-register reconciliation</h2>
                    <span className="muted">Rule {data.ruleVersion}</span>
                  </div>
                  {tripTable(rows)}
                  <p className="metric-footnote">
                    Missing approval evidence always requires review.
                    Unconfirmed extraction cannot become an unauthorized-use
                    finding.
                  </p>
                </section>
              )}
              {view === 'Register uploads' && (
                <>
                  <section className="panel upload-panel">
                    <Upload size={28} />
                    <div>
                      <h2>Add register photographs or scans</h2>
                      <p className="muted">
                        JPEG, PNG or PDF · up to 10 MB each · originals remain
                        private
                      </p>
                      <p className="muted">
                        Manual transcription works without an extraction
                        provider.
                      </p>
                    </div>
                    {canUpload && (
                      <div className="upload-controls">
                        <Picker
                          value={uploadKind}
                          label="Register type"
                          onChange={setUploadKind}
                          options={[
                            {
                              value: 'movement',
                              label: 'Vehicle movement register',
                            },
                            { value: 'driver', label: 'Driver logbook' },
                            { value: 'fuel', label: 'Fuel register' },
                            { value: 'receipt', label: 'Fuel receipt' },
                          ]}
                        />
                        <Field label="Choose one or more documents">
                          <Input
                            type="file"
                            accept="image/jpeg,image/png,application/pdf"
                            multiple
                            disabled={busy}
                            onChange={(e) => {
                              const files = Array.from(e.target.files ?? []);
                              e.target.value = '';
                              void run(async () => {
                                const results = [];
                                for (const file of files) {
                                  const form = new FormData();
                                  form.set('file', file);
                                  form.set('kind', uploadKind);
                                  const response = await fetch(
                                    '/api/fleet/upload',
                                    { method: 'POST', body: form },
                                  );
                                  const result: any = await response.json();
                                  if (!response.ok)
                                    throw Error(
                                      `${file.name}: ${result.error}`,
                                    );
                                  results.push(result);
                                }
                                setNotice(
                                  `${files.length} processed; ${results.filter((r) => r.duplicate).length} duplicates recognized.`,
                                );
                              }, 'Uploads processed; duplicate files reuse the existing document.');
                            }}
                          />
                        </Field>
                      </div>
                    )}
                  </section>
                  <div className="panel bookings-panel">
                    <DataTable
                      headers={[
                        'Original document',
                        'State',
                        'Extracted rows',
                        'Actions',
                      ]}
                      empty={!data.documents.length}
                    >
                      {data.documents.map((doc: any) => {
                        const dr = data.rows.filter(
                          (r: any) => r.documentId === doc.id,
                        );
                        return (
                          <TableRow key={doc.id}>
                            <TableCell>
                              <b>{doc.name}</b>
                              <small>
                                {doc.kind} · {fmt(doc.size / 1024)} KB ·{' '}
                                {date(doc.createdAt)}
                              </small>
                              {doc.error && (
                                <small className="form-error">
                                  {doc.error}
                                </small>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge text={doc.status} />
                            </TableCell>
                            <TableCell>
                              {dr.map((r: any) => (
                                <button
                                  className="row-link"
                                  key={r.id}
                                  onClick={() => setRowId(r.id)}
                                >
                                  Page {r.page}, row {r.row}{' '}
                                  <Badge text={r.state} />
                                </button>
                              ))}
                            </TableCell>
                            <TableCell>
                              <div className="document-actions">
                                <a
                                  className="text-link"
                                  href={'/api/fleet/document/' + doc.id}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Original <ExternalLink size={14} />
                                </a>
                                {canUpload && (
                                  <>
                                    <form
                                      className="add-row-form"
                                      onSubmit={(e) => {
                                        e.preventDefault();
                                        const f = new FormData(e.currentTarget);
                                        void run(async () => {
                                          const rid = await api(
                                            'draft/' + doc.id,
                                            {
                                              page: Number(f.get('page')),
                                              row: Number(f.get('row')),
                                            },
                                          );
                                          await load();
                                          setRowId(rid);
                                        }, 'Draft created. Transcribe the original.');
                                      }}
                                    >
                                      <Input
                                        type="number"
                                        name="page"
                                        min="1"
                                        defaultValue="1"
                                        aria-label="Source page"
                                        required
                                      />
                                      <Input
                                        type="number"
                                        name="row"
                                        min="1"
                                        defaultValue={dr.length + 1}
                                        aria-label="Source row"
                                        required
                                      />
                                      <Button variant="outline" disabled={busy}>
                                        Add row
                                      </Button>
                                    </form>
                                    <Button
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() =>
                                        void run(
                                          () =>
                                            api(
                                              (doc.status === 'extracting'
                                                ? 'poll/'
                                                : 'extract/') + doc.id,
                                              {},
                                            ),
                                          'Extraction status updated.',
                                        )
                                      }
                                    >
                                      {doc.status === 'extracting'
                                        ? 'Check extraction'
                                        : 'Extract'}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </DataTable>
                  </div>
                </>
              )}
              {view === 'Alerts' && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Attention queue</h2>
                    <Badge text="External delivery disabled" />
                  </div>
                  <p className="muted">
                    Repeated alerts are grouped by record. No external messages
                    are sent.
                  </p>
                  {!alerts.length ? (
                    <div className="empty-state">
                      <Bell />
                      <strong>No open alerts</strong>
                    </div>
                  ) : (
                    alerts.map((a) => (
                      <button
                        className="outcome-row"
                        key={a.id}
                        onClick={() =>
                          setView(
                            a.kind === 'correction'
                              ? 'Register uploads'
                              : a.kind === 'sync' && admin
                                ? 'Settings'
                                : 'Permission review',
                          )
                        }
                      >
                        <span>{a.message}</span>
                        <span>
                          {date(a.updatedAt)} <ChevronRight size={15} />
                        </span>
                      </button>
                    ))
                  )}
                </section>
              )}
              {view === 'Settings' && admin && (
                <SettingsPanel
                  busy={busy}
                  run={run}
                  sync={sync}
                  fresh={fresh}
                />
              )}
              <footer className="page-footer">
                <span>Evidence-based fleet records · {data.ruleVersion}</span>
                <span>Last successful sync: {date(fresh.lastSuccess)} IST</span>
              </footer>
            </>
          )}
        </div>
      </main>
      {rowId && data && (
        <RegisterReview
          row={data.rows.find((r: any) => r.id === rowId)}
          documents={data.documents}
          canEdit={canUpload}
          busy={busy}
          close={() => setRowId(null)}
          refresh={load}
        />
      )}{' '}
      {tripId && data && (
        <PermissionReview
          trip={rows.find((t: Trip) => t.id === tripId)}
          data={data}
          canReview={canReview}
          close={() => setTripId(null)}
          refresh={load}
        />
      )}
    </SidebarProvider>
  );
}
