// Explicit local-only data for UI verification. Never imported by production code.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve('.wrangler/ux-fixtures/v3');
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script:
      'export default { fetch(){ return new Response("Fixture seed only"); } };',
    compatibilityDate: '2026-06-01',
    resourcePersistencePath: root,
    d1Databases: { DB: '00000000-0000-4000-8000-000000000000' },
    r2Buckets: { DOCUMENTS: 'site-creator-r2' },
  }),
);
try {
  const db = await mf.getD1Database('DB'),
    bucket = await mf.getR2Bucket('DOCUMENTS');
  const tables = await db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'",
    )
    .all();
  if (tables.results.length) {
    console.log('Isolated fixture database already exists; preserved.');
  } else {
    for (const f of (await readdir('drizzle'))
      .filter((f) => f.endsWith('.sql'))
      .sort()) {
      const sql = await readFile('drizzle/' + f, 'utf8');
      for (const statement of sql
        .split(';')
        .map((x) => x.replaceAll('--> statement-breakpoint', '').trim())
        .filter(Boolean))
        await db.prepare(statement).run();
    }
    const stamp = '2026-09-18T07:00:00.000Z',
      generation = 'fixture-import';
    const set = async (k, v) =>
      db
        .prepare('INSERT INTO settings(key,value) VALUES(?,?)')
        .bind(k, JSON.stringify(v))
        .run();
    await set('fixtureLabel', 'SYNTHETIC UI TEST DATA — NOT LIVE');
    await set('activeGeneration', generation);
    await db
      .prepare(
        'INSERT INTO sync_runs(id,status,mode,startedAt,finishedAt,mappingHash,count,pages) VALUES(?,?,?,?,?,?,?,?)',
      )
      .bind(generation, 'succeeded', 'full', stamp, stamp, 'synthetic', 70, 1)
      .run();
    await db
      .prepare(
        'INSERT INTO users(id,email,role,active,createdAt) VALUES(?,?,?,?,?)',
      )
      .bind('seedy', 'seedy@sites.test', 'Administrator', 1, stamp)
      .run();
    const empty = Object.fromEntries(
      [
        'registerDate',
        'vehicleId',
        'employee',
        'employeeId',
        'driver',
        'driverId',
        'department',
        'bookingRef',
        'destination',
        'purpose',
        'passengers',
        'departure',
        'returnAt',
        'expectedReturn',
        'startOdo',
        'endOdo',
        'litres',
        'amount',
        'payer',
        'receiptRef',
        'remarks',
        'signaturePresent',
        'fuelLevel',
        'fuelLevelAt',
      ].map((k) => [k, null]),
    );
    const source = async (kind, v) =>
      db
        .prepare(
          'INSERT INTO source_records(generation,kind,id,report,sourceId,raw,data,fetchedAt) VALUES(?,?,?,?,?,?,?,?)',
        )
        .bind(
          generation,
          kind,
          v.id,
          'Synthetic_' + kind,
          v.id,
          JSON.stringify({ fixture: true, ...v }),
          JSON.stringify(v),
          stamp,
        )
        .run();
    for (let i = 1; i <= 2; i++)
      await source('vehicles', {
        id: 'fixture-vehicle-' + i,
        registration: 'TEST-0' + i,
        name: i === 1 ? 'Test vehicle · Sedan' : 'Test vehicle · MPV',
        capacity: i === 1 ? 4 : 6,
        fuelLevel: null,
        fuelLevelAt: null,
      });
    const records = [];
    for (let i = 1; i <= 26; i++) {
      const day = String(1 + (i % 17)).padStart(2, '0'),
        date = '2026-09-' + day;
      const v = {
        ...empty,
        id: 'fixture-trip-' + i,
        source: 'zoho',
        sourceId: 'fixture-trip-' + i,
        confirmed: true,
        vehicleId: 'TEST-0' + ((i % 2) + 1),
        employee:
          i === 7
            ? null
            : i === 3
              ? 'Test Employee with an intentionally long name for responsive verification'
              : 'Test Employee ' + String.fromCharCode(65 + (i % 4)),
        employeeId: i === 7 ? null : 'test-person-' + (i % 4),
        driver: 'Test Driver ' + (i % 2 ? 'A' : 'B'),
        driverId: 'test-driver-' + (i % 2),
        department:
          i % 5 === 0 ? null : i % 2 ? 'Operations' : 'Administration',
        bookingRef: 'TEST-B' + i,
        destination:
          i === 3
            ? 'Test industrial training centre with an intentionally long destination, Pune district'
            : 'Test office',
        registerDate: date,
        departure: date + 'T04:00:00.000Z',
        expectedReturn: date + 'T07:00:00.000Z',
        returnAt: i % 6 === 0 ? null : date + 'T06:00:00.000Z',
        passengers: 2,
        startOdo: 1000 + i * 50,
        endOdo: i % 6 === 0 ? null : 1040 + i * 50,
      };
      if (i === 4) {
        v.registerDate = '2026-09-17';
        v.departure = '2026-09-17T17:30:00.000Z';
        v.returnAt = '2026-09-18T01:00:00.000Z';
        v.expectedReturn = '2026-09-18T02:00:00.000Z';
      }
      if (i === 5) {
        v.departure = null;
        v.returnAt = null;
        v.startOdo = null;
        v.endOdo = null;
      }
      records.push(v);
      await source('trips', v);
      if (i % 4 !== 0) {
        const b = {
          ...v,
          id: 'fixture-booking-' + i,
          sourceId: 'fixture-booking-' + i,
          status: 'approved',
        };
        await source('bookings', b);
        await source('approvals', {
          id: 'fixture-approval-' + i,
          bookingRef: v.bookingRef,
          decision: 'approved',
          decidedAt: date + (i === 3 ? 'T05:00:00.000Z' : 'T03:00:00.000Z'),
          approver: 'Test Manager',
        });
      }
    }
    await source('bookings', {
      ...records[0],
      id: 'fixture-unused-booking',
      sourceId: 'fixture-unused-booking',
      bookingRef: 'TEST-UNUSED',
      status: 'approved',
    });
    await source('approvals', {
      id: 'fixture-unused-approval',
      bookingRef: 'TEST-UNUSED',
      decision: 'approved',
      decidedAt: '2026-09-01T03:00:00.000Z',
      approver: 'Test Manager',
    });
    for (let i = 1; i <= 5; i++)
      await source('fuel', {
        ...empty,
        id: 'fixture-fuel-' + i,
        sourceId: 'fixture-fuel-' + i,
        source: 'zoho',
        vehicleId: 'TEST-0' + ((i % 2) + 1),
        registerDate: '2026-0' + (i < 3 ? 8 : 9) + '-12',
        litres: i === 3 ? null : i === 5 ? 0 : 20,
        amount: i === 4 ? null : i === 5 ? 0 : 2051.75,
        payer: 'Test payer',
        receiptRef: 'TEST-RECEIPT-' + i,
      });
    const image = await readFile('tests/fixtures/register.png'),
      sha = createHash('sha256').update(image).digest('hex');
    await bucket.put('originals/' + sha, image, {
      httpMetadata: { contentType: 'image/png' },
    });
    await db
      .prepare(
        'INSERT INTO documents(id,sha256,name,mime,size,objectKey,kind,status,uploadedBy,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        'fixture-doc',
        sha,
        'TEST-register-not-live.png',
        'image/png',
        image.length,
        'originals/' + sha,
        'movement',
        'ready',
        'Test Operator',
        stamp,
      )
      .run();
    for (let i = 1; i <= 2; i++) {
      const values = {
        ...empty,
        vehicleId: 'TEST-01',
        employee: i === 1 ? 'Test Employee A' : 'Test Operator B',
        driver: 'Test Driver A',
        registerDate: '2026-09-18',
        departure: '2026-09-18T04:00:00.000Z',
        returnAt: i === 1 ? '2026-09-18T06:00:00.000Z' : null,
        destination: i === 1 ? 'Test office' : 'Test depot',
        startOdo: i === 1 ? 1000 : 1040,
        endOdo: i === 1 ? 1040 : null,
        passengers: 2,
        bookingRef: i === 1 ? 'TEST-REGISTER-1' : null,
      };
      const original = {
        values,
        fieldColumns: { Odometer: 'endOdo' },
        headers: { 4: 'Odometer' },
        pageGeometry: {
          pageNumber: 1,
          width: 1200,
          height: 760,
          unit: 'pixel',
        },
        cells: [
          {
            columnIndex: 4,
            content: i === 1 ? '1040' : '?',
            boundingRegions: [
              {
                pageNumber: 1,
                polygon: [
                  40,
                  245 + (i - 1) * 145,
                  1160,
                  245 + (i - 1) * 145,
                  1160,
                  365 + (i - 1) * 145,
                  40,
                  365 + (i - 1) * 145,
                ],
              },
            ],
          },
        ],
      };
      await db
        .prepare(
          'INSERT INTO extracted_rows(id,documentId,page,row,original,corrected,flags,state,createdAt) VALUES(?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          'fixture-row-' + i,
          'fixture-doc',
          1,
          i,
          JSON.stringify(original),
          JSON.stringify(values),
          JSON.stringify(
            i === 2
              ? [
                  'endOdo: ambiguous number “?”',
                  'returnAt: return time is not legible',
                ]
              : [],
          ),
          i === 1 ? 'Confirmed register entry' : 'Needs correction',
          stamp,
        )
        .run();
      if (i === 1) {
        await db
          .prepare(
            'INSERT INTO actual_trips(id,rowId,data,updatedAt) VALUES(?,?,?,?)',
          )
          .bind(
            'fixture-register-trip',
            'fixture-row-1',
            JSON.stringify(values),
            stamp,
          )
          .run();
        await source('bookings', {
          ...values,
          id: 'fixture-register-booking',
          sourceId: 'fixture-register-booking',
          status: 'approved',
          expectedReturn: '2026-09-18T07:00:00.000Z',
        });
        await source('approvals', {
          id: 'fixture-register-approval',
          bookingRef: 'TEST-REGISTER-1',
          decision: 'approved',
          decidedAt: '2026-09-18T05:00:00.000Z',
          approver: 'Test Manager',
        });
      }
    }
    console.log(
      'Seeded 27 synthetic trips in isolated .wrangler/ux-fixtures. No network providers called.',
    );
  }
} finally {
  await mf.dispose();
}
