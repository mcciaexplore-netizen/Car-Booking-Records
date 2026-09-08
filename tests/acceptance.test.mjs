import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  domain as d,
  server as s,
  zoho as z,
  documents as docs,
  data as dataService,
  routes,
} from '../work/fleet-tests.mjs';
let sqlite;
const realFetch = globalThis.fetch;
function makeDB() {
  sqlite?.close();
  sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync('drizzle/' + f, 'utf8'));
  return {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...this.args) };
        },
        async first() {
          return sqlite.prepare(sql).get(...this.args) ?? null;
        },
        async run() {
          const r = sqlite.prepare(sql).run(...this.args);
          return { success: true, meta: { changes: Number(r.changes) } };
        },
      };
      return stmt;
    },
    async batch(stmts) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const stmt of stmts) results.push(await stmt.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
beforeEach(() => {
  globalThis.TEST_ENV = {
    DB: makeDB(),
    FLEET_ADMIN_EMAIL: 'owner@example.test',
    DOCUMENTS: {
      files: new Map(),
      async put(key, data) {
        this.files.set(key, data);
      },
      async get(key) {
        const value = this.files.get(key);
        return value ? { body: value } : null;
      },
      async delete(key) {
        this.files.delete(key);
      },
    },
  };
  globalThis.TEST_HEADERS = new Headers({
    'oai-authenticated-user-id': 'owner-id',
    'oai-authenticated-user-email': 'owner@example.test',
  });
  globalThis.fetch = realFetch;
});
const trip = (changes = {}) => ({
  ...d.blank(),
  id: 't1',
  source: 'register',
  confirmed: true,
  vehicleId: 'MH12AB1234',
  employee: 'Employee A',
  driver: 'Driver A',
  bookingRef: 'B1',
  passengers: 2,
  departure: '2026-09-01T04:00:00.000Z',
  returnAt: '2026-09-01T06:00:00.000Z',
  startOdo: 100,
  endOdo: 140,
  ...changes,
});
const booking = (changes = {}) => ({
  ...d.blank(),
  id: 'b1',
  sourceId: '1',
  bookingRef: 'B1',
  vehicleId: 'MH12AB1234',
  employee: 'Employee A',
  driver: 'Driver A',
  passengers: 2,
  departure: '2026-09-01T04:00:00.000Z',
  expectedReturn: '2026-09-01T07:00:00.000Z',
  status: 'approved',
  ...changes,
});
const approval = (changes = {}) => ({
  id: 'a1',
  bookingRef: 'B1',
  decision: 'approved',
  decidedAt: '2026-09-01T03:00:00.000Z',
  approver: 'Manager A',
  ...changes,
});
const vehicles = [
  {
    id: 'v1',
    registration: 'MH12AB1234',
    name: 'Vehicle',
    capacity: 4,
    fuelLevel: null,
    fuelLevelAt: null,
  },
];
const classify = (t = trip(), bs = [booking()], as = [approval()]) =>
  d.reconcile(t, bs, as, vehicles);
const request = (path, body) =>
  new Request('https://fleet.example/api/fleet/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined
        ? {}
        : {
            origin: 'https://fleet.example',
            'Content-Type': 'application/json',
          },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function draft() {
  const file = new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3])],
    'register.png',
    { type: 'image/png' },
  );
  const doc = await docs.upload(file, 'movement', 'operator');
  const rowId = await docs.addManualRow(doc.documentId, 1, 1, 'operator');
  return { file, doc, rowId };
}
test('prior approval matches only with all required identity, capacity and time evidence', () => {
  assert.equal(classify().permission, d.PERMISSIONS[0]);
  assert.equal(
    classify(trip({ driver: 'Driver B' })).permission,
    d.PERMISSIONS[1],
  );
  assert.equal(classify(trip({ passengers: 5 })).permission, d.PERMISSIONS[1]);
  assert.equal(classify(trip({ employee: null })).permission, d.PERMISSIONS[3]);
});
test('later approval, equal-time approval and rejection before departure never count as prior approval', () => {
  for (const decidedAt of ['2026-09-01T05:00:00Z', '2026-09-01T04:00:00Z'])
    assert.equal(
      classify(trip(), [booking()], [approval({ decidedAt })]).permission,
      d.PERMISSIONS[2],
    );
  assert.equal(
    classify(
      trip(),
      [booking()],
      [
        approval(),
        approval({
          id: 'a2',
          decision: 'cancelled',
          decidedAt: '2026-09-01T03:30:00Z',
        }),
      ],
    ).permission,
    d.PERMISSIONS[2],
  );
});
test('missing approval is a review item; unconfirmed extraction is never unauthorized', () => {
  assert.equal(classify(trip(), [], []).permission, d.PERMISSIONS[2]);
  assert.equal(
    classify(trip({ confirmed: false })).permission,
    d.PERMISSIONS[3],
  );
  assert.equal(classify(trip(), [booking()], []).permission, d.PERMISSIONS[2]);
});
test('fuzzy name and reference-free candidates are only suggestions', () => {
  const result = classify(trip({ bookingRef: null, employee: 'Employe A' }));
  assert.equal(result.permission, d.PERMISSIONS[3]);
  assert.deepEqual(result.candidateIds, ['b1']);
});
test('explicit overnight dates work and ambiguous times are left null', () => {
  const t = trip({
    departure: '2026-09-01T23:30:00+05:30',
    returnAt: '2026-09-02T01:00:00+05:30',
  });
  assert.equal(d.tripStatus(t, Date.parse('2026-09-03T00:00:00Z')), 'Returned');
  assert.equal(d.validDistance(t), 40);
  const v = d.validateValues({
    ...d.blank(),
    departure: '1/9 8:00',
    returnAt: '2026-09-01T03:00:00Z',
  });
  assert.equal(v.values.departure, null);
  assert.ok(v.flags.length);
});
test('invalid or missing odometers are excluded, not counted as zero', () => {
  assert.equal(d.validDistance(trip({ endOdo: null })), null);
  assert.equal(d.validDistance(trip({ endOdo: 50 })), null);
  const totals = d.metrics([{ ...trip(), distance: null }], [], 0);
  assert.equal(totals.distance, null);
  assert.equal(totals.distanceExcluded, 1);
  assert.equal(totals.kmPerLitre, null);
});
test('same trip in Zoho and register is counted once without dropping source linkage', () => {
  const output = d.deduplicateTrips([
    trip(),
    trip({ id: 'zoho1', source: 'zoho' }),
  ]);
  assert.equal(output.length, 1);
  assert.equal(output[0].source, 'both');
  assert.ok(output[0].linkedSourceIds.includes('zoho1'));
  assert.equal(
    d.deduplicateTrips([
      trip(),
      trip({ id: 'zoho2', source: 'zoho', endOdo: 141 }),
    ]).length,
    2,
  );
});
test('duplicate files are idempotent and file signatures are validated', async () => {
  const { file, doc } = await draft();
  assert.equal(
    (await docs.upload(file, 'movement', 'operator')).documentId,
    doc.documentId,
  );
  assert.equal((await s.all('SELECT * FROM documents')).length, 1);
  await assert.rejects(
    () =>
      docs.upload(
        new File(['<script>x</script>'], 'bad.png', { type: 'image/png' }),
        'movement',
        'operator',
      ),
    /content/,
  );
});
test('illegible OCR numbers and date/time strings are flagged rather than guessed', () => {
  const rows = docs.extractDrafts(
    {
      tables: [
        {
          cells: [
            {
              kind: 'columnHeader',
              columnIndex: 0,
              rowIndex: 0,
              content: 'Odo',
            },
            {
              kind: 'columnHeader',
              columnIndex: 1,
              rowIndex: 0,
              content: 'Time',
            },
            {
              rowIndex: 1,
              columnIndex: 0,
              content: '1?30',
              boundingRegions: [{ pageNumber: 2 }],
            },
            {
              rowIndex: 1,
              columnIndex: 1,
              content: '8.30',
              boundingRegions: [{ pageNumber: 2 }],
            },
          ],
        },
      ],
    },
    { Odo: 'startOdo', Time: 'departure' },
  );
  assert.equal(rows[0].page, 2);
  assert.equal(rows[0].values.startOdo, null);
  assert.equal(rows[0].values.departure, null);
  assert.ok(rows[0].flags.some((f) => f.includes('ambiguous')));
});
test('human correction keeps original, reviewer and history; metric recalculates after confirmation', async () => {
  const { rowId } = await draft();
  await docs.saveRow(rowId, 1, trip(), true, 'operator');
  assert.equal((await dataService.snapshot()).metrics.distance, 40);
  await docs.saveRow(rowId, 2, trip({ endOdo: 150 }), true, 'operator2');
  const row = await s.first('SELECT * FROM extracted_rows WHERE id=?', rowId);
  assert.equal(JSON.parse(row.original).method, 'manual');
  assert.equal(row.reviewer, 'operator2');
  assert.equal(row.version, 3);
  assert.equal((await dataService.snapshot()).metrics.distance, 50);
  assert.equal(
    (await s.all('SELECT * FROM change_history WHERE entityId=?', rowId))
      .length,
    3,
  );
  await assert.rejects(
    () => docs.saveRow(rowId, 2, trip(), true, 'stale-reviewer'),
    /changed/,
  );
});
test('reopening a confirmed extraction excludes it until reconfirmed', async () => {
  const { rowId } = await draft();
  await docs.saveRow(rowId, 1, trip(), true, 'operator');
  await docs.saveRow(rowId, 2, trip(), false, 'operator');
  assert.equal((await dataService.snapshot()).metrics.trips, 0);
  assert.equal((await dataService.snapshot()).metrics.pending, 1);
});
test('review requires reason and current evidence; changed evidence cannot keep unauthorized override', async () => {
  const { rowId } = await draft();
  await docs.saveRow(rowId, 1, trip(), true, 'operator');
  let t = (await dataService.snapshot()).trips[0];
  await assert.rejects(
    () =>
      dataService.review(
        {
          tripId: t.id,
          action: 'unauthorized',
          reason: '',
          evidenceHash: t.evidenceHash,
        },
        'manager',
      ),
    /reason/,
  );
  await dataService.review(
    {
      tripId: t.id,
      action: 'unauthorized',
      reason:
        'Reviewed the complete approval history with the transport manager.',
      evidenceHash: t.evidenceHash,
    },
    'manager',
  );
  assert.equal((await dataService.snapshot()).metrics.unauthorized, 1);
  await docs.saveRow(rowId, 2, trip({ endOdo: 151 }), true, 'operator');
  assert.equal((await dataService.snapshot()).metrics.unauthorized, 0);
  assert.equal((await s.all('SELECT * FROM review_decisions')).length, 1);
});
test('unauthenticated and ungranted users cannot access records, images or exports', async () => {
  globalThis.TEST_HEADERS = new Headers();
  for (const path of ['snapshot', 'document/anything', 'export'])
    assert.equal((await routes.GET(request(path))).status, 401);
  globalThis.TEST_HEADERS = new Headers({
    'oai-authenticated-user-id': 'stranger',
    'oai-authenticated-user-email': 'stranger@example.test',
  });
  assert.equal((await routes.GET(request('snapshot'))).status, 403);
});
test('Viewer cannot upload, decide, sync or change staff access; CSRF is rejected', async () => {
  await s.member();
  await s
    .db()
    .prepare(
      'INSERT INTO users(id,email,role,active,createdAt) VALUES(?,?,?,?,?)',
    )
    .bind('viewer', 'view@example.test', 'Viewer', 1, s.now())
    .run();
  globalThis.TEST_HEADERS = new Headers({
    'oai-authenticated-user-id': 'viewer',
    'oai-authenticated-user-email': 'view@example.test',
  });
  for (const path of ['row/anything', 'review', 'sync', 'users'])
    assert.equal((await routes.POST(request(path, {}))).status, 403);
  const bad = new Request('https://fleet.example/api/fleet/review', {
    method: 'POST',
    headers: {
      origin: 'https://evil.example',
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  assert.equal((await routes.POST(bad)).status, 403);
});
test('filters and CSV exports use the identical filtered dataset and escape formulas', async () => {
  await s.member();
  const { rowId } = await draft();
  await docs.saveRow(rowId, 1, trip(), true, 'operator');
  const params = 'vehicleId=MH12AB1234&from=2026-09-01&to=2026-09-01';
  const snapshot = await (
    await routes.GET(request('snapshot?' + params))
  ).json();
  const csv = await (await routes.GET(request('export?' + params))).text();
  assert.equal(snapshot.trips.length, 1);
  assert.ok(csv.includes('Employee A'));
  const empty = await (
    await routes.GET(request('snapshot?employee=Missing'))
  ).json();
  assert.equal(empty.trips.length, 0);
  assert.ok(d.csv([{ name: ' =HYPERLINK("x")' }]).includes("' =HYPERLINK"));
});
async function setupSync() {
  Object.assign(globalThis.TEST_ENV, {
    ZOHO_CLIENT_ID: 'test-client',
    ZOHO_CLIENT_SECRET: 'test-secret',
    ZOHO_REFRESH_TOKEN: 'test-refresh',
    ZOHO_DC: 'IN',
    ZOHO_OWNER: 'owner',
    ZOHO_APP: 'app',
  });
  await s.setSetting('syncConfig', {
    ...z.SYNC_DEFAULT,
    mappings: [
      {
        kind: 'vehicles',
        report: 'Observed_Vehicles',
        form: 'Observed_Form',
        fields: { registration: 'Actual_Registration' },
        dateFormat: 'iso-offset',
      },
    ],
    allowanceVerified: true,
    dailyApiBudget: 500,
  });
}
function zohoFetch(records, fail = false) {
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('/oauth/'))
      return Response.json({
        access_token: 'ephemeral',
        api_domain: 'https://www.zohoapis.in',
      });
    assert.ok(String(url).startsWith('https://www.zohoapis.in/creator/v2.1/'));
    assert.equal(opts.method, undefined);
    if (fail)
      return new Response('{}', {
        status: 503,
        headers: { 'retry-after': '60' },
      });
    const cursor = opts.headers.record_cursor;
    return Response.json(
      {
        code: 3000,
        data: cursor ? records.slice(1000) : records.slice(0, 1000),
      },
      {
        headers:
          !cursor && records.length > 1000 ? { record_cursor: 'page-two' } : {},
      },
    );
  };
}
async function finish() {
  for (let i = 0; i < 6; i++) {
    const result = await z.syncStep();
    if (result.done) return;
  }
  throw Error('Sync did not finish');
}
test('pagination imports all history, repeats do not duplicate, updates and deletions reconcile', async () => {
  await setupSync();
  const records = Array.from({ length: 1002 }, (_, i) => ({
    ID: String(i),
    Actual_Registration: 'REG' + i,
  }));
  zohoFetch(records);
  await z.startSync();
  await z.syncStep();
  assert.equal((await dataService.dataset()).vehicles.length, 0);
  await finish();
  assert.equal((await dataService.dataset()).vehicles.length, 1002);
  await z.startSync();
  await finish();
  assert.equal((await dataService.dataset()).vehicles.length, 1002);
  zohoFetch([{ ID: '1', Actual_Registration: 'CHANGED' }]);
  await z.startSync();
  await finish();
  const state = await dataService.dataset();
  assert.equal(state.vehicles.length, 1);
  assert.equal(state.vehicles[0].registration, 'CHANGED');
  assert.ok((await s.all('SELECT * FROM source_records')).length > 1002);
});
test('failed sync retains prior complete data and exposes retry state with backoff', async () => {
  await setupSync();
  zohoFetch([{ ID: '1', Actual_Registration: 'REG' }]);
  await z.startSync();
  await finish();
  const active = await s.setting('activeGeneration', null);
  zohoFetch([], true);
  await z.startSync();
  const result = await z.syncStep();
  assert.equal(result.error, true);
  assert.equal(await s.setting('activeGeneration', null), active);
  assert.equal((await dataService.dataset()).vehicles.length, 1);
  const run = await s.first("SELECT * FROM sync_runs WHERE status='retrying'");
  assert.ok(Date.parse(run.retryAt) > Date.now());
});
test('API budget stops requests and secrets never appear in snapshot', async () => {
  await setupSync();
  await s.setSetting('syncConfig', {
    ...(await s.setting('syncConfig', {})),
    dailyApiBudget: 1,
  });
  await z.reserveCall();
  await assert.rejects(() => z.reserveCall(), /budget/);
  const output = JSON.stringify(await dataService.snapshot());
  assert.ok(!output.includes('test-secret'));
  assert.ok(!output.includes('test-refresh'));
});
test('calendar overflow dates are rejected instead of normalized into another day', () => {
  assert.equal(d.timestamp('2026-02-30T09:00:00+05:30'), null);
  assert.ok(d.validateValues({ registerDate: '2026-02-30' }).flags.length);
});
test('simultaneous sync starts share one durable active run', async () => {
  await setupSync();
  const ids = await Promise.all([z.startSync(), z.startSync()]);
  assert.equal(ids[0], ids[1]);
  assert.equal(
    (await s.all("SELECT * FROM sync_runs WHERE status='syncing'")).length,
    1,
  );
});
test('uninspected field mappings cannot be activated', async () => {
  await assert.rejects(
    () =>
      z.validateMappings([
        {
          kind: 'bookings',
          report: 'Guessed_Report',
          form: 'Guessed_Form',
          fields: { employee: 'Made_Up' },
          dateFormat: 'iso-offset',
        },
      ]),
    /Discover/,
  );
});
test('documented exception preserves original no-approval evidence and never counts as matched', async () => {
  const { rowId } = await draft();
  await docs.saveRow(rowId, 1, trip(), true, 'operator');
  const t = (await dataService.snapshot()).trips[0];
  await dataService.review(
    {
      tripId: t.id,
      action: 'exception',
      reason: 'Emergency journey accepted with the attached manager memo.',
      evidenceHash: t.evidenceHash,
    },
    'manager',
  );
  const state = await dataService.snapshot();
  assert.equal(state.trips[0].permission, d.PERMISSIONS[5]);
  assert.equal(state.metrics.matched, 0);
  assert.equal(
    JSON.parse(state.decisions[0].originalResult).permission,
    d.PERMISSIONS[2],
  );
});
test('alerts deduplicate repeated evaluations and never send notifications', async () => {
  const { rowId } = await draft();
  await docs.saveRow(
    rowId,
    1,
    trip({ returnAt: null, endOdo: null }),
    true,
    'operator',
  );
  globalThis.fetch = () => {
    throw Error('No external notification should be sent');
  };
  await dataService.recordReconciliations();
  const before = await s.all('SELECT * FROM alerts');
  await dataService.recordReconciliations();
  assert.deepEqual(
    (await s.all('SELECT id FROM alerts')).map((x) => x.id).sort(),
    before.map((x) => x.id).sort(),
  );
});
test('incremental import preserves unchanged records and sends an overlapped modified-time criterion', async () => {
  await setupSync();
  const config = await s.setting('syncConfig', {});
  config.incremental = true;
  config.mappings[0].modifiedField = 'Observed_Modified';
  await s.setSetting('syncConfig', config);
  zohoFetch([
    { ID: '1', Actual_Registration: 'ONE' },
    { ID: '2', Actual_Registration: 'TWO' },
  ]);
  await z.startSync();
  await finish();
  let criterion = '';
  globalThis.fetch = async (url) => {
    if (String(url).includes('/oauth/'))
      return Response.json({
        access_token: 'ephemeral',
        api_domain: 'https://www.zohoapis.in',
      });
    criterion = new URL(url).searchParams.get('criteria');
    return Response.json({
      code: 3000,
      data: [{ ID: '1', Actual_Registration: 'CHANGED' }],
    });
  };
  await z.startSync('incremental');
  await finish();
  const vehicles = (await dataService.dataset()).vehicles;
  assert.equal(vehicles.length, 2);
  assert.ok(vehicles.some((v) => v.registration === 'CHANGED'));
  assert.ok(criterion.includes('Observed_Modified'));
});
