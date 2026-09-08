'use client';
import { useState, useEffect } from 'react';
import { FileText, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { TableRow, TableCell } from '@/components/ui/table';
import { FIELDS, NUMBERS, TIMES, blank, type Values } from '@/lib/domain';
import {
  api,
  Badge,
  Picker,
  DataTable,
  Field,
  date,
  display,
  localTime,
} from './fleet-ui';

export function RegisterReview({
  row,
  documents,
  canEdit,
  close,
  refresh,
}: any) {
  const [values, setValues] = useState<Values>(row?.corrected ?? blank()),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<any>(null);
  useEffect(() => {
    if (row) {
      setValues(row.corrected);
      api('history/' + encodeURIComponent(row.id))
        .then(setHistory)
        .catch(() => {});
    }
  }, [row?.id]);
  if (!row) return null;
  const doc = documents.find((d: any) => d.id === row.documentId);
  async function save(confirm: boolean) {
    setBusy(true);
    setError('');
    try {
      await api('row/' + encodeURIComponent(row.id), {
        version: row.version,
        values,
        confirm,
      });
      await refresh();
      close();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent className="review-dialog">
        <DialogTitle>Review register row</DialogTitle>
        <DialogDescription>
          Page {row.page} · row {row.row} · {doc?.name}. Blank fields stay
          unknown. All date and time inputs use IST.
        </DialogDescription>
        <div className="review-workspace">
          <div className="original-pane">
            {doc?.mime === 'application/pdf' ? (
              <iframe
                title="Original register PDF"
                src={
                  '/api/fleet/document/' + row.documentId + '#page=' + row.page
                }
              />
            ) : (
              <img
                alt="Original uploaded vehicle register"
                src={'/api/fleet/document/' + row.documentId}
              />
            )}
            <details>
              <summary>Original extracted values & locations</summary>
              <pre className="json-view">
                {JSON.stringify(row.original, null, 2)}
              </pre>
            </details>
          </div>
          <div className="extraction-pane">
            <Badge text={row.state} />
            {row.flags.map((f: string) => (
              <p className="flag" key={f}>
                {f}
              </p>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void save(true);
              }}
            >
              <div className="form-grid">
                {(Object.keys(FIELDS) as (keyof Values)[]).map((key) => (
                  <Field
                    key={key}
                    label={FIELDS[key] + (TIMES.includes(key) ? ' · IST' : '')}
                  >
                    {key === 'signaturePresent' ? (
                      <Picker
                        label={FIELDS[key]}
                        value={
                          values[key] === null
                            ? 'unknown'
                            : values[key]
                              ? 'yes'
                              : 'no'
                        }
                        onChange={(v) => {
                          if (canEdit)
                            setValues({
                              ...values,
                              [key]: v === 'unknown' ? null : v === 'yes',
                            });
                        }}
                        options={[
                          { value: 'unknown', label: 'Unknown' },
                          {
                            value: 'yes',
                            label: 'Present (identity not inferred)',
                          },
                          { value: 'no', label: 'Not present' },
                        ]}
                      />
                    ) : (
                      <Input
                        disabled={!canEdit}
                        type={
                          NUMBERS.includes(key)
                            ? 'number'
                            : TIMES.includes(key)
                              ? 'datetime-local'
                              : key === 'registerDate'
                                ? 'date'
                                : 'text'
                        }
                        min={NUMBERS.includes(key) ? 0 : undefined}
                        step={NUMBERS.includes(key) ? 'any' : undefined}
                        value={
                          TIMES.includes(key)
                            ? localTime(values[key] as string | null)
                            : values[key] == null
                              ? ''
                              : String(values[key])
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          let value: any =
                            raw === ''
                              ? null
                              : NUMBERS.includes(key)
                                ? Number(raw)
                                : raw;
                          if (raw && TIMES.includes(key)) {
                            const stamp = Date.parse(
                              raw + (raw.length === 16 ? ':00' : '') + '+05:30',
                            );
                            value = Number.isFinite(stamp)
                              ? new Date(stamp).toISOString()
                              : null;
                          }
                          setValues({ ...values, [key]: value });
                        }}
                      />
                    )}
                  </Field>
                ))}
              </div>
              {error && (
                <p role="alert" className="form-error">
                  {error}
                </p>
              )}
              {canEdit && (
                <div className="form-actions">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void save(false)}
                  >
                    Save correction
                  </Button>
                  <Button disabled={busy}>Confirm register entry</Button>
                </div>
              )}
            </form>
          </div>
        </div>
        <details>
          <summary>
            Correction history ({history?.changes?.length ?? 0})
          </summary>
          <pre className="json-view">
            {JSON.stringify(history?.changes ?? [], null, 2)}
          </pre>
        </details>
      </DialogContent>
    </Dialog>
  );
}
export function PermissionReview({
  trip,
  data,
  canReview,
  close,
  refresh,
}: any) {
  const [choice, setChoice] = useState(trip?.bookingId ?? ''),
    [decision, setDecision] = useState('unresolved'),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [history, setHistory] = useState<any>(null);
  useEffect(() => {
    if (trip)
      api('history/' + encodeURIComponent(trip.id))
        .then(setHistory)
        .catch(() => {});
  }, [trip?.id]);
  if (!trip) return null;
  const b = data.bookings.find((b: any) => b.id === choice);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent className="review-dialog">
        <DialogTitle>Permission evidence</DialogTitle>
        <DialogDescription>
          Trip state and permission are separate. Decisions preserve the
          original classification.
        </DialogDescription>
        <div className="review-workspace">
          <div className="original-pane">
            {trip.documentId ? (
              <iframe
                title="Original trip register"
                src={
                  '/api/fleet/document/' +
                  trip.documentId +
                  '#page=' +
                  (trip.page ?? 1)
                }
              />
            ) : (
              <div className="source-evidence">
                <FileText size={32} />
                <h3>Zoho source record</h3>
                <p>{trip.id}</p>
                <p className="muted">
                  This source trip has no linked uploaded image.
                </p>
              </div>
            )}
            <dl className="setup-list">
              <dt>Trip ID</dt>
              <dd>{trip.id}</dd>
              <dt>Employee</dt>
              <dd>{display(trip.employee)}</dd>
              <dt>Driver</dt>
              <dd>{display(trip.driver)}</dd>
              <dt>Vehicle</dt>
              <dd>{display(trip.vehicleId)}</dd>
              <dt>Departure · IST</dt>
              <dd>{date(trip.departure)}</dd>
              <dt>Booking reference</dt>
              <dd>{display(trip.bookingRef)}</dd>
              <dt>Trip state</dt>
              <dd>{trip.tripStatus}</dd>
              <dt>Original classification</dt>
              <dd>{trip.originalPermission}</dd>
            </dl>
          </div>
          <div className="extraction-pane">
            <Badge text={trip.permission} />
            <h3 className="mt-5">Matching differences</h3>
            {trip.differences.length ? (
              trip.differences.map((d: string) => (
                <p className="flag" key={d}>
                  {d}
                </p>
              ))
            ) : (
              <p className="muted">
                Required evidence matches a prior approval.
              </p>
            )}
            <Field label="Candidate Zoho booking">
              <Picker
                label="Candidate booking"
                value={choice}
                onChange={setChoice}
                options={[
                  { value: '', label: 'Choose a booking' },
                  ...data.bookings.map((b: any) => ({
                    value: b.id,
                    label: `${trip.candidateIds?.includes(b.id) ? 'Suggested · ' : ''}${b.bookingRef ?? b.sourceId} · ${b.employee ?? 'Unknown'} · ${date(b.departure)}`,
                  })),
                ]}
              />
            </Field>
            {b && (
              <div className="booking-evidence">
                <h3>Candidate details</h3>
                <p>
                  {display(b.vehicleId)} · {display(b.employee)} ·{' '}
                  {display(b.driver)}
                </p>
                <p>
                  {date(b.departure)} → {date(b.expectedReturn)}
                </p>
                <p>
                  {display(b.destination)} · {display(b.passengers)} passengers
                </p>
                <h3>Approval history</h3>
                {data.approvals
                  .filter((a: any) =>
                    [b.id, b.bookingRef, b.sourceId].includes(a.bookingRef),
                  )
                  .map((a: any) => (
                    <p key={a.id}>
                      {a.decision ?? 'Unknown decision'} · {date(a.decidedAt)} ·{' '}
                      {display(a.approver)}
                    </p>
                  ))}
              </div>
            )}
            {canReview && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  setBusy(true);
                  setError('');
                  try {
                    await api('review', {
                      tripId: trip.id,
                      evidenceHash: trip.evidenceHash,
                      action: decision,
                      bookingId: choice || null,
                      duplicateOf: f.get('duplicateOf') || null,
                      reason: f.get('reason'),
                    });
                    await refresh();
                    close();
                  } catch (e: any) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Field label="Review decision">
                  <Picker
                    label="Review decision"
                    value={decision}
                    onChange={setDecision}
                    options={[
                      { value: 'unresolved', label: 'Leave unresolved' },
                      {
                        value: 'match',
                        label: 'Confirm candidate booking link',
                      },
                      {
                        value: 'unauthorized',
                        label: 'Confirm unauthorized after review',
                      },
                      {
                        value: 'exception',
                        label: 'Accept a documented exception',
                      },
                      {
                        value: 'duplicate',
                        label: 'Same trip as another record',
                      },
                    ]}
                  />
                </Field>
                {decision === 'duplicate' && (
                  <Field label="Canonical trip">
                    <select
                      name="duplicateOf"
                      className="native-select"
                      required
                    >
                      <option value="">Choose another trip</option>
                      {data.trips
                        .filter((t: any) => t.id !== trip.id)
                        .map((t: any) => (
                          <option value={t.id} key={t.id}>
                            {t.id} · {t.employee} · {date(t.departure)}
                          </option>
                        ))}
                    </select>
                  </Field>
                )}
                <Field label="Reason and supporting evidence (required)">
                  <Textarea name="reason" required minLength={5} rows={4} />
                </Field>
                <p className="muted">
                  Later approval and accepted exceptions never count as prior
                  approval. A candidate link still has to pass the matching
                  rules.
                </p>
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                <Button disabled={busy}>Save review decision</Button>
              </form>
            )}
          </div>
        </div>
        <details>
          <summary>Decision and evidence history</summary>
          <pre className="json-view">
            {JSON.stringify(history ?? {}, null, 2)}
          </pre>
        </details>
      </DialogContent>
    </Dialog>
  );
}
export function SettingsPanel({ busy, run, sync, fresh }: any) {
  const [settings, setSettings] = useState<any>(null),
    [key, setKey] = useState('syncConfig'),
    [draft, setDraft] = useState('');
  useEffect(() => {
    api('settings').then((s) => {
      setSettings(s);
      setDraft(JSON.stringify(s[key], null, 2));
    });
  }, [key]);
  if (!settings)
    return <div className="panel">Loading connection settings…</div>;
  const save = () =>
    run(async () => {
      await api('settings', { key, value: JSON.parse(draft) });
      setSettings(await api('settings'));
    }, 'Configuration saved.');
  return (
    <>
      <div className="settings-grid">
        <section className="panel">
          <h2>Zoho Creator · read-only</h2>
          <p className="muted">
            Verify the account allowance and save an API budget first. Discover
            reports and fields before creating mappings. Do not enter
            credentials into these forms.
          </p>
          <dl className="setup-list">
            <dt>Server OAuth secrets</dt>
            <dd>
              {settings.configured.zoho ? 'Configured' : 'Not configured'}
            </dd>
            <dt>Report mappings</dt>
            <dd>{settings.syncConfig.mappings.length} mappings</dd>
            <dt>Last successful import</dt>
            <dd>{date(fresh.lastSuccess)}</dd>
            <dt>Scheduled trigger secret</dt>
            <dd>
              {settings.configured.schedulerSecret
                ? 'Configured; verify external trigger'
                : 'Not configured'}
            </dd>
          </dl>
          <div className="review-actions">
            <Button
              disabled={busy || !settings.configured.zoho}
              onClick={() =>
                run(async () => {
                  await api('discover', {});
                  setSettings(await api('settings'));
                }, 'Actual report and form metadata saved.')
              }
            >
              Discover reports
            </Button>
            <Button
              variant="outline"
              disabled={busy || !settings.configured.zoho}
              onClick={sync}
            >
              Import history
            </Button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                await api('fields', { form: f.get('form') });
                setSettings(await api('settings'));
              }, 'Form fields inspected.');
            }}
            className="inline-form"
          >
            <Field label="Form link name from discovered metadata">
              <Input name="form" required />
            </Field>
            <Button variant="outline" disabled={busy}>
              Inspect fields
            </Button>
          </form>
          <details>
            <summary>Discovered metadata</summary>
            <pre className="json-view">
              {JSON.stringify(
                settings.metadata ?? {
                  status: 'Not inspected. No names assumed.',
                },
                null,
                2,
              )}
            </pre>
          </details>
        </section>
        <section className="panel">
          <h2>Extraction & data handling</h2>
          <p className="muted">
            Azure Document Intelligence Layout receives uploaded pages and
            returns text, tables, confidence and source coordinates. Signature
            identity is never inferred.
          </p>
          <p className="muted">
            Regional per-page charges need confirmation. Set the monthly page
            budget, endpoint and server key before enabling. Pages beyond the
            configured range need a separate upload.
          </p>
          <dl className="setup-list">
            <dt>Automatic extraction</dt>
            <dd>
              {settings.configured.extraction ? 'Configured' : 'Disabled'}
            </dd>
            <dt>Original retention</dt>
            <dd>
              {settings.retention.originalDays
                ? settings.retention.originalDays + ' days; administrator purge'
                : 'Retain until a policy is agreed'}
            </dd>
            <dt>External notifications</dt>
            <dd>Disabled · authorization required</dd>
          </dl>
          <a
            className="text-link"
            href="https://azure.microsoft.com/en-us/pricing/details/document-intelligence/"
            target="_blank"
            rel="noreferrer"
          >
            Azure pricing <ExternalLink size={14} />
          </a>
        </section>
      </div>
      <section className="panel configuration">
        <h2>Configuration</h2>
        <p className="muted">
          Explicit field mappings and policies. OAuth credentials and refresh
          tokens belong in server secrets.
        </p>
        <Picker
          value={key}
          onChange={setKey}
          label="Configuration category"
          options={[
            'syncConfig',
            'rules',
            'registerColumns',
            'extractionBudget',
            'retention',
            'notificationRules',
          ].map((v) => ({ value: v, label: v }))}
        />
        <Textarea
          aria-label="Configuration JSON"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={13}
          className="json-editor"
        />
        <Button disabled={busy} onClick={save}>
          Save configuration
        </Button>
      </section>
      <section className="panel configuration">
        <h2>Staff access</h2>
        <p className="muted">
          Role grants apply to reports, attachments and exports. Staff also need
          access through the private site’s sharing controls.
        </p>
        <DataTable
          headers={['Email', 'Role', 'Access']}
          empty={!settings.users.length}
        >
          {settings.users.map((u: any) => (
            <TableRow key={u.id}>
              <TableCell>{u.email}</TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>{u.active ? 'Active' : 'Disabled'}</TableCell>
            </TableRow>
          ))}
        </DataTable>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              await api('users', {
                email: f.get('email'),
                role: f.get('role'),
                active: f.get('active') === 'on',
              });
              setSettings(await api('settings'));
            }, 'Staff access updated.');
          }}
        >
          <Field label="Staff email">
            <Input type="email" name="email" required />
          </Field>
          <Field label="Role">
            <select name="role" className="native-select">
              {['Viewer', 'Register operator', 'Manager', 'Administrator'].map(
                (r) => (
                  <option key={r}>{r}</option>
                ),
              )}
            </select>
          </Field>
          <label className="check-label">
            <input type="checkbox" name="active" defaultChecked /> Active
          </label>
          <Button disabled={busy}>Save access</Button>
        </form>
      </section>
      <section className="panel configuration">
        <h2>Synchronization history</h2>
        <DataTable
          headers={['Started', 'State', 'Mode', 'Pages / records', 'Details']}
          empty={!settings.runs.length}
        >
          {settings.runs.map((r: any) => (
            <TableRow key={r.id}>
              <TableCell>{date(r.startedAt)}</TableCell>
              <TableCell>{r.status}</TableCell>
              <TableCell>{r.mode}</TableCell>
              <TableCell>
                {r.pages} / {r.count}
              </TableCell>
              <TableCell>{r.error ?? '—'}</TableCell>
            </TableRow>
          ))}
        </DataTable>
      </section>
    </>
  );
}
