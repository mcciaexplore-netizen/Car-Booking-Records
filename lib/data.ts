import {
  all,
  first,
  db,
  setting,
  now,
  hash,
  id,
  HttpError,
  runtime,
} from './server';
import { pageRecords, sortedRecords, summarize } from './reporting';
import {
  RULE_VERSION,
  PERMISSIONS,
  DEFAULT_RULES,
  reconcile,
  deduplicateTrips,
  latestDecisions,
  tripStatus,
  validDistance,
  filterRecords,
  metrics,
  odometerIssues,
  type Trip,
  type Booking,
  type Approval,
  type Vehicle,
  type Fuel,
  type Decision,
} from './domain';
import { configured, SYNC_DEFAULT } from './zoho';
export async function dataset() {
  const generation = await setting<string | null>('activeGeneration', null);
  const source = generation
    ? await all(
        'SELECT kind,data FROM source_records WHERE generation=?',
        generation,
      )
    : [];
  const select = (kind: string) =>
    source.filter((r) => r.kind === kind).map((r) => JSON.parse(r.data));
  const local = await all(
    'SELECT t.*,r.documentId,r.page,r.row,r.state FROM actual_trips t JOIN extracted_rows r ON t.rowId=r.id',
  );
  const trips: Trip[] = [
    ...select('trips'),
    ...local
      .filter((r) => r.state === 'Confirmed register entry')
      .map((r) => ({
        ...JSON.parse(r.data),
        id: r.id,
        rowId: r.rowId,
        documentId: r.documentId,
        page: r.page,
        row: r.row,
        source: 'register',
        confirmed: true,
      })),
  ];
  const fuel: Fuel[] = [
    ...select('fuel'),
    ...(await all('SELECT * FROM fuel_purchases')).map((r) => ({
      ...JSON.parse(r.data),
      id: r.id,
      rowId: r.rowId,
      source: 'register',
    })),
  ];
  const seenFuel = new Map<string, Fuel>();
  for (const f of fuel) {
    const key =
      f.receiptRef &&
      f.vehicleId &&
      f.registerDate &&
      f.litres !== null &&
      f.amount !== null
        ? `${f.vehicleId}|${f.registerDate}|${f.receiptRef}|${f.litres}|${f.amount}`
        : f.id;
    const match = seenFuel.get(key);
    if (match && match.source !== f.source) match.source = 'both';
    else seenFuel.set(match ? key + '|' + f.id : key, f);
  }
  return {
    generation,
    trips,
    fuel: [...seenFuel.values()],
    bookings: select('bookings') as Booking[],
    approvals: select('approvals') as Approval[],
    vehicles: select('vehicles') as Vehicle[],
    employees: select('employees'),
    drivers: select('drivers'),
    maintenance: select('maintenance'),
    decisions: await all<Decision>(
      'SELECT * FROM review_decisions ORDER BY createdAt,id',
    ),
  };
}
export async function evaluate(data: Awaited<ReturnType<typeof dataset>>) {
  const originalResults = new Map<string, any>();
  for (const r of await all(
    'SELECT tripId,result FROM reconciliations ORDER BY createdAt,id',
  )) {
    if (!originalResults.has(r.tripId))
      originalResults.set(r.tripId, JSON.parse(r.result));
  }
  const rules = await setting('rules', DEFAULT_RULES),
    latest = latestDecisions(data.decisions),
    output: Trip[] = [];
  for (const trip of deduplicateTrips(data.trips)) {
    const evidenceHash = await hash({
      trip,
      bookings: data.bookings,
      approvals: data.approvals,
      vehicles: data.vehicles,
      rules,
      RULE_VERSION,
    });
    const decision = latest.get(trip.id),
      valid = decision?.evidenceHash === evidenceHash;
    const match = reconcile(
      trip,
      data.bookings,
      data.approvals,
      data.vehicles,
      rules,
      valid && decision.action === 'match'
        ? (decision.bookingId ?? undefined)
        : undefined,
    );
    const originalPermission =
      originalResults.get(trip.id)?.originalPermission ?? match.permission;
    if (valid && decision.action === 'unauthorized')
      match.permission = PERMISSIONS[4];
    if (valid && decision.action === 'exception')
      match.permission = PERMISSIONS[5];
    if (valid && decision.action === 'unresolved') {
      match.permission = PERMISSIONS[3];
      match.differences.push('Reviewer left this trip unresolved.');
    }
    if (decision && !valid)
      match.differences.push(
        'Evidence changed since the last review; decision retained in history and requires re-review.',
      );
    const b = data.bookings.find((b) => b.id === match.bookingId);
    output.push({
      ...trip,
      ...match,
      originalPermission,
      evidenceHash,
      expectedReturn: trip.expectedReturn ?? b?.expectedReturn ?? null,
      tripStatus: tripStatus({
        ...trip,
        expectedReturn: trip.expectedReturn ?? b?.expectedReturn ?? null,
      }),
      distance: validDistance(trip),
    });
  }
  return output.filter((t) => {
    const d = latest.get(t.id);
    if (
      d?.action !== 'duplicate' ||
      d.evidenceHash !== t.evidenceHash ||
      !d.duplicateOf
    )
      return true;
    const target = output.find((x) => x.id === d.duplicateOf);
    if (!target) return true;
    target.linkedSourceIds = [...(target.linkedSourceIds ?? []), t.id];
    return false;
  });
}
export async function snapshot(params = new URLSearchParams()) {
  const data = await dataset(),
    evaluated = await evaluate(data),
    trips = filterRecords(evaluated, params);
  const fuelParams = new URLSearchParams(params);
  fuelParams.delete('permission');
  fuelParams.delete('outcome');
  fuelParams.delete('issue');
  if (!fuelParams.get('metric')?.startsWith('fuel-'))
    fuelParams.delete('metric');
  const fuel = filterRecords(data.fuel, fuelParams, 'purchase');
  const docs = await all(
    'SELECT id,name,mime,size,kind,status,uploadedBy,createdAt,error,deletedAt FROM documents WHERE deletedAt IS NULL ORDER BY createdAt DESC',
  );
  const rows = (
    await all('SELECT * FROM extracted_rows ORDER BY createdAt DESC')
  ).map((r) => ({
    ...r,
    original: JSON.parse(r.original),
    corrected: JSON.parse(r.corrected),
    flags: JSON.parse(r.flags),
  }));
  const pendingRows = rows.filter(
    (r) => r.state !== 'Confirmed register entry',
  );
  const pending = docs.filter(
    (d) =>
      pendingRows.some((r) => r.documentId === d.id) ||
      !rows.some((r) => r.documentId === d.id),
  ).length;
  const sync = await first(
      'SELECT * FROM sync_runs ORDER BY startedAt DESC LIMIT 1',
    ),
    success = data.generation
      ? await first('SELECT * FROM sync_runs WHERE id=?', data.generation)
      : null;
  const config = await setting('syncConfig', SYNC_DEFAULT);
  const stale =
    !!success &&
    Date.now() - Date.parse(success.finishedAt) >
      config.intervalMinutes * 120000;
  const vehicles = data.vehicles.map((v) => {
    const vehicleTrips = evaluated.filter(
      (t) =>
        t.vehicleId &&
        t.vehicleId.replace(/[\s-]/g, '').toLowerCase() ===
          (v.registration ?? v.id).replace(/[\s-]/g, '').toLowerCase(),
    );
    const ordered = vehicleTrips.sort(
      (a, b) =>
        Date.parse(b.returnAt ?? b.departure ?? '') -
        Date.parse(a.returnAt ?? a.departure ?? ''),
    );
    const latest = ordered[0],
      active = vehicleTrips.filter((t) =>
        ['In progress', 'Overdue'].includes(t.tripStatus ?? ''),
      );
    const odo = ordered.find((t) => t.endOdo !== null && t.distance !== null);
    const level = [...vehicleTrips, v]
      .filter((x) => x.fuelLevel != null && x.fuelLevelAt)
      .sort(
        (a, b) => Date.parse(b.fuelLevelAt!) - Date.parse(a.fuelLevelAt!),
      )[0];
    return {
      ...v,
      fuelLevel: level?.fuelLevel ?? null,
      fuelLevelAt: level?.fuelLevelAt ?? null,
      availability:
        active.length > 1
          ? 'Conflicting records'
          : active.length
            ? 'Recorded in use'
            : latest?.tripStatus === 'Returned'
              ? 'Recorded returned'
              : 'Unknown',
      current: active.length === 1 ? active[0] : null,
      odometer: odo?.endOdo ?? null,
      odometerAt: odo?.returnAt ?? null,
      recordedAt: latest?.returnAt ?? latest?.departure ?? null,
    };
  });
  const bookings = filterRecords(
    data.bookings.map((b) => ({ ...b, source: 'zoho' })),
    (() => {
      const p = new URLSearchParams(params);
      p.delete('metric');
      p.delete('permission');
      p.delete('outcome');
      p.delete('issue');
      return p;
    })(),
  );
  const noUsage = bookings.filter((b) => {
    const events = data.approvals.filter((a) =>
      [b.id, b.bookingRef, b.sourceId].includes(a.bookingRef),
    );
    if (
      events.some((a) => !a.decidedAt) ||
      ['rejected', 'cancelled'].includes(b.status ?? '')
    )
      return false;
    const last = events
      .filter((a) => Date.parse(a.decidedAt!) <= Date.now())
      .sort((a, b) => Date.parse(a.decidedAt!) - Date.parse(b.decidedAt!))
      .at(-1);
    return (
      !evaluated.some((t) => t.bookingId === b.id) &&
      last?.decision === 'approved'
    );
  });
  const result = {
    fixtureMode: runtime().FLEET_UX_FIXTURES === '1',
    trips,
    fuel,
    vehicles,
    bookings,
    approvals: data.approvals,
    employees: data.employees,
    drivers: data.drivers,
    maintenance: filterRecords(data.maintenance, params),
    documents: docs,
    rows,
    decisions: data.decisions,
    metrics: metrics(trips, fuel, pending),
    noUsage,
    issues: odometerIssues(trips).map((issue) => {
      const t = trips.find((t) => t.id === issue.tripId);
      return {
        ...issue,
        departure: t?.departure,
        registerDate: t?.registerDate,
        vehicleId: t?.vehicleId,
        startOdo: t?.startOdo,
        endOdo: t?.endOdo,
      };
    }),
    freshness: {
      connected: await configured(),
      sync,
      lastSuccess: success?.finishedAt ?? null,
      stale,
      scope: 'Last fully imported report snapshot',
      intervalMinutes: config.intervalMinutes,
    },
    ruleVersion: RULE_VERSION,
    extractionAvailable:
      runtime().EXTRACTION_ENABLED === 'true' &&
      !!runtime().AZURE_DOCUMENT_KEY &&
      !!runtime().AZURE_DOCUMENT_ENDPOINT,
    hasRecords: !!(
      data.generation ||
      data.trips.length ||
      docs.length ||
      data.fuel.length
    ),
    counts: {
      trips: trips.length,
      bookings: bookings.length,
      fuel: fuel.length,
      documents: docs.length,
      noUsage: noUsage.length,
      maintenance: filterRecords(data.maintenance, params).length,
    },
    personOptions: Object.fromEntries(
      ['employee', 'driver'].map((key) => [
        key,
        [
          ...new Map(
            [...evaluated, ...data.bookings]
              .filter((r) => r[key as 'employee' | 'driver'])
              .map((r) => {
                const person = r as Record<string, unknown>;
                const name = String(person[key]);
                const id = person[key + 'Id'];
                return [
                  id ? 'id:' + id : name,
                  {
                    value: id ? 'id:' + id : name,
                    label: name + (id ? ' · ' + id : ''),
                  },
                ];
              }),
          ).values(),
        ].sort((a, b) => a.label.localeCompare(b.label)),
      ]),
    ),
    options: Object.fromEntries(
      ['employee', 'driver', 'department', 'destination'].map((key) => [
        key,
        [
          ...new Set(
            [...evaluated, ...data.bookings]
              .map((r: any) => r[key])
              .filter(Boolean),
          ),
        ].sort(),
      ]),
    ),
  };
  if (!params.has('pageSize')) return result;
  const summaries = summarize(result);
  const page = Number(params.get('page')) || 1,
    size = Number(params.get('pageSize')) || 20;
  const sort = [
    'date',
    'employee',
    'vehicleId',
    'distance',
    'amount',
    'litres',
    'name',
  ].includes(params.get('sort') ?? '')
    ? params.get('sort')!
    : 'date';
  const lists = [
    'trips',
    'bookings',
    'fuel',
    'documents',
    'noUsage',
    'maintenance',
  ] as const;
  const pagination: Record<string, any> = {};
  const paged = { ...result };
  for (const key of lists) {
    const list =
      key === 'bookings' && params.get('metric') === 'no-usage'
        ? noUsage
        : key === 'documents' && params.get('metric') === 'pending'
          ? docs.filter(
              (d) =>
                pendingRows.some((r) => r.documentId === d.id) ||
                !rows.some((r) => r.documentId === d.id),
            )
          : result[key];
    const p = pageRecords(
      sortedRecords(
        list as Record<string, unknown>[],
        sort,
        params.get('direction') ?? 'desc',
        key === 'fuel' ? 'purchase' : 'journey',
      ),
      page,
      size,
    );
    (paged as any)[key] = p.items;
    pagination[key] = { ...p, items: undefined };
  }
  const docIds = new Set(paged.documents.map((d) => d.id));
  // Lists contain row references only; original/corrected evidence is fetched on demand.
  paged.rows = rows
    .filter((r) => docIds.has(r.documentId))
    .map(({ id, documentId, page, row, state }: any) => ({
      id,
      documentId,
      page,
      row,
      state,
    })) as any;
  paged.approvals = data.approvals.filter((a) =>
    paged.bookings.some((b) =>
      [b.id, b.sourceId, b.bookingRef].includes(a.bookingRef),
    ),
  );
  paged.decisions = [];
  return {
    ...paged,
    summaries,
    pagination,
    recentTrips: sortedRecords(trips).slice(0, 5),
    documentProgress: Object.fromEntries(
      docs.map((d) => {
        const rs = rows.filter((r) => r.documentId === d.id);
        return [
          d.id,
          {
            total: rs.length,
            confirmed: rs.filter((r) => r.state === 'Confirmed register entry')
              .length,
            pageCount: d.mime === 'application/pdf' ? null : 1,
          },
        ];
      }),
    ),
  };
}
export async function recordReconciliations() {
  const data = await dataset(),
    trips = await evaluate(data);
  for (let i = 0; i < trips.length; i += 40)
    await db().batch(
      trips
        .slice(i, i + 40)
        .map((t) =>
          db()
            .prepare(
              'INSERT OR IGNORE INTO reconciliations(id,tripId,inputHash,ruleVersion,result,createdAt) VALUES(?,?,?,?,?,?)',
            )
            .bind(
              `${t.id}:${t.evidenceHash}`,
              t.id,
              t.evidenceHash!,
              RULE_VERSION,
              JSON.stringify(t),
              now(),
            ),
        ),
    );
  const existing = await all('SELECT id FROM alerts WHERE state=?', 'open');
  const wanted = new Map<
    string,
    { kind: string; entityId: string; message: string }
  >();
  for (const t of trips) {
    if (PERMISSIONS.slice(1, 4).includes(t.permission as any))
      wanted.set(`permission:${t.id}`, {
        kind: 'permission',
        entityId: t.id,
        message: 'Trip needs permission review',
      });
    if (t.tripStatus === 'Overdue')
      wanted.set(`overdue:${t.id}`, {
        kind: 'overdue',
        entityId: t.id,
        message: 'Recorded return is overdue',
      });
    if (t.startOdo === null || t.endOdo === null || !t.returnAt)
      wanted.set(`missing:${t.id}`, {
        kind: 'missing',
        entityId: t.id,
        message: 'Return or odometer details are missing',
      });
  }
  for (const r of await all(
    "SELECT id FROM extracted_rows WHERE state!='Confirmed register entry'",
  ))
    wanted.set(`correction:${r.id}`, {
      kind: 'correction',
      entityId: r.id,
      message: 'Uploaded row needs correction or confirmation',
    });
  const sync = await first(
    'SELECT * FROM sync_runs ORDER BY startedAt DESC LIMIT 1',
  );
  if (sync && ['failed', 'retrying'].includes(sync.status))
    wanted.set('sync:failure', {
      kind: 'sync',
      entityId: sync.id,
      message: 'Synchronization needs attention; previous data retained',
    });
  const enabled = await setting<Record<string, boolean>>(
    'notificationRules',
    {},
  );
  for (const [key, a] of wanted)
    if (enabled[a.kind] === false) wanted.delete(key);
  for (const [key, a] of wanted)
    await db()
      .prepare(
        "INSERT INTO alerts(id,kind,entityId,message,state,createdAt,updatedAt) VALUES(?,?,?,?,'open',?,?) ON CONFLICT(id) DO UPDATE SET state='open',updatedAt=excluded.updatedAt",
      )
      .bind(key, a.kind, a.entityId, a.message, now(), now())
      .run();
  for (const a of existing)
    if (!wanted.has(a.id))
      await db()
        .prepare("UPDATE alerts SET state='resolved',updatedAt=? WHERE id=?")
        .bind(now(), a.id)
        .run();
}
export async function review(input: any, actor: string) {
  if (
    typeof input.reason !== 'string' ||
    input.reason.trim().length < 5 ||
    input.reason.length > 4000
  )
    throw new HttpError(
      400,
      'Record a clear reason and evidence for the decision.',
    );
  const data = await dataset(),
    trips = await evaluate(data),
    trip = trips.find((t) => t.id === input.tripId);
  if (!trip || !trip.confirmed)
    throw new HttpError(
      409,
      'Only confirmed register or source trips can receive a permission decision.',
    );
  if (input.evidenceHash !== trip.evidenceHash)
    throw new HttpError(409, 'Trip evidence changed. Reload before deciding.');
  if (
    !['match', 'unresolved', 'unauthorized', 'exception', 'duplicate'].includes(
      input.action,
    )
  )
    throw new HttpError(400, 'Unknown review decision.');
  if (
    input.action === 'match' &&
    !data.bookings.some((b) => b.id === input.bookingId)
  )
    throw new HttpError(400, 'Choose an existing booking.');
  if (
    input.action === 'duplicate' &&
    (!trips.some((t) => t.id === input.duplicateOf) ||
      input.duplicateOf === trip.id)
  )
    throw new HttpError(400, 'Select another canonical trip.');
  const current = latestDecisions(data.decisions);
  if (
    input.action === 'duplicate' &&
    [...current.values()].some(
      (d) => d.action === 'duplicate' && d.duplicateOf === trip.id,
    )
  )
    throw new HttpError(
      400,
      'Resolve the existing duplicate link first; linked trip chains are not allowed.',
    );
  await db()
    .prepare(
      'INSERT INTO review_decisions(id,tripId,action,bookingId,duplicateOf,reason,reviewer,createdAt,evidenceHash,originalResult) VALUES(?,?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      id(),
      trip.id,
      input.action,
      input.bookingId ?? null,
      input.duplicateOf ?? null,
      input.reason.trim(),
      actor,
      now(),
      trip.evidenceHash!,
      JSON.stringify(trip),
    )
    .run();
  await recordReconciliations();
  return { saved: true };
}
