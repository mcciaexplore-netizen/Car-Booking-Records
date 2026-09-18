import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import {
  domain as d,
  server as s,
  zoho as z,
  oauth,
  documents as docs,
  uploadIntents,
  data as dataService,
  routes,
  reporting,
  evidenceView,
  LatestRequest,
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
  globalThis.TEST_IDENTITY = { userId: 'owner-id', email: 'owner@example.test', displayName: 'Owner' };
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
void test('private staged uploads over 4.5 MB finalize idempotently and duplicate content creates one document', async () => {
  const bytes = new Uint8Array(8 * 1024 * 1024);
  bytes.set(new TextEncoder().encode('%PDF-1.7'));
  const metadata = { name: 'large-register.pdf', mime: 'application/pdf', size: bytes.length, kind: 'movement' };
  const first = await uploadIntents.prepareUpload(metadata, 'owner@example.test');
  await s.runtime().DOCUMENTS.put(first.pathname, bytes.buffer);
  const saved = await uploadIntents.finalizeUpload(first.intentId, 'owner@example.test');
  assert.equal(saved.duplicate, false);
  assert.deepEqual(await uploadIntents.finalizeUpload(first.intentId, 'owner@example.test'), saved);
  assert.equal(await s.runtime().DOCUMENTS.get(first.pathname), null);
  const repeated = await uploadIntents.prepareUpload(metadata, 'owner@example.test');
  await s.runtime().DOCUMENTS.put(repeated.pathname, bytes.buffer);
  const duplicate = await uploadIntents.finalizeUpload(repeated.intentId, 'owner@example.test');
  assert.equal(duplicate.documentId, saved.documentId);
  assert.equal(duplicate.duplicate, true);
  assert.equal((await s.all('SELECT * FROM documents')).length, 1);
  assert.equal((await s.all('SELECT * FROM actual_trips')).length, 0);
});
void test('staging finalization checks signatures and ownership; cleanup preserves originals', async () => {
  const metadata = { name: 'fake.pdf', mime: 'application/pdf', size: 8, kind: 'movement' };
  const intent = await uploadIntents.prepareUpload(metadata, 'owner@example.test');
  await s.runtime().DOCUMENTS.put(intent.pathname, new TextEncoder().encode('bad-file').buffer);
  await assert.rejects(uploadIntents.finalizeUpload(intent.intentId, 'other@example.test'), e => e.status === 404);
  await assert.rejects(uploadIntents.finalizeUpload(intent.intentId, 'owner@example.test'), e => e.status === 415);
  assert.equal((await s.all('SELECT * FROM documents')).length, 0);
  await s.runtime().DOCUMENTS.put('originals/keep', 'evidence');
  await s.db().prepare('UPDATE upload_intents SET expiresAt=?').bind('2000-01-01T00:00:00.000Z').run();
  assert.equal(await uploadIntents.cleanupStaging(), 1);
  assert.equal(await s.runtime().DOCUMENTS.get(intent.pathname), null);
  assert.ok(await s.runtime().DOCUMENTS.get('originals/keep'));
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
  globalThis.TEST_IDENTITY = null;
  for (const path of ['snapshot', 'document/anything', 'export'])
    assert.equal((await routes.GET(request(path))).status, 401);
  globalThis.TEST_IDENTITY = { userId: 'stranger', email: 'stranger@example.test', displayName: 'Stranger' };
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
  globalThis.TEST_IDENTITY = { userId: 'viewer', email: 'view@example.test', displayName: 'Viewer' };
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
        expires_in: 3600,
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

test('OAuth reuses access, renews before expiry, and drops cached access after credential rotation', async () => {
  let time = 1000000,
    calls = 0;
  const manager = oauth.createTokenManager(() => time);
  const credentials = {
    ZOHO_CLIENT_ID: 'fixture-id',
    ZOHO_CLIENT_SECRET: 'fixture-secret',
    ZOHO_REFRESH_TOKEN: 'fixture-refresh',
    ZOHO_DC: 'IN',
  };
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://accounts.zoho.in/oauth/v2/token');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.body.get('grant_type'), 'refresh_token');
    return Response.json({
      access_token: 'access-' + calls,
      api_domain: 'https://www.zohoapis.in',
      expires_in: 3600,
    });
  };
  assert.equal((await manager.get(credentials)).access, 'access-1');
  time += 3500000;
  assert.equal((await manager.get(credentials)).access, 'access-1');
  assert.equal(calls, 1);
  time += 41000;
  assert.equal((await manager.get(credentials)).access, 'access-2');
  assert.equal(
    (await manager.get({ ...credentials, ZOHO_REFRESH_TOKEN: 'rotated' }))
      .access,
    'access-3',
  );
  assert.ok(!JSON.stringify(manager.status(credentials)).includes('access-'));
});

test('OAuth rejects unsafe responses, redacts exceptions, and backs off failed renewal', async () => {
  const credentials = {
    ZOHO_CLIENT_ID: 'fixture-id',
    ZOHO_CLIENT_SECRET: 'fixture-secret',
    ZOHO_REFRESH_TOKEN: 'fixture-refresh',
    ZOHO_DC: 'IN',
  };
  for (const body of [
    {
      access_token: 'access',
      api_domain: 'https://evil.example',
      expires_in: 3600,
    },
    {
      access_token: 'access',
      api_domain: 'https://www.zohoapis.in',
      expires_in: 0,
    },
    { error: 'invalid_code', detail: 'fixture-secret' },
  ]) {
    const manager = oauth.createTokenManager();
    globalThis.fetch = async () => Response.json(body);
    await assert.rejects(
      manager.get(credentials),
      (error) => !error.message.includes('fixture-secret'),
    );
    assert.equal(manager.status(credentials).verified, false);
  }
  let calls = 0,
    time = 1000000;
  const manager = oauth.createTokenManager(() => time);
  globalThis.fetch = async () => {
    calls++;
    throw Error('fixture-secret');
  };
  await assert.rejects(manager.get(credentials), /could not complete/);
  await assert.rejects(manager.get(credentials), /could not complete/);
  assert.equal(calls, 1);
  time += 60001;
  await assert.rejects(manager.get(credentials), /could not complete/);
  assert.equal(calls, 2);
});

test('connection verification requires an administrator and returns status without tokens', async () => {
  await setupSync();
  zohoFetch([]);
  const response = await routes.POST(request('connection-test', {}));
  assert.equal(response.status, 200);
  const output = await response.text();
  assert.equal(JSON.parse(output).verified, true);
  for (const secret of ['test-secret', 'test-refresh', 'ephemeral'])
    assert.ok(!output.includes(secret));
  await s.db().prepare("UPDATE users SET role='Viewer'").run();
  assert.equal((await routes.POST(request('connection-test', {}))).status, 403);
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
        expires_in: 3600,
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

test('report pagination keeps full metrics, clamps pages and exports all filtered results', async () => {
  const { doc } = await draft();
  for (let i = 1; i <= 23; i++) {
    const rowId = await docs.addManualRow(doc.documentId, 1, i, 'operator');
    await docs.saveRow(
      rowId,
      1,
      trip({
        employee: 'Test ' + String(i).padStart(2, '0'),
        bookingRef: null,
        startOdo: 100 + i * 50,
        endOdo: i === 23 ? null : 140 + i * 50,
      }),
      true,
      'operator',
    );
  }
  const page = await dataService.snapshot(
    new URLSearchParams('page=2&pageSize=10&sort=employee&direction=asc'),
  );
  assert.equal(page.trips.length, 10);
  assert.equal(page.trips[0].employee, 'Test 11');
  assert.equal(page.metrics.trips, 23);
  assert.equal(page.metrics.distanceExcluded, 1);
  assert.equal(page.metrics.distance, 880);
  assert.equal(page.pagination.trips.total, 23);
  assert.equal(page.rows[0].original, undefined);
  const last = await dataService.snapshot(
    new URLSearchParams('page=99&pageSize=10'),
  );
  assert.equal(last.pagination.trips.page, 3);
  assert.equal(last.trips.length, 3);
  const response = await routes.GET(
    request('export?type=trips&page=2&pageSize=10&sort=employee&direction=asc'),
  );
  const text = await response.text();
  assert.equal(text.trim().split(/\r?\n/).length, 24);
  assert.ok(text.indexOf('Test 01') < text.indexOf('Test 23'));
  const detail = await routes.GET(
    request('detail/trip?id=' + last.trips[0].id),
  );
  assert.equal(detail.status, 200);
});
test('pending document filters apply before pagination and row evidence loads on demand', async () => {
  const { doc, rowId } = await draft();
  await docs.saveRow(rowId, 1, trip(), true, 'operator');
  const file = new File(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 4])],
    'other.png',
    { type: 'image/png' },
  );
  const pending = await docs.upload(file, 'movement', 'operator');
  const snap = await dataService.snapshot(
    new URLSearchParams('metric=pending&pageSize=10'),
  );
  assert.equal(snap.documents.length, 1);
  assert.equal(snap.documents[0].id, pending.documentId);
  assert.equal(snap.metrics.pending, 1);
  assert.equal(snap.pagination.documents.total, 1);
  const response = await routes.GET(request('detail/row?id=' + rowId));
  const detail = await response.json();
  assert.equal(detail.row.documentId, doc.documentId);
  assert.ok(detail.row.original);
  assert.ok(detail.row.corrected);
  globalThis.TEST_IDENTITY = null;
  for (const path of [
    'detail/row?id=' + rowId,
    'detail/trip?id=t1',
    'history/' + rowId,
    'settings',
  ])
    assert.equal((await routes.GET(request(path))).status, 401);
});
test('report groups preserve missing values, true zero and the IST month boundary', () => {
  assert.equal(reporting.periodKey('2026-08-31T19:00:00Z', true), '2026-09');
  assert.equal(reporting.periodKey(null), 'Unknown date');
  const summary = reporting.summarize({
    trips: [
      { ...trip(), distance: null, employee: null },
      { ...trip(), id: 't2', distance: 0 },
    ],
    fuel: [
      {
        id: 'f1',
        registerDate: '2026-09-01',
        vehicleId: null,
        litres: null,
        amount: 0,
      },
    ],
  });
  assert.equal(summary.employee.find((g) => g.key === '__unknown').count, 1);
  assert.equal(summary.vehicle[0].distance, 0);
  assert.equal(summary.vehicle[0].excluded, 1);
  assert.equal(summary.fuelMonths[0].litres, null);
  assert.equal(summary.fuelMonths[0].amount, 0);
  assert.equal(summary.fuelMonths[0].quantityMissing, 1);
  const f = { registerDate: '2026-09-02', departure: '2026-08-01T00:00:00Z' };
  assert.equal(
    d.filterRecords([f], new URLSearchParams('from=2026-09-01'), 'purchase')
      .length,
    1,
  );
  assert.equal(
    d.filterRecords([f], new URLSearchParams('from=2026-09-01'), 'journey')
      .length,
    0,
  );
});
test('application selection is admin-only, validates link names and preserves imported evidence', async () => {
  await s.setSetting('activeGeneration', 'existing-import');
  await s.setSetting('zohoMetadata', { reports: ['old'] });
  await s.setSetting('syncConfig', {
    ...z.SYNC_DEFAULT,
    mappings: [{ kind: 'vehicles', report: 'old' }],
  });
  assert.equal(
    (
      await routes.POST(
        request('application', { owner: 'account', app: 'fleet-app' }),
      )
    ).status,
    200,
  );
  assert.deepEqual(await s.setting('zohoApplication', null), {
    owner: 'account',
    app: 'fleet-app',
  });
  assert.equal(await s.setting('zohoMetadata', null), null);
  assert.deepEqual((await s.setting('syncConfig', {})).mappings, []);
  assert.equal(await s.setting('activeGeneration', null), 'existing-import');
  assert.equal(
    (
      await routes.POST(
        request('application', { owner: 'https://example.com', app: 'fleet' }),
      )
    ).status,
    400,
  );
  await s.db().prepare("UPDATE users SET role='Viewer'").run();
  assert.equal(
    (
      await routes.POST(
        request('application', { owner: 'other', app: 'other' }),
      )
    ).status,
    403,
  );
});
test('original field text and coordinate overlays never guess missing or invalid evidence', () => {
  const original = {
    values: { endOdo: null },
    fieldColumns: { End: 'endOdo' },
    headers: { 0: 'End' },
    pageGeometry: { pageNumber: 1, width: 100, height: 200 },
    cells: [
      {
        columnIndex: 0,
        content: '1?0',
        boundingRegions: [
          { pageNumber: 1, polygon: [10, 20, 50, 20, 50, 60, 10, 60] },
        ],
      },
    ],
  };
  assert.equal(evidenceView.originalField(original, 'endOdo'), '1?0');
  assert.equal(evidenceView.originalField(original, 'driver'), null);
  assert.deepEqual(evidenceView.rowPolygons(original, 1), [
    '10,10 50,10 50,30 10,30',
  ]);
  assert.deepEqual(evidenceView.rowPolygons(original, 2), []);
  assert.deepEqual(
    evidenceView.rowPolygons({ ...original, pageGeometry: null }, 1),
    [],
  );
  original.cells[0].boundingRegions[0].polygon[0] = -1;
  assert.deepEqual(evidenceView.rowPolygons(original, 1), []);
});

test('a slower obsolete response cannot replace a newer filter result even when abort is ignored', async () => {
  const loader = new LatestRequest(),
    values = [],
    errors = [];
  let releaseOld;
  const old = loader.run(
    () =>
      new Promise((resolve) => {
        releaseOld = resolve;
      }),
    (v) => values.push(v),
    (e) => errors.push(e),
    () => {},
  );
  await loader.run(
    async () => ({ query: 'new' }),
    (v) => values.push(v),
    (e) => errors.push(e),
    () => {},
  );
  releaseOld({ query: 'old' });
  await old;
  assert.deepEqual(values, [{ query: 'new' }]);
  assert.deepEqual(errors, []);
  let rejectOld;
  const oldFailure = loader.run(
    () =>
      new Promise((_, reject) => {
        rejectOld = reject;
      }),
    (v) => values.push(v),
    (e) => errors.push(e),
    () => {},
  );
  await loader.run(
    async () => ({ query: 'latest' }),
    (v) => values.push(v),
    (e) => errors.push(e),
    () => {},
  );
  rejectOld(Error('obsolete error'));
  await oldFailure;
  assert.equal(errors.length, 0);
});
test('cancelling the active read prevents protected data from being restored by its late result', async () => {
  const loader = new LatestRequest();
  let release,
    committed = false,
    settled = false;
  const work = loader.run(
    () => new Promise((resolve) => (release = resolve)),
    () => {
      committed = true;
    },
    () => {},
    () => {
      settled = true;
    },
  );
  loader.cancel();
  release({ private: true });
  await work;
  assert.equal(committed, false);
  assert.equal(settled, false);
});

test('metric drill-down intersects the global permission filter instead of widening its scope', () => {
  const rows = [
    { ...trip(), permission: d.PERMISSIONS[0], distance: 40 },
    { ...trip(), id: 't2', permission: d.PERMISSIONS[4], distance: null },
  ];
  const p = new URLSearchParams({
    permission: d.PERMISSIONS[0],
    outcome: d.PERMISSIONS[4],
  });
  assert.equal(d.filterRecords(rows, p).length, 0);
  p.delete('outcome');
  p.set('metric', 'distance');
  assert.equal(d.filterRecords(rows, p).length, 1);
  p.set('metric', 'review');
  assert.equal(d.filterRecords(rows, p).length, 0);
});

test('fuel report ordering uses purchase dates even when journey dates differ', () => {
  const purchases = [
    {
      id: 'earlier-purchase',
      registerDate: '2026-09-01',
      departure: '2026-09-15T04:00:00Z',
    },
    {
      id: 'later-purchase',
      registerDate: '2026-09-10',
      departure: '2026-09-02T04:00:00Z',
    },
    { id: 'undated-purchase', registerDate: null, departure: null },
  ];
  assert.deepEqual(
    reporting
      .sortedRecords(purchases, 'date', 'desc', 'purchase')
      .map((r) => r.id),
    ['later-purchase', 'earlier-purchase', 'undated-purchase'],
  );
  assert.deepEqual(
    reporting
      .sortedRecords(purchases, 'date', 'asc', 'purchase')
      .map((r) => r.id),
    ['earlier-purchase', 'later-purchase', 'undated-purchase'],
  );
  assert.equal(reporting.sortedRecords(purchases)[0].id, 'earlier-purchase');
});
