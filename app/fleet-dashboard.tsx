'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { LatestRequest } from '@/lib/latest-request';
import { useFleetNavigation, useDebounced } from './fleet-navigation';
import {
  FleetOverview,
  RegisterWorkspace,
  BookingWorkspace,
  FuelWorkspace,
} from './fleet-records';
import { UploadWorkspace } from './fleet-uploads';
import { RecordDetail, clearReviewDrafts } from './fleet-review';
import { SearchPicker } from './fleet-ui';
import { METRIC_LABELS, ISSUE_LABELS } from '@/lib/reporting';
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
  LogOut,
  LockKeyhole,
  Bell,
  ExternalLink,
  ArrowRight,
  Check,
  X,
  SlidersHorizontal,
  Database,
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
  useSidebar,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';

import { PERMISSIONS } from '@/lib/domain';
import { api, Badge, Picker, Field, date } from './fleet-ui';
import { SettingsPanel } from './fleet-workspaces';

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
const VIEW_COPY: Record<View, [string, string]> = {
  Overview: [
    'Fleet overview',
    'Vehicle activity, approvals and costs. One place to stay on top of it all.',
  ],
  Bookings: [
    'Bookings',
    'Plan ahead with a clear view of requested and approved journeys.',
  ],
  'Trip register': [
    'Trip register',
    'Follow every recorded journey, from departure to return.',
  ],
  'Fuel & expenses': [
    'Fuel & expenses',
    'Track fuel purchases and vehicle costs against the original records.',
  ],
  'Permission review': [
    'Permission review',
    'Resolve missing approvals and conflicting journey details.',
  ],
  'Register uploads': [
    'Register uploads',
    'Turn your paper registers into checked, searchable records.',
  ],
  Alerts: [
    'Attention queue',
    'Follow up on the records and connections that need your attention.',
  ],
  Settings: [
    'Workspace settings',
    'Connect your data, manage access and keep your workspace up to date.',
  ],
};
function ContinueSetup({ select }: { select: (v: View) => void }) {
  const { setOpenMobile } = useSidebar();
  return (
    <button
      className="connection-link"
      onClick={() => {
        select('Settings');
        setOpenMobile(false);
      }}
    >
      Continue setup <ArrowRight size={14} />
    </button>
  );
}
function WorkspaceNavigation({
  view,
  select,
  admin,
  reviewCount,
}: {
  view: View;
  select: (v: View) => void;
  admin: boolean;
  reviewCount: number;
}) {
  const { setOpenMobile, isMobile } = useSidebar();
  return (
    <nav className="workspace-navigation" aria-label="Main navigation">
      {isMobile && (
        <button
          className="mobile-nav-close"
          aria-label="Close navigation"
          onClick={() => setOpenMobile(false)}
        >
          <X size={20} />
        </button>
      )}
      {[
        { label: 'Workspace', items: NAV.slice(0, 6) },
        {
          label: 'Manage',
          items: NAV.slice(6).filter(([v]) => v !== 'Settings' || admin),
        },
      ].map((group) => (
        <div className="nav-group" key={group.label}>
          <p className="nav-label">{group.label}</p>
          <SidebarMenu>
            {group.items.map(([v, Icon]) => (
              <SidebarMenuItem key={v}>
                <SidebarMenuButton
                  isActive={view === v}
                  aria-current={view === v ? 'page' : undefined}
                  onClick={() => {
                    select(v);
                    setOpenMobile(false);
                  }}
                >
                  <Icon />
                  <span>{v}</span>
                  {v === 'Permission review' && reviewCount > 0 && (
                    <span className="nav-count">{reviewCount}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      ))}
    </nav>
  );
}
export default function Dashboard() {
  const nav = useFleetNavigation(NAV.map(([v]) => v));
  const view = nav.view as View,
    filters = nav.filters;
  const [data, setData] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [updating, setUpdating] = useState(false),
    [requestError, setRequestError] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [auth, setAuth] = useState(0),
    [alerts, setAlerts] = useState<any[]>([]);
  const requests = useRef(new LatestRequest<Awaited<ReturnType<typeof api>>>());
  const search = useDebounced(filters.q ?? '');
  const query = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(filters).filter(([k, v]) => k !== 'q' && v),
    ),
    ...(search ? { q: search } : {}),
    page: String(nav.page),
    pageSize: String(nav.pageSize),
    sort: nav.sort,
    direction: nav.direction,
  }).toString();
  const load = useCallback(async () => {
    setUpdating(true);
    await requests.current.run(
      (signal) => api('snapshot?' + query, undefined, signal),
      (result) => {
        setData(result);
        setAuth(0);
        setRequestError('');
      },
      (caught) => {
        const e = caught as Error & { status?: number };
        setRequestError(e.message);
        setAuth(e.status ?? 0);
        if (e.status === 401 || e.status === 403) {
          setData(null);
          setAlerts([]);
          clearReviewDrafts();
        }
      },
      () => {
        setLoading(false);
        setUpdating(false);
      },
    );
  }, [query]);
  useEffect(() => {
    void load();
    return () => requests.current.cancel();
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 60000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (view !== 'Alerts' || !data) return;
    const c = new AbortController();
    void api('alerts', undefined, c.signal)
      .then((s) => setAlerts(s.alerts))
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => c.abort();
  }, [view, !!data]);
  const role = data?.user?.role,
    admin = role === 'Administrator',
    canUpload = ['Administrator', 'Manager', 'Register operator'].includes(
      role ?? '',
    ),
    canReview = ['Administrator', 'Manager'].includes(role ?? '');
  const run = async (work: () => Promise<any>, message = 'Saved.') => {
    setBusy(true);
    setError('');
    try {
      await work();
      await load();
      setNotice(message);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const fresh = data?.freshness,
    m = data?.metrics ?? {};
  const filter = (key: string, value: string) =>
    nav.setFilters((f) => ({ ...f, [key]: value }));
  const drill = (next: string, key?: string, value?: string) =>
    nav.write({
      view: next,
      metric: null,
      outcome: null,
      page: null,
      detail: null,
      id: null,
      ...(key
        ? { [key === 'permission' ? 'outcome' : key]: value || null }
        : {}),
    });
  async function sync(mode?: unknown) {
    await run(async () => {
      if (!['syncing', 'retrying'].includes(fresh?.sync?.status))
        await api('sync', {
          mode: mode === 'incremental' ? 'incremental' : 'full',
        });
      for (let i = 0; i < 10000; i++) {
        const result = await api('sync', { step: true });
        await load();
        if (result.done || result.retryAt || result.error || result.busy) break;
      }
    }, 'Synchronization status updated. The last complete import remains available.');
  }
  useEffect(() => {
    if (view !== 'Register uploads' || !canUpload) return;
    const pending =
      data?.documents?.filter((d: any) => d.status === 'extracting') ?? [];
    if (!pending.length) return;
    let active = false;
    const timer = setInterval(() => {
      if (active || document.visibilityState !== 'visible') return;
      active = true;
      void (async () => {
        try {
          for (const doc of pending.slice(0, 3))
            await api('poll/' + doc.id, {});
          await load();
        } catch (e: any) {
          setError(e.message);
        } finally {
          active = false;
        }
      })();
    }, 10000);
    return () => clearInterval(timer);
  }, [view, data?.documents, canUpload, load]);
  const activeFilters = Object.entries(filters).filter(([, v]) => v);
  const filterLabels: Record<string, string> = {
    from: 'From',
    to: 'To',
    vehicleId: 'Vehicle',
    employee: 'Employee',
    employeeId: 'Employee',
    driver: 'Driver',
    driverId: 'Driver',
    department: 'Department',
    destination: 'Destination',
    permission: 'Permission',
    outcome: 'Reconciliation outcome',
    source: 'Source',
    q: 'Search',
    metric: 'View',
    issue: 'Issue',
  };
  const currentType =
    view === 'Bookings'
      ? filters.metric === 'no-usage'
        ? 'noUsage'
        : 'bookings'
      : view === 'Fuel & expenses'
        ? 'fuel'
        : 'trips';
  const exportQuery = new URLSearchParams(query);
  exportQuery.set('type', currentType);
  const connectionLabel = !data
    ? 'Awaiting authorized access'
    : fresh?.sync?.status === 'failed'
      ? 'Sync failed · showing last complete import'
      : fresh?.sync?.status === 'retrying'
        ? 'Sync delayed · retry scheduled'
        : fresh?.sync?.status === 'syncing'
          ? 'Synchronization running'
          : !fresh?.lastSuccess
            ? fresh?.connected
              ? 'First import pending'
              : 'Zoho setup incomplete'
            : fresh?.stale
              ? 'Last import is stale'
              : 'Last complete import available';
  const hasFilters = [
    'Overview',
    'Bookings',
    'Trip register',
    'Fuel & expenses',
    'Permission review',
  ].includes(view);
  const preset = (days: number | null) => {
    if (days === null) {
      nav.setFilters((f) => ({ ...f, from: '', to: '' }));
      return;
    }
    const today = new Date();
    const to = today.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const from = new Date(
      Date.parse(to + 'T00:00:00+05:30') - (days - 1) * 86400000,
    ).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    nav.setFilters((f) => ({ ...f, from, to }));
  };
  return (
    <SidebarProvider className="fleet-shell">
      <a className="skip-link" href="#fleet-main">
        Skip to main content
      </a>
      <Sidebar className="fleet-sidebar">
        <SidebarHeader>
          <div className="brand">
            <span className="brand-icon">
              <CarFront size={23} />
            </span>
            <div>
              Fleet Desk<small>MCCIA · Vehicle operations</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <WorkspaceNavigation
            view={view}
            select={nav.setView}
            admin={admin}
            reviewCount={m.review ?? 0}
          />
        </SidebarContent>
        <SidebarFooter>
          <div className="connection">
            <strong>{connectionLabel}</strong>
            <small>
              {fresh?.lastSuccess
                ? date(fresh.lastSuccess) + ' IST'
                : 'No successful sync yet'}
            </small>
            {admin && !fresh?.lastSuccess && (
              <ContinueSetup select={nav.setView} />
            )}
          </div>
          <a href="/source-preview" className="text-link historical-link">
            Historical file preview <ExternalLink size={14} />
          </a>
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
      <main className="workspace" id="fleet-main" tabIndex={-1}>
        <header className="topbar">
          <div className="flex items-center gap-3">
            <SidebarTrigger />
            <span>
              <span className="breadcrumb-root">MCCIA / </span>
              {view}
            </span>
          </div>
          <span className="demo-label">
            <LockKeyhole size={13} />
            Private workspace · IST
          </span>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">MCCIA / VEHICLE OPERATIONS</p>
              <h1>{VIEW_COPY[view][0]}</h1>
              <p className="muted">
                {view === 'Overview'
                  ? 'Recorded vehicle status, approvals and outstanding work.'
                  : VIEW_COPY[view][1]}
              </p>
            </div>
            <div className="heading-actions">
              {data &&
                [
                  'Trip register',
                  'Fuel & expenses',
                  'Bookings',
                  'Permission review',
                ].includes(view) && (
                  <a
                    className="export-link"
                    href={'/api/fleet/export?' + exportQuery}
                    title="Export all authorized matching records, including other pages"
                  >
                    <Download size={16} />
                    Export CSV · {data.counts[currentType]}
                  </a>
                )}
              {admin && fresh?.connected && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void sync()}
                >
                  <RefreshCw className={busy ? 'spin' : ''} />{' '}
                  {['syncing', 'retrying'].includes(fresh.sync?.status)
                    ? 'Resume sync'
                    : 'Sync now'}
                </Button>
              )}
              {canUpload && view !== 'Settings' && (
                <Button
                  onClick={() =>
                    view === 'Register uploads'
                      ? document.getElementById('fleet-upload-input')?.click()
                      : nav.setView('Register uploads')
                  }
                >
                  <Upload size={16} />
                  Upload registers
                </Button>
              )}
            </div>
          </div>
          {(error || requestError) && (
            <div role="alert" className="error-banner">
              <AlertCircle size={18} />
              <div>
                {error || requestError}
                {data && requestError && (
                  <small>Showing previously retrieved records.</small>
                )}
              </div>
              {requestError && (
                <Button variant="outline" onClick={() => void load()}>
                  Retry
                </Button>
              )}
              {error && (
                <Button variant="ghost" onClick={() => setError('')}>
                  Dismiss
                </Button>
              )}
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              <Check size={18} />
              <span>{notice}</span>
              <Button
                variant="ghost"
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                <X size={16} />
              </Button>
            </div>
          )}
          {!data && loading && (
            <section
              aria-label="Loading workspace"
              aria-busy="true"
              className="dashboard-loading"
            >
              <div className="loading-metrics">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="loading-tile" />
                ))}
              </div>
              <Skeleton className="loading-panel" />
            </section>
          )}
          {!data && !loading && (
            <section className="panel sign-in">
              <LockKeyhole size={32} />
              <h2>
                {auth === 403
                  ? 'Access has not been granted'
                  : auth === 401
                    ? 'Sign in to Fleet Desk'
                    : 'Records are temporarily unavailable'}
              </h2>
              <p>
                {auth === 403
                  ? 'Ask the Fleet Desk administrator to grant your account access.'
                  : auth === 401
                    ? 'Use an authorized account to view company records and attachments.'
                    : 'Retry the connection. Saved records have not been removed.'}
              </p>
              {auth === 401 && (
                <a
                  className="signin-link"
                  href={
                    '/signin-with-chatgpt?return_to=' +
                    encodeURIComponent(
                      '/' +
                        (typeof window !== 'undefined'
                          ? window.location.search
                          : ''),
                    )
                  }
                  target="_top"
                >
                  Sign in with ChatGPT <ArrowUpRight size={16} />
                </a>
              )}
              <Button variant="outline" onClick={() => void load()}>
                Retry connection
              </Button>
            </section>
          )}
          {data && (
            <>
              {data.fixtureMode && (
                <div className="fixture-banner" role="note">
                  TEST WORKSPACE · Synthetic records for interface verification.
                  Not company activity. External integrations are disabled.
                </div>
              )}
              {view !== 'Settings' && (
                <details
                  className={
                    'freshness-summary ' +
                    (fresh.stale ||
                    ['failed', 'retrying'].includes(fresh.sync?.status)
                      ? 'needs-attention'
                      : '')
                  }
                >
                  <summary>
                    <Database size={15} />
                    <strong>{connectionLabel}</strong>
                    <span>
                      {fresh.lastSuccess
                        ? date(fresh.lastSuccess) + ' IST'
                        : 'No successful sync yet'}
                    </span>
                    {updating && <span>Updating view…</span>}
                  </summary>
                  <p>
                    {fresh.lastSuccess
                      ? 'Records from the last completed import remain available.'
                      : 'Register uploads and manual review work independently of the Zoho connection.'}{' '}
                    Availability is based on recorded evidence, not live
                    telemetry.
                  </p>
                  {fresh.sync && (
                    <p>
                      Latest run: {fresh.sync.status} · {fresh.sync.count ?? 0}{' '}
                      records · {fresh.sync.pages ?? 0} pages
                      {fresh.sync.error ? ' · ' + fresh.sync.error : ''}
                    </p>
                  )}
                  {admin && (
                    <Button
                      variant="ghost"
                      onClick={() => nav.setView('Settings')}
                    >
                      Connection settings
                    </Button>
                  )}
                </details>
              )}
              {view === 'Overview' && !data.hasRecords ? (
                <section className="panel first-import-state">
                  <Database size={28} />
                  <h2>No records imported</h2>
                  <p>
                    Connect Zoho Creator or upload an original register.
                    Confirmed records will populate vehicle status and reports.
                  </p>
                  {admin ? (
                    <Button onClick={() => nav.setView('Settings')}>
                      Set up Zoho Creator <ArrowRight size={15} />
                    </Button>
                  ) : canUpload ? (
                    <Button onClick={() => nav.setView('Register uploads')}>
                      Upload your first register
                    </Button>
                  ) : (
                    <p>
                      Ask your administrator to connect the company reports.
                    </p>
                  )}
                </section>
              ) : (
                <>
                  {hasFilters && (
                    <section
                      className="global-filters compact-filters"
                      aria-label="Global record filters"
                    >
                      <Field label="From">
                        <Input
                          type="date"
                          aria-label="Start date"
                          value={filters.from ?? ''}
                          max={filters.to || undefined}
                          onChange={(e) => filter('from', e.target.value)}
                        />
                      </Field>
                      <Field label="To">
                        <Input
                          type="date"
                          aria-label="End date"
                          value={filters.to ?? ''}
                          min={filters.from || undefined}
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
                              label:
                                [v.name, v.registration]
                                  .filter(Boolean)
                                  .join(' · ') || v.id,
                            })),
                            {
                              value: '__unknown',
                              label: 'Vehicle not recorded',
                            },
                          ]}
                        />
                      </Field>
                      <details className="more-filters">
                        <summary>
                          <SlidersHorizontal size={15} />
                          More filters
                        </summary>
                        <div className="expanded-filters">
                          {[
                            'employee',
                            'driver',
                            'department',
                            'destination',
                          ].map((k) => (
                            <Field label={filterLabels[k]} key={k}>
                              <SearchPicker
                                label={'Filter ' + k}
                                value={
                                  filters[k + 'Id']
                                    ? 'id:' + filters[k + 'Id']
                                    : (filters[k] ?? '')
                                }
                                onChange={(v) =>
                                  nav.setFilters((f) => ({
                                    ...f,
                                    [k]: v.startsWith('id:') ? '' : v,
                                    [k + 'Id']: v.startsWith('id:')
                                      ? v.slice(3)
                                      : '',
                                  }))
                                }
                                options={[
                                  { value: '', label: 'All ' + k + 's' },
                                  ...(data.personOptions?.[k] ??
                                    (data.options?.[k] ?? []).map(
                                      (v: string) => ({ value: v, label: v }),
                                    )),
                                  { value: '__unknown', label: 'Not recorded' },
                                ]}
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
                                ...PERMISSIONS.map((p) => ({
                                  value: p,
                                  label: p,
                                })),
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
                                {
                                  value: 'register',
                                  label: 'Confirmed register',
                                },
                              ]}
                            />
                          </Field>
                          <Field label="Search">
                            <Input
                              value={filters.q ?? ''}
                              onChange={(e) => filter('q', e.target.value)}
                              placeholder="Reference, person or destination"
                            />
                          </Field>
                        </div>
                      </details>
                      <Button
                        variant="ghost"
                        disabled={!activeFilters.length}
                        onClick={() => nav.setFilters({})}
                      >
                        Clear filters
                      </Button>
                      <div className="date-presets" aria-label="Date presets">
                        {[
                          [1, 'Today'],
                          [7, 'Last 7 days'],
                          [30, 'Last 30 days'],
                          [null, 'All dates'],
                        ].map(([days, label]) => (
                          <button
                            key={String(label)}
                            onClick={() => preset(days as number | null)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {activeFilters.length > 0 && (
                        <div className="filter-chips">
                          {activeFilters.map(([key, value]) => (
                            <button
                              key={key}
                              className="filter-chip"
                              aria-label={
                                'Remove ' +
                                (filterLabels[key] ?? key) +
                                ' filter'
                              }
                              onClick={() => filter(key, '')}
                            >
                              {filterLabels[key] ?? key}:{' '}
                              {value === '__unknown'
                                ? 'Not recorded'
                                : key.endsWith('Id') &&
                                    ['employeeId', 'driverId'].includes(key)
                                  ? (data.personOptions?.[
                                      key.slice(0, -2)
                                    ]?.find(
                                      (p: { value: string; label: string }) =>
                                        p.value === 'id:' + value,
                                    )?.label ?? value)
                                  : key === 'metric'
                                    ? (METRIC_LABELS[value] ?? value)
                                    : key === 'issue'
                                      ? (ISSUE_LABELS[value] ?? value)
                                      : value}
                              <X size={13} />
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="filter-scope">
                        Inclusive dates in IST. Trips/bookings use departure or
                        register date; fuel uses its recorded purchase date.
                        Missing dates are excluded when a date filter is active.
                      </p>
                    </section>
                  )}
                  {view === 'Overview' && (
                    <FleetOverview data={data} nav={nav} drill={drill} />
                  )}
                  {view === 'Trip register' && (
                    <RegisterWorkspace data={data} nav={nav} />
                  )}
                  {view === 'Permission review' && (
                    <RegisterWorkspace data={data} nav={nav} review />
                  )}
                  {view === 'Bookings' && (
                    <BookingWorkspace data={data} nav={nav} />
                  )}
                  {view === 'Fuel & expenses' && (
                    <FuelWorkspace data={data} nav={nav} />
                  )}
                </>
              )}
              {
                <div hidden={view !== 'Register uploads'}>
                  <UploadWorkspace
                    data={data}
                    nav={nav}
                    canUpload={canUpload}
                    refresh={load}
                    run={run}
                    busy={busy}
                  />
                </div>
              }
              {view === 'Alerts' && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>Recorded alerts</h2>
                    <Badge text="External delivery disabled" />
                  </div>
                  <p className="muted">
                    Repeated alerts are grouped by record. No messages are sent
                    externally.
                  </p>
                  {!data.hasRecords ? (
                    <div className="empty-state">
                      <Bell />
                      <strong>Monitoring has no records yet</strong>
                      <p>
                        Import reports or confirm register entries to evaluate
                        alerts.
                      </p>
                    </div>
                  ) : !alerts.length ? (
                    <p>
                      No recorded alerts. Checks run after imports and confirmed
                      changes.
                    </p>
                  ) : (
                    alerts.map((a) => (
                      <button
                        key={a.id}
                        className="alert-record"
                        onClick={() =>
                          a.kind === 'sync'
                            ? nav.setView('Settings')
                            : nav.open(
                                a.kind === 'correction' ? 'row' : 'trip',
                                a.entityId,
                              )
                        }
                      >
                        <div>
                          <Badge text={a.state} />
                          <strong>{a.message}</strong>
                          <small>
                            {a.kind} · First seen {date(a.createdAt)} · Last
                            evaluated {date(a.updatedAt)}
                          </small>
                        </div>
                        <ArrowUpRight size={16} />
                      </button>
                    ))
                  )}
                </section>
              )}
              {view === 'Settings' &&
                (admin ? (
                  <SettingsPanel
                    busy={busy}
                    run={run}
                    sync={sync}
                    fresh={fresh}
                  />
                ) : (
                  <section className="panel">
                    <h2>Administrator access required</h2>
                    <p>Your role does not allow connection or staff changes.</p>
                  </section>
                ))}
              <footer className="page-footer">
                <span>Recorded evidence · Rule {data.ruleVersion}</span>
                <span>
                  {fresh.lastSuccess
                    ? 'Last successful sync: ' +
                      date(fresh.lastSuccess) +
                      ' IST'
                    : 'No successful sync yet'}
                </span>
              </footer>
            </>
          )}
        </div>
      </main>
      {data && nav.detail && nav.id && (
        <RecordDetail
          nav={nav}
          canEdit={canUpload}
          canReview={canReview}
          refresh={load}
        />
      )}
    </SidebarProvider>
  );
}
