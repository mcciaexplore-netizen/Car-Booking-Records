'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { FIELDS } from '@/lib/domain';
import type { Mapping } from '@/lib/zoho';
import {
  api,
  Badge,
  Field,
  Picker,
  SearchPicker,
  date,
  DataTable,
} from './fleet-ui';
import { TableCell, TableRow } from '@/components/ui/table';

const KINDS = [
  ['vehicles', 'Vehicle master'],
  ['employees', 'Employees'],
  ['drivers', 'Drivers'],
  ['bookings', 'Bookings'],
  ['approvals', 'Approval history'],
  ['trips', 'Actual trips'],
  ['fuel', 'Fuel purchases'],
  ['maintenance', 'Maintenance expenses'],
];
const FIELDS_BY_KIND: Record<string, string[]> = {
  vehicles: ['registration', 'name', 'capacity', 'fuelLevel', 'fuelLevelAt'],
  employees: ['name', 'department'],
  drivers: ['name', 'department'],
  approvals: ['bookingRef', 'decision', 'decidedAt', 'approver'],
};
const EXTRA_LABELS: Record<string, string> = {
  registration: 'Registration number',
  name: 'Name',
  capacity: 'Vehicle capacity',
  status: 'Source booking status',
  decision: 'Approval decision',
  decidedAt: 'Decision timestamp',
  approver: 'Approver',
};
export function ConnectionSetup({
  settings,
  refresh,
  run,
  busy,
  sync,
  children,
}: any) {
  const [owner, setOwner] = useState(settings.application?.owner ?? ''),
    [app, setApp] = useState(settings.application?.app ?? '');
  useEffect(() => {
    setOwner(settings.application?.owner ?? '');
    setApp(settings.application?.app ?? '');
  }, [settings.application?.owner, settings.application?.app]);
  const configured = settings.configured.oauth?.configured;
  return (
    <div className="connection-forms">
      <section className="panel">
        <div className="section-heading">
          <h2>1. Secure read-only authorization</h2>
          <Badge
            text={
              configured ? 'Credentials configured' : 'Server setup required'
            }
          />
        </div>
        <p className="muted">
          Credentials stay on the server. This workspace never displays access
          or refresh tokens.
        </p>
        {!configured && (
          <ol className="setup-instructions">
            <li>
              Ask the administrator to create or use a Zoho API client in the
              account’s data centre. Request only report and metadata read
              permissions.
            </li>
            <li>
              On the server, run the existing secure token-exchange utility. If
              a credential bundle already exists, check it before creating a
              replacement.
            </li>
            <li>
              Provision <code>ZOHO_CLIENT_ID</code>,{' '}
              <code>ZOHO_CLIENT_SECRET</code>, <code>ZOHO_REFRESH_TOKEN</code>{' '}
              and <code>ZOHO_DC</code> as server secrets. Do not paste them into
              this page.
            </li>
            <li>
              For an existing local bundle, run{' '}
              <code>python scripts/zoho_token_exchange.py --check</code>. For
              first setup with a verified India-region account, run{' '}
              <code>python scripts/zoho_token_exchange.py --dc IN</code>; input
              stays hidden. Start locally with <code>npm.cmd run dev:zoho</code>
              . Other regions require their matching data-centre option. Return
              here and select Verify server authorization. Hosted installation
              requires the hosting secret manager; the encrypted local bundle
              alone does not connect the published site.
            </li>
          </ol>
        )}
        <p>
          Account data centre: <strong>{settings.dataCentre}</strong>
        </p>
        <p>
          Last access verification:{' '}
          {settings.oauthVerifiedAt
            ? date(settings.oauthVerifiedAt)
            : 'Not verified'}
        </p>
        <Button
          variant="outline"
          disabled={busy || !configured}
          onClick={() =>
            void run(async () => {
              await api('connection-test', {});
              await refresh();
            }, 'Read-only Zoho authorization verified.')
          }
        >
          Verify server authorization
        </Button>
      </section>
      <section className="panel">
        <h2>2. Select the Creator application</h2>
        <p className="muted">
          Copy the account owner and application link names from the Creator
          application URL. Display names may differ. Changing the application
          clears its old report mappings; the last imported records remain
          visible.
        </p>
        <form
          className="setup-application-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await api('application', {
                owner: owner.trim(),
                app: app.trim(),
              });
              await refresh();
            }, 'Application selected. Discover and map its reports next.');
          }}
        >
          <Field label="Account owner link name">
            <Input
              required
              pattern="[A-Za-z0-9_\-]+"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Application link name">
            <Input
              required
              pattern="[A-Za-z0-9_\-]+"
              value={app}
              onChange={(e) => setApp(e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Button disabled={busy || !owner.trim() || !app.trim()}>
            Save application
          </Button>
        </form>
      </section>
      <section className="panel">
        <h2>3. Discover reports and inspect fields</h2>
        <p className="muted">
          Set a verified API budget in Sync & rules, then retrieve the actual
          names available to this account. Optional reports can remain unmapped.
        </p>
        <Button
          disabled={
            busy ||
            !settings.configured.zoho ||
            !settings.syncConfig.allowanceVerified
          }
          onClick={() =>
            void run(async () => {
              await api('discover', {});
              await refresh();
            }, 'Available reports and forms discovered.')
          }
        >
          Discover reports
        </Button>
        {!settings.syncConfig.allowanceVerified && (
          <p className="action-hint">
            Verify the account’s API allowance in Sync & rules before discovery.
          </p>
        )}
        <p>
          Last discovery:{' '}
          {settings.metadata?.discoveredAt
            ? date(settings.metadata.discoveredAt)
            : 'Not performed'}
        </p>
      </section>
      {children}
      <section className="panel">
        <h2>5. Import and maintain the record history</h2>
        <p className="muted">
          A historical import reads every page of the selected reports, using
          any explicitly configured report criteria. Incremental mode requires a
          completed history import and a supported mapped modified-time field.
        </p>
        <div className="saved-views">
          <Button
            disabled={
              busy ||
              !settings.configured.zoho ||
              !settings.syncConfig.mappings.length ||
              !settings.syncConfig.allowanceVerified
            }
            onClick={() => void sync('full')}
          >
            Import selected report history
          </Button>
          <Button
            variant="outline"
            disabled={
              busy ||
              !settings.syncConfig.incremental ||
              !settings.runs.some((r: any) => r.status === 'succeeded')
            }
            onClick={() => void sync('incremental')}
          >
            Import updates
          </Button>
        </div>
        <p className="muted">
          An interrupted import can be resumed with Sync now. Existing data is
          replaced only when the selected import completes.
        </p>
      </section>
      <section className="panel">
        <h2>Latest import progress</h2>
        {!settings.runs.length ? (
          <p>No import has started.</p>
        ) : (
          <>
            <p>
              {settings.runs[0].status} · {settings.runs[0].pages} pages
              processed · {settings.runs[0].count} records read. Total page
              count is not supplied by the source.
            </p>
            {['syncing', 'retrying'].includes(settings.runs[0].status) && (
              <p>
                Current report:{' '}
                {settings.syncConfig.mappings[settings.runs[0].reportIndex]
                  ?.report ?? 'Finalizing the import'}
                .{' '}
                {settings.runs[0].cursor
                  ? 'A next-page cursor is saved.'
                  : 'No next-page cursor saved.'}
              </p>
            )}
            {settings.runs[0].retryAt && (
              <p>Next permitted retry: {date(settings.runs[0].retryAt)}</p>
            )}
            {settings.runs[0].error && (
              <p className="form-error">{settings.runs[0].error}</p>
            )}
            <ul>
              {settings.reportProgress?.map(
                (p: {
                  report: string;
                  kind: string;
                  storedRecords: number;
                }) => (
                  <li key={p.kind + p.report}>
                    {p.report} · {p.kind} · {p.storedRecords} records stored in
                    this run
                  </li>
                ),
              )}
            </ul>
            <p className="muted">
              Incremental runs retain unchanged records, so records stored can
              exceed records read. Only a completed run replaces the visible
              imported data.
            </p>
          </>
        )}
      </section>
      <section className="panel">
        <h2>6. Automatic synchronization</h2>
        <p>
          Scheduler credentials:{' '}
          {settings.configured.schedulerSecret
            ? 'Configured'
            : 'Not configured'}
        </p>
        <p>
          Last authenticated trigger:{' '}
          {settings.schedulerLastSeen
            ? date(settings.schedulerLastSeen)
            : 'Not observed'}
        </p>
        <p>
          Last completed scheduled check:{' '}
          {settings.schedulerLastCompleted
            ? date(settings.schedulerLastCompleted)
            : 'Not observed'}
        </p>
        <p className="muted">
          An administrator must deploy the existing scheduler worker with the
          private site endpoint and its server secret. A configured secret alone
          does not establish a working schedule. The schedule must respect the
          verified account allowance.
        </p>
      </section>
    </div>
  );
}
export function MappingEditor({ settings, refresh, run, busy }: any) {
  const [mappings, setMappings] = useState<Mapping[]>(
      settings.syncConfig.mappings,
    ),
    [editing, setEditing] = useState<Mapping | null>(null),
    [originalKind, setOriginalKind] = useState<string | null>(null),
    [message, setMessage] = useState('');
  useEffect(() => {
    setMappings(settings.syncConfig.mappings);
  }, [settings.syncConfig.mappings]);
  const meta = settings.metadata,
    reports = meta?.reports?.reports ?? meta?.reports ?? [],
    forms = meta?.forms?.forms ?? meta?.forms ?? [];
  const fields = editing
    ? (meta?.fields?.[editing.form]?.fields ??
      meta?.fields?.[editing.form] ??
      [])
    : [];
  const canonical = editing
    ? (FIELDS_BY_KIND[editing.kind] ?? [
        ...Object.keys(FIELDS),
        ...(editing.kind === 'bookings' ? ['status'] : []),
      ])
    : [];
  const fieldsAvailable = Array.isArray(fields) && fields.length > 0;
  const update = (key: string, value: any) =>
    setEditing((m) => (m ? { ...m, [key]: value } : m));
  const draftDirty =
    JSON.stringify(mappings) !== JSON.stringify(settings.syncConfig.mappings) ||
    !!editing;
  useEffect(() => {
    if (!draftDirty) return;
    const fn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', fn);
    return () => window.removeEventListener('beforeunload', fn);
  }, [draftDirty]);
  return (
    <section className="panel mapping-editor">
      <div className="section-heading">
        <h2>4. Map discovered reports and fields</h2>
        <Badge
          text={
            draftDirty
              ? 'Unsaved mapping changes'
              : mappings.length + ' mappings saved'
          }
        />
      </div>
      <p className="muted">
        Select actual discovered names. Unmapped values remain unknown. Review
        the mapping preview, then save it on the server.
      </p>
      {!meta && (
        <p className="field-warning">
          Discover reports first. No report or field names have been assumed.
        </p>
      )}
      <div className="mapping-list">
        {mappings.map((m) => (
          <article key={m.kind}>
            <div>
              <strong>{KINDS.find(([kind]) => kind === m.kind)?.[1]}</strong>
              <p>
                {m.report} · {Object.keys(m.fields).length} mapped fields
              </p>
            </div>
            <Button
              variant="outline"
              disabled={!!editing}
              onClick={() => {
                setEditing({ ...m, fields: { ...m.fields } });
                setOriginalKind(m.kind);
              }}
            >
              Edit mapping
            </Button>
            <Button
              variant="ghost"
              disabled={!!editing}
              onClick={() =>
                setMappings((ms) => ms.filter((x) => x.kind !== m.kind))
              }
            >
              Remove from draft
            </Button>
          </article>
        ))}
      </div>
      <Button
        variant="outline"
        disabled={busy || !meta || !!editing || mappings.length >= KINDS.length}
        onClick={() => {
          setOriginalKind(null);
          setEditing({
            kind: (KINDS.find(
              ([k]) => !mappings.some((m) => m.kind === k),
            )?.[0] ?? 'vehicles') as Mapping['kind'],
            report: '',
            form: '',
            fields: {},
            dateFormat: 'iso-offset',
          });
        }}
      >
        Add report mapping
      </Button>
      {editing && (
        <div className="mapping-form">
          <div className="form-grid">
            <Field label="Record type">
              <Picker
                label="Record type"
                value={editing.kind}
                onChange={(v) => update('kind', v)}
                options={KINDS.filter(
                  ([k]) =>
                    k === originalKind || !mappings.some((m) => m.kind === k),
                ).map(([value, label]) => ({ value, label }))}
              />
            </Field>
            <Field label="Discovered report">
              <SearchPicker
                label="Select a discovered report"
                value={editing.report}
                onChange={(v) => update('report', v)}
                options={[
                  { value: '', label: 'Choose a report' },
                  ...(Array.isArray(reports) ? reports : []).map((r: any) => ({
                    value: r.link_name,
                    label:
                      (r.display_name ?? r.name ?? r.link_name) +
                      ' · ' +
                      r.link_name,
                  })),
                ]}
              />
            </Field>
            <Field label="Discovered source form">
              <SearchPicker
                label="Select a discovered form"
                value={editing.form}
                onChange={(v) =>
                  setEditing((m) =>
                    m ? { ...m, form: v, fields: {}, modifiedField: '' } : m,
                  )
                }
                options={[
                  { value: '', label: 'Choose a form' },
                  ...(Array.isArray(forms) ? forms : []).map((f: any) => ({
                    value: f.link_name,
                    label:
                      (f.display_name ?? f.name ?? f.link_name) +
                      ' · ' +
                      f.link_name,
                  })),
                ]}
              />
            </Field>
            <Button
              variant="outline"
              disabled={busy || !editing.form}
              onClick={() =>
                void run(async () => {
                  await api('fields', { form: editing.form });
                  await refresh();
                }, 'Fields inspected for the selected form.')
              }
            >
              Inspect selected form fields
            </Button>
          </div>
          {fieldsAvailable ? (
            <div className="mapping-fields">
              {canonical.map((key) => (
                <Field
                  label={(FIELDS as any)[key] ?? EXTRA_LABELS[key] ?? key}
                  key={key}
                >
                  <SearchPicker
                    label={
                      'Map ' +
                      ((FIELDS as any)[key] ?? EXTRA_LABELS[key] ?? key)
                    }
                    value={editing.fields[key] ?? ''}
                    onChange={(value) =>
                      setEditing((m) => {
                        if (!m) return m;
                        const next = { ...m.fields };
                        if (value) next[key] = value;
                        else delete next[key];
                        return { ...m, fields: next };
                      })
                    }
                    options={[
                      { value: '', label: 'Not supplied / leave unmapped' },
                      ...fields.map((f: any) => ({
                        value: f.link_name,
                        label:
                          (f.display_name ?? f.name ?? f.link_name) +
                          ' · ' +
                          f.link_name,
                      })),
                    ]}
                  />
                </Field>
              ))}
            </div>
          ) : (
            <p className="muted">Inspect this form’s fields to map them.</p>
          )}
          <div className="form-grid">
            <Field label="Source timestamp format">
              <Picker
                label="Timestamp format"
                value={editing.dateFormat}
                onChange={(v) => update('dateFormat', v)}
                options={[
                  {
                    value: 'iso-offset',
                    label: 'ISO timestamp with timezone offset',
                  },
                  {
                    value: 'iso-local-ist',
                    label: 'ISO local timestamp, explicitly IST',
                  },
                  {
                    value: 'dd-MMM-yyyy HH:mm:ss',
                    label: 'dd-MMM-yyyy HH:mm:ss, explicitly IST',
                  },
                ]}
              />
            </Field>
            <Field label="Modified-time field (optional)">
              <Picker
                label="Modified-time field"
                value={editing.modifiedField ?? ''}
                onChange={(v) => update('modifiedField', v)}
                options={[
                  { value: '', label: 'No supported incremental field' },
                  ...(fieldsAvailable ? fields : []).map((f: any) => ({
                    value: f.link_name,
                    label: f.display_name ?? f.link_name,
                  })),
                ]}
              />
            </Field>
          </div>
          {['approvals', 'bookings'].includes(editing.kind) && (
            <fieldset className="decision-values">
              <legend>Map exact source decision values</legend>
              <p className="muted">
                Enter the actual source text for each decision. Do not map
                Assigned to approved unless your source evidence establishes
                that meaning.
              </p>
              {['approved', 'rejected', 'cancelled', 'pending'].map((value) => (
                <Field label={'Source text meaning ' + value} key={value}>
                  <Input
                    value={
                      Object.entries(editing.decisionValues ?? {}).find(
                        ([, v]) => v === value,
                      )?.[0] ?? ''
                    }
                    onChange={(e) => {
                      const next = Object.fromEntries(
                        Object.entries(editing.decisionValues ?? {}).filter(
                          ([, v]) => v !== value,
                        ),
                      );
                      if (e.target.value) next[e.target.value] = value;
                      update('decisionValues', next);
                    }}
                  />
                </Field>
              ))}
            </fieldset>
          )}
          <details>
            <summary>Advanced source paths and historical criteria</summary>
            <p className="muted">
              Use the source’s inspected field names and supported query syntax.
              Criteria limit the imported history; blank means all accessible
              report records. Nested lookup paths can be reviewed in the
              advanced JSON editor.
            </p>
            <Field label="Optional report criteria">
              <Textarea
                value={editing.criteria ?? ''}
                onChange={(e) => update('criteria', e.target.value)}
                rows={3}
              />
            </Field>
          </details>
          <h3>Mapping preview</h3>
          <dl className="mapping-preview">
            {Object.entries(editing.fields).map(([key, source]) => (
              <div key={key}>
                <dt>{(FIELDS as any)[key] ?? EXTRA_LABELS[key] ?? key}</dt>
                <dd>{source}</dd>
              </div>
            ))}
          </dl>
          <div className="saved-views">
            <Button
              disabled={
                !editing.report ||
                !editing.form ||
                !fieldsAvailable ||
                !Object.keys(editing.fields).length
              }
              onClick={() => {
                setMappings((ms) => [
                  ...ms.filter(
                    (m) => m.kind !== originalKind && m.kind !== editing.kind,
                  ),
                  editing,
                ]);
                setEditing(null);
                setMessage(
                  'Mapping added to draft. Save all mappings to activate it.',
                );
              }}
            >
              Add to mapping draft
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel this mapping
            </Button>
          </div>
        </div>
      )}
      <div className="saved-views">
        <Button
          disabled={
            busy ||
            !!editing ||
            JSON.stringify(mappings) ===
              JSON.stringify(settings.syncConfig.mappings)
          }
          onClick={() =>
            void run(async () => {
              await api('settings', {
                key: 'syncConfig',
                value: { ...settings.syncConfig, mappings },
              });
              await refresh();
              setMessage(
                'Mappings verified against discovered metadata and saved.',
              );
            }, 'Report mappings saved.')
          }
        >
          Save and validate all mappings
        </Button>
        <span role="status">{message}</span>
      </div>
    </section>
  );
}
const ROLE_COPY: Record<string, string> = {
  Viewer: 'Read authorized reports, evidence and exports. No changes.',
  'Register operator':
    'Upload originals, save corrections and confirm register entries. No permission decisions.',
  Manager:
    'Review reports, correct registers and record reasoned permission decisions.',
  Administrator: 'All records, connection setup, policies and staff access.',
};
export function StaffAccess({ settings, refresh, run, busy }: any) {
  const [email, setEmail] = useState(''),
    [role, setRole] = useState('Viewer'),
    [active, setActive] = useState(true),
    [invitation, setInvitation] = useState<{code: string; expiresAt: string} | null>(null);
  return (
    <section className="panel configuration">
      <h2>Staff access</h2>
      <p className="muted">
        Staff need an invitation, a Car Booking Details password and an active role.
        Record, attachment and export permissions are enforced by the server.
      </p>
      <DataTable
        headers={['Email', 'Role', 'Access', 'Edit']}
        empty={!settings.users.length}
        emptyTitle="No staff access configured"
      >
        {settings.users.map((u: any) => (
          <TableRow key={u.id}>
            <TableCell>{u.email}</TableCell>
            <TableCell>{u.role}</TableCell>
            <TableCell>{u.active ? 'Active' : 'Disabled'}</TableCell>
            <TableCell>
              <Button
                variant="outline"
                onClick={() => {
                  setEmail(u.email);
                  setRole(u.role);
                  setActive(!!u.active);
                }}
              >
                Edit access
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      <form
        className="staff-form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await api('users', { email, role, active });
            await refresh();
          }, 'Staff role updated. New staff also need an invitation to activate their sign-in.');
        }}
      >
        <Field label="Staff email">
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setInvitation(null);
              const existing = settings.users.find(
                (u: any) =>
                  u.email.toLowerCase() === e.target.value.toLowerCase(),
              );
              if (existing) {
                setRole(existing.role);
                setActive(!!existing.active);
              }
            }}
          />
        </Field>
        <Field label="Role">
          <Picker
            label="Staff role"
            value={role}
            onChange={setRole}
            options={Object.keys(ROLE_COPY).map((value) => ({
              value,
              label: value,
            }))}
          />
        </Field>
        <p className="role-preview">{ROLE_COPY[role]}</p>
        <label className="check-label">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active application access
        </label>
        <p className="muted">
          Saving will{' '}
          {active
            ? 'grant the selected application capabilities to'
            : 'disable application access for'}{' '}
          {email || 'this account'}.
        </p>
        <Button disabled={busy}>Save access</Button>
        <Button type="button" variant="outline" disabled={busy || !email || !active} onClick={() => void run(async () => {
          setInvitation(await api('invite', { email }));
        }, 'Invitation created. No email has been sent.')}>
          Create invitation for saved staff member
        </Button>
      </form>
      {invitation && <section className="notice" aria-label="Private invitation">
        <p>Share this code privately with {email}. It expires {new Date(invitation.expiresAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST.</p>
        <Input aria-label="Invitation code" readOnly value={invitation.code} onFocus={event => event.currentTarget.select()} />
        <p>The recipient selects “I have an invitation” on the sign-in screen. No notification has been sent.</p>
        <Button variant="ghost" onClick={() => setInvitation(null)}>Hide code</Button>
      </section>}
      <details>
        <summary>Compare role capabilities</summary>
        <dl className="role-matrix">
          {Object.entries(ROLE_COPY).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
