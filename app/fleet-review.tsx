'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  FIELDS,
  NUMBERS,
  TIMES,
  blank,
  normalize,
  type Values,
} from '@/lib/domain';
import {
  api,
  Badge,
  Picker,
  Field,
  SearchPicker,
  date,
  display,
  localTime,
  money,
  fmt,
} from './fleet-ui';
import {
  DocumentViewer,
  ChangeHistory,
  ApprovalTimeline,
  EvidenceComparison,
} from './fleet-evidence';
import { originalField } from '@/lib/evidence-view';
import { useDebounced } from './fleet-navigation';
import { TripRecords, Provenance } from './fleet-records';

const memoryDrafts = new Map<string, any>();
export function clearReviewDrafts() {
  memoryDrafts.clear();
}
function useMemoryDraft<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => memoryDrafts.get(key) ?? initial);
  useEffect(() => {
    memoryDrafts.set(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}
function useHistory(id: string, version?: number) {
  const [history, setHistory] = useState<any>(null);
  useEffect(() => {
    const c = new AbortController();
    setHistory(null);
    void api('history/' + encodeURIComponent(id), undefined, c.signal)
      .then(setHistory)
      .catch((e) => {
        if (e.name !== 'AbortError') setHistory({ error: e.message });
      });
    return () => c.abort();
  }, [id, version]);
  return history;
}
function useLeaveGuard(dirty: boolean, busy: boolean, onDiscard?: () => void) {
  const [pending, setPending] = useState<(() => void) | null>(null);
  useEffect(() => {
    if (!dirty && !busy) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, busy]);
  return {
    attempt: (action: () => void) => {
      if (busy) return;
      if (dirty) setPending(() => action);
      else action();
    },
    prompt: pending ? (
      <div className="unsaved-prompt" role="alert">
        <strong>Your changes have not been saved.</strong>
        <p>
          Keep editing to save them, or discard them before leaving this record.
        </p>
        <Button variant="outline" onClick={() => setPending(null)}>
          Keep editing
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            const action = pending;
            setPending(null);
            onDiscard?.();
            action();
          }}
        >
          Discard changes and leave
        </Button>
      </div>
    ) : null,
  };
}
const GROUPS: { label: string; keys: (keyof Values)[] }[] = [
  {
    label: 'Vehicle and people',
    keys: [
      'registerDate',
      'vehicleId',
      'employee',
      'employeeId',
      'driver',
      'driverId',
      'department',
      'bookingRef',
    ],
  },
  {
    label: 'Journey',
    keys: [
      'destination',
      'purpose',
      'passengers',
      'departure',
      'expectedReturn',
      'returnAt',
    ],
  },
  { label: 'Odometer', keys: ['startOdo', 'endOdo'] },
  {
    label: 'Fuel',
    keys: [
      'litres',
      'amount',
      'payer',
      'receiptRef',
      'fuelLevel',
      'fuelLevelAt',
    ],
  },
  { label: 'Notes and reported damage', keys: ['remarks', 'signaturePresent'] },
];
export function RegisterReview({
  row,
  documents,
  siblings = [],
  canEdit,
  close,
  refresh,
  navigate,
  returnFocus,
}: any) {
  const [values, setValues] = useMemoryDraft<Values>(
      'row:' + row.id + ':' + row.version,
      row.corrected ?? blank(),
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState('');
  const history = useHistory(row.id, row.version);
  const dirty = JSON.stringify(values) !== JSON.stringify(row.corrected);
  const guard = useLeaveGuard(dirty, busy, () =>
    memoryDrafts.delete('row:' + row.id + ':' + row.version),
  );
  useEffect(() => {
    setValues(
      memoryDrafts.get('row:' + row.id + ':' + row.version) ?? row.corrected,
    );
    setError('');
  }, [row.id, row.version]);
  const doc = documents.find((d: any) => d.id === row.documentId);
  const position = siblings.findIndex((r: any) => r.id === row.id);
  async function save(confirm: boolean) {
    setBusy(true);
    setError('');
    try {
      await api('row/' + encodeURIComponent(row.id), {
        version: row.version,
        values,
        confirm,
      });
      memoryDrafts.delete('row:' + row.id + ':' + row.version);
      await refresh();
      setSaved(
        confirm
          ? 'Register entry confirmed. Metrics have been recalculated.'
          : 'Correction saved as a draft. Confirm it before it contributes to trip records.',
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const field = (key: keyof Values) => {
    const flags = (row.flags ?? []).filter(
      (f: string) =>
        f.toLowerCase().includes(FIELDS[key].toLowerCase()) ||
        f.toLowerCase().includes(key.toLowerCase()),
    );
    const inputId = 'entry-' + key;
    return (
      <div
        className={'review-field ' + (flags.length ? 'uncertain' : '')}
        key={key}
      >
        <Field label={FIELDS[key] + (TIMES.includes(key) ? ' · IST' : '')}>
          {key === 'signaturePresent' ? (
            <Picker
              label={FIELDS[key]}
              value={
                values[key] === null ? 'unknown' : values[key] ? 'yes' : 'no'
              }
              onChange={(v) => {
                if (canEdit)
                  setValues((x) => ({
                    ...x,
                    [key]: v === 'unknown' ? null : v === 'yes',
                  }));
              }}
              options={[
                { value: 'unknown', label: 'Unknown' },
                { value: 'yes', label: 'Present — identity not inferred' },
                { value: 'no', label: 'Not present' },
              ]}
            />
          ) : (
            <Input
              id={inputId}
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
              max={key === 'fuelLevel' ? 100 : undefined}
              step={
                key === 'passengers'
                  ? 1
                  : NUMBERS.includes(key)
                    ? 'any'
                    : undefined
              }
              value={
                TIMES.includes(key)
                  ? localTime(values[key] as string | null)
                  : values[key] == null
                    ? ''
                    : String(values[key])
              }
              aria-invalid={flags.length > 0 || undefined}
              aria-describedby={flags.length ? inputId + '-hint' : undefined}
              onChange={(e) => {
                const raw = e.target.value;
                let value: any =
                  raw === '' ? null : NUMBERS.includes(key) ? Number(raw) : raw;
                if (raw && TIMES.includes(key)) {
                  const stamp = Date.parse(
                    raw + (raw.length === 16 ? ':00' : '') + '+05:30',
                  );
                  value = Number.isFinite(stamp)
                    ? new Date(stamp).toISOString()
                    : null;
                }
                setValues((x) => ({ ...x, [key]: value }));
              }}
            />
          )}
        </Field>
        {flags.length > 0 && (
          <p id={inputId + '-hint'} className="field-warning">
            Check original: {flags.join('; ')}
          </p>
        )}
        <details className="original-value">
          <summary>Original value</summary>
          <p>{display(originalField(row.original, key))}</p>
        </details>
      </div>
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) guard.attempt(close);
      }}
    >
      <DialogContent
        finalFocus={returnFocus}
        className="review-dialog fleet-overlay evidence-workspace"
      >
        <div className="review-header">
          <DialogTitle>Review register entry</DialogTitle>
          <DialogDescription>
            {doc?.name} · page {row.page}, row {row.row}. Missing fields remain
            unknown. Times use IST.
          </DialogDescription>
          <div className="review-navigation">
            <Badge text={row.state} />
            <span>
              Row {position + 1} of {siblings.length || 1}
            </span>
            <Button
              variant="outline"
              disabled={position <= 0 || busy}
              onClick={() =>
                guard.attempt(() => navigate(siblings[position - 1].id))
              }
            >
              Previous row
            </Button>
            <Button
              variant="outline"
              disabled={position >= siblings.length - 1 || busy}
              onClick={() =>
                guard.attempt(() => navigate(siblings[position + 1].id))
              }
            >
              Next row
            </Button>
          </div>
        </div>
        {guard.prompt}
        <div className="review-split">
          <aside className="desktop-document">
            <DocumentViewer
              document={doc}
              page={row.page}
              row={row.row}
              original={row.original}
            />
          </aside>
          <Tabs defaultValue="entry" className="review-tabs">
            <TabsList aria-label="Register evidence">
              <TabsTrigger value="document" className="mobile-document-tab">
                Document
              </TabsTrigger>
              <TabsTrigger value="entry">Entry</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="document">
              <DocumentViewer
                document={doc}
                page={row.page}
                row={row.row}
                original={row.original}
              />
            </TabsContent>
            <TabsContent value="entry" keepMounted>
              <p className="muted">
                Confirm only values supported by the original. A signature does
                not establish identity or approval.
              </p>
              {row.flags?.length > 0 && (
                <details className="field-warning" open>
                  <summary>{row.flags.length} extraction checks</summary>
                  {row.flags.map((f: string) => (
                    <p key={f}>{f}</p>
                  ))}
                </details>
              )}
              <form
                id="register-entry-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(true);
                }}
              >
                {GROUPS.map((g) => (
                  <details
                    className="field-group"
                    key={g.label}
                    open={
                      !(doc?.kind === 'receipt' || doc?.kind === 'fuel') ||
                      !['Journey', 'Notes and reported damage'].includes(
                        g.label,
                      )
                    }
                  >
                    <summary>{g.label}</summary>
                    <div className="form-grid">
                      {g.keys.filter((k) => FIELDS[k]).map(field)}
                    </div>
                  </details>
                ))}
              </form>
            </TabsContent>
            <TabsContent value="history">
              <ChangeHistory history={history} />
              <details>
                <summary>Original extraction and source references</summary>
                <pre className="json-view">
                  {JSON.stringify(row.original, null, 2)}
                </pre>
              </details>
            </TabsContent>
          </Tabs>
        </div>
        <footer className="review-actionbar">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {saved && <p role="status">{saved}</p>}
          <span>{dirty ? 'Unsaved corrections' : 'All changes saved'}</span>
          <Button variant="outline" onClick={() => guard.attempt(close)}>
            Back to documents
          </Button>
          {canEdit && (
            <>
              <Button
                variant="outline"
                disabled={busy || !dirty}
                onClick={() => void save(false)}
              >
                Save correction
              </Button>
              <Button form="register-entry-form" type="submit" disabled={busy}>
                {busy ? 'Saving…' : 'Confirm register entry'}
              </Button>
            </>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
const DECISIONS = [
  { value: 'unresolved', label: 'Leave unresolved' },
  { value: 'match', label: 'Confirm candidate booking link' },
  { value: 'unauthorized', label: 'Confirm unauthorized after review' },
  { value: 'exception', label: 'Accept documented exception' },
  { value: 'duplicate', label: 'Mark as the same trip' },
];
export function PermissionReview({
  trip,
  data: initial,
  canReview,
  close,
  refresh,
  returnFocus,
}: any) {
  const [data, setData] = useState(initial),
    [choice, setChoice] = useMemoryDraft<string>(
      'choice:' + trip.id,
      trip.bookingId ?? '',
    ),
    [decision, setDecision] = useMemoryDraft<string>(
      'decision:' + trip.id,
      'unresolved',
    ),
    [reason, setReason] = useMemoryDraft<string>('reason:' + trip.id, ''),
    [duplicate, setDuplicate] = useState(''),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [searching, setSearching] = useState(false);
  const q = useDebounced(query),
    history = useHistory(trip.id);
  const guard = useLeaveGuard(
    !!reason || decision !== 'unresolved' || choice !== (trip.bookingId ?? ''),
    busy,
    () => {
      for (const key of ['choice:', 'reason:', 'decision:'])
        memoryDrafts.delete(key + trip.id);
    },
  );
  useEffect(() => {
    const c = new AbortController();
    setSearching(true);
    void api(
      'detail/trip?id=' +
        encodeURIComponent(trip.id) +
        '&q=' +
        encodeURIComponent(q) +
        '&booking=' +
        encodeURIComponent(choice),
      undefined,
      c.signal,
    )
      .then((r) => {
        setData(r.data);
        setSearching(false);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          setSearching(false);
        }
      });
    return () => c.abort();
  }, [q, choice, trip.id]);
  const booking = data.bookings.find((b: any) => b.id === choice),
    doc = data.documents.find((d: any) => d.id === trip.documentId),
    events = booking
      ? data.approvals.filter((a: any) =>
          [booking.id, booking.bookingRef, booking.sourceId].includes(
            a.bookingRef,
          ),
        )
      : [];
  async function save() {
    setBusy(true);
    setError('');
    try {
      await api('review', {
        tripId: trip.id,
        evidenceHash: trip.evidenceHash,
        action: decision,
        bookingId: choice || null,
        duplicateOf: duplicate || null,
        reason,
      });
      for (const key of ['choice:', 'reason:', 'decision:'])
        memoryDrafts.delete(key + trip.id);
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
      onOpenChange={(open) => {
        if (!open) guard.attempt(close);
      }}
    >
      <DialogContent
        finalFocus={returnFocus}
        className="review-dialog fleet-overlay evidence-workspace"
      >
        <div className="review-header">
          <DialogTitle>Permission evidence</DialogTitle>
          <DialogDescription>
            {display(trip.employee)} · {display(trip.vehicleId)} ·{' '}
            {date(trip.departure ?? trip.registerDate)} IST
          </DialogDescription>
          <div className="status-pair">
            <Badge text={trip.tripStatus} />
            <Badge text={trip.permission} />
          </div>
        </div>
        {guard.prompt}
        <div className="review-split">
          <aside className="desktop-document">
            <DocumentViewer
              document={doc}
              page={trip.page}
              row={trip.row}
              original={
                data.rows?.find((r: any) => r.id === trip.rowId)?.original
              }
            />
            <Provenance record={trip} />
          </aside>
          <Tabs defaultValue="entry" className="review-tabs">
            <TabsList aria-label="Permission evidence">
              <TabsTrigger value="document" className="mobile-document-tab">
                Document
              </TabsTrigger>
              <TabsTrigger value="entry">Entry</TabsTrigger>
              <TabsTrigger value="booking">Booking</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="document">
              <DocumentViewer
                document={doc}
                page={trip.page}
                row={trip.row}
                original={
                  data.rows?.find((r: any) => r.id === trip.rowId)?.original
                }
              />
            </TabsContent>
            <TabsContent value="entry" keepMounted>
              <h3>Classification explanation</h3>
              {trip.differences?.length ? (
                trip.differences.map((d: string) => (
                  <p className="flag" key={d}>
                    {d}
                  </p>
                ))
              ) : (
                <p>
                  {trip.permission === 'Matched prior approval'
                    ? 'The server verified the required prior-approval evidence.'
                    : 'No detailed differences supplied. The recorded classification remains ' +
                      trip.permission +
                      '.'}
                </p>
              )}
              <EvidenceComparison trip={trip} booking={booking} />
              <details className="quality-detail">
                <summary>Recorded journey and odometer readings</summary>
                <dl className="detail-facts">
                  {[
                    'registerDate',
                    'departure',
                    'returnAt',
                    'startOdo',
                    'endOdo',
                    'remarks',
                  ].map((k) => (
                    <div key={k}>
                      <dt>{(FIELDS as any)[k]}</dt>
                      <dd>
                        {['registerDate', 'departure', 'returnAt'].includes(k)
                          ? date(trip[k])
                          : display(trip[k])}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
              <p className="muted">
                Original classification: {trip.originalPermission}. Rule:{' '}
                {data.ruleVersion}.
              </p>
              {canReview && (
                <form
                  id="permission-review-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                  }}
                >
                  <Field label="Review decision">
                    <Picker
                      label="Review decision"
                      value={decision}
                      onChange={setDecision}
                      options={DECISIONS}
                    />
                  </Field>
                  {decision === 'match' && (
                    <p className="field-warning">
                      Choose a candidate in the Booking tab. Linking it still
                      requires the server’s approval checks.
                    </p>
                  )}
                  {decision === 'duplicate' && (
                    <Field label="Canonical trip (same vehicle)">
                      <SearchPicker
                        value={duplicate}
                        onChange={setDuplicate}
                        label="Canonical trip"
                        options={[
                          { value: '', label: 'Choose a trip' },
                          ...data.trips.map((t: any) => ({
                            value: t.id,
                            label: `${display(t.employee)} · ${date(t.departure)} · ${t.id}`,
                          })),
                        ]}
                      />
                      <p className="muted">
                        Showing up to 30 same-vehicle records. Confirm the exact
                        source evidence.
                      </p>
                    </Field>
                  )}
                  <Field label="Reason and supporting evidence (required)">
                    <Textarea
                      required
                      minLength={5}
                      maxLength={4000}
                      rows={4}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </Field>
                  <div className="decision-preview">
                    <strong>
                      Decision to record:{' '}
                      {DECISIONS.find((d) => d.value === decision)?.label}
                    </strong>
                    <p>
                      Current outcome: {trip.permission}.{' '}
                      {decision === 'match'
                        ? 'The selected booking will be linked and the server will recalculate the evidence classification.'
                        : decision === 'unauthorized'
                          ? 'Result: Confirmed unauthorized after review.'
                          : decision === 'exception'
                            ? 'Result: Documented exception accepted.'
                            : decision === 'duplicate'
                              ? 'Result: this duplicate will be linked to the canonical trip and excluded from trip counts.'
                              : 'Result: Insufficient evidence; retained for review.'}
                    </p>
                    <p>
                      The original classification and evidence remain in
                      history. Later approval and accepted exceptions never
                      become prior approval.
                    </p>
                  </div>
                </form>
              )}
            </TabsContent>
            <TabsContent value="booking" keepMounted>
              <Field label="Find a booking">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Booking reference, employee or destination"
                />
              </Field>
              <p className="muted">
                {searching
                  ? 'Searching…'
                  : 'Suggested candidates or the first 30 search matches. Refine the search if needed.'}{' '}
                A suggestion is not approval.
              </p>
              <div className="candidate-list">
                {data.bookings.map((b: any) => (
                  <label
                    className={
                      'candidate-card ' + (choice === b.id ? 'selected' : '')
                    }
                    key={b.id}
                  >
                    <input
                      type="radio"
                      name="candidate-booking"
                      checked={choice === b.id}
                      onChange={() => setChoice(b.id)}
                    />
                    <span>
                      <strong>
                        {display(b.bookingRef ?? b.sourceId)} ·{' '}
                        {display(b.employee)}
                      </strong>
                      <span>
                        {display(b.vehicleId)} · {date(b.departure)}
                      </span>
                      <small>
                        {b.bookingRef && b.bookingRef === trip.bookingRef
                          ? 'Same booking reference. '
                          : ''}
                        {normalize(b.vehicleId) === normalize(trip.vehicleId)
                          ? 'Same recorded vehicle. '
                          : 'Vehicle differs. '}
                        {b.employee &&
                        normalize(b.employee) === normalize(trip.employee)
                          ? 'Same employee text. '
                          : 'Employee details need review. '}
                        {display(b.destination)}
                      </small>
                    </span>
                  </label>
                ))}
                {!data.bookings.length && (
                  <p>
                    No candidate bookings found in the last successful import.
                  </p>
                )}
              </div>
              {choice && (
                <Button variant="ghost" onClick={() => setChoice('')}>
                  Clear candidate
                </Button>
              )}
              <ApprovalTimeline approvals={events} trip={trip} />
            </TabsContent>
            <TabsContent value="history">
              <ChangeHistory history={history} />
            </TabsContent>
          </Tabs>
        </div>
        <footer className="review-actionbar">
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <Button variant="outline" onClick={() => guard.attempt(close)}>
            Back to records
          </Button>
          {canReview && (
            <Button
              form="permission-review-form"
              type="submit"
              disabled={
                busy ||
                reason.trim().length < 5 ||
                (decision === 'match' && !choice) ||
                (decision === 'duplicate' && !duplicate)
              }
            >
              {busy
                ? 'Saving…'
                : DECISIONS.find((d) => d.value === decision)?.label}
            </Button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
export function RecordDetail({ nav, canEdit, canReview, refresh }: any) {
  const [content, setContent] = useState<any>(null),
    [error, setError] = useState('');
  const key = nav.detail + ':' + nav.id;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await api(
          'detail/' +
            encodeURIComponent(nav.detail) +
            '?id=' +
            encodeURIComponent(nav.id),
          undefined,
          signal,
        );
        setContent({ key, value: response });
        setError('');
      } catch (e: any) {
        if (e.name !== 'AbortError') setError(e.message);
      }
    },
    [nav.detail, nav.id, key],
  );
  useEffect(() => {
    const c = new AbortController();
    setError('');
    void load(c.signal);
    return () => c.abort();
  }, [load]);
  const reload = async () => {
    await refresh();
    await load();
  };
  const value = content?.key === key ? content.value : null;
  if (error || !value)
    return (
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) nav.close();
        }}
      >
        <DialogContent finalFocus={nav.returnFocus} className="fleet-overlay">
          <DialogTitle>
            {error ? 'Record unavailable' : 'Loading evidence'}
          </DialogTitle>
          <DialogDescription>
            {error ||
              'Retrieving this record and its authorized source references.'}
          </DialogDescription>
          {error && <Button onClick={() => void load()}>Retry</Button>}
          <Button variant="outline" onClick={nav.close}>
            Back to records
          </Button>
        </DialogContent>
      </Dialog>
    );
  if (nav.detail === 'row')
    return (
      <RegisterReview
        key={nav.id}
        {...value}
        returnFocus={nav.returnFocus}
        canEdit={canEdit}
        close={nav.close}
        refresh={reload}
        navigate={(id: string) => nav.write({ detail: 'row', id }, true)}
      />
    );
  if (nav.detail === 'trip')
    return (
      <PermissionReview
        key={nav.id}
        {...value}
        returnFocus={nav.returnFocus}
        canReview={canReview}
        close={nav.close}
        refresh={reload}
      />
    );
  const b = value.booking,
    f = value.fuel,
    v = value.vehicle;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) nav.close();
      }}
    >
      <DialogContent
        finalFocus={nav.returnFocus}
        className="review-dialog fleet-overlay record-detail"
      >
        <DialogTitle>
          {b
            ? 'Booking evidence'
            : f
              ? 'Fuel purchase'
              : display(v?.name) + ' · vehicle history'}
        </DialogTitle>
        <DialogDescription>
          Recorded evidence and source references. Availability and location are
          not live telemetry.
        </DialogDescription>
        {b && (
          <>
            <dl className="detail-facts">
              {[
                'bookingRef',
                'employee',
                'driver',
                'department',
                'vehicleId',
                'destination',
                'purpose',
                'passengers',
                'status',
              ].map((k) => (
                <div key={k}>
                  <dt>{(FIELDS as any)[k] ?? k}</dt>
                  <dd>{display(b[k])}</dd>
                </div>
              ))}
            </dl>
            <p>
              Requested departure: {date(b.departure ?? b.registerDate)} ·
              Expected return: {date(b.expectedReturn)}
            </p>
            <ApprovalTimeline approvals={value.approvals} />
            <h3>
              {value.noUsage ? 'No recorded usage' : 'Linked actual trips'}
            </h3>
            {value.noUsage && <p>This does not establish a no-show.</p>}
            <TripRecords rows={value.trips} open={nav.open} />
            <Provenance record={{ ...b, source: 'zoho' }} />
          </>
        )}
        {f && (
          <>
            <dl className="detail-facts">
              {[
                ['Purchase date', date(f.registerDate ?? f.departure)],
                ['Vehicle', display(f.vehicleId)],
                ['Fuel purchased', fmt(f.litres, 2) + ' L'],
                [
                  'Amount',
                  f.amount == null
                    ? 'Not recorded'
                    : new Intl.NumberFormat('en-IN', {
                        style: 'currency',
                        currency: 'INR',
                        minimumFractionDigits: 2,
                      }).format(f.amount),
                ],
                ['Paid by', display(f.payer)],
                ['Receipt', display(f.receiptRef)],
              ].map(([label, val]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
            <DocumentViewer
              document={value.document}
              page={value.row?.page}
              row={value.row?.row}
            />
            <Provenance
              record={{
                ...f,
                documentId: value.document?.id,
                page: value.row?.page,
                row: value.row?.row,
              }}
            />
          </>
        )}
        {v && (
          <>
            <Badge text={v.availability} />
            <p>Latest evidence: {date(v.recordedAt)} · whole workspace</p>
            <h3>Recent trips · {value.counts.trips} total</h3>
            <TripRecords rows={value.trips} open={nav.open} />
            <h3>Recent fuel purchases · {value.counts.fuel} total</h3>
            {value.fuel.map((x: any) => (
              <Button
                variant="ghost"
                key={x.id}
                onClick={() => nav.open('fuel', x.id)}
              >
                {date(x.registerDate ?? x.departure)} · {money(x.amount)}
              </Button>
            ))}
            <h3>Recent bookings · {value.counts.bookings} total</h3>
            {value.bookings.map((x: any) => (
              <Button
                variant="ghost"
                key={x.id}
                onClick={() => nav.open('booking', x.id)}
              >
                {date(x.departure)} · {display(x.employee)}
              </Button>
            ))}
            <p className="muted">
              Showing up to 20 recent records of each type.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                nav.write({
                  view: 'Trip register',
                  detail: null,
                  id: null,
                  vehicleId: v.registration ?? v.id,
                  page: null,
                });
              }}
            >
              All trips for this vehicle
            </Button>
            {value.issues.map((x: any) => (
              <p className="flag" key={x.tripId + x.message}>
                {x.message}
              </p>
            ))}
          </>
        )}
        <Button variant="outline" onClick={nav.close}>
          Back to records
        </Button>
      </DialogContent>
    </Dialog>
  );
}
