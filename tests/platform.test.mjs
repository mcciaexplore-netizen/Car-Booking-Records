import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import {
  auth,
  database,
  server,
  identity,
  uploads,
  uploadRoute,
  routes,
  authRoute,
} from '../work/platform-tests.mjs';

// Dedicated in-memory libSQL instance. Never reads environment files or production secrets.
const base = 'http://localhost:3456';
process.env.FLEET_ACCESS_MODE = 'private';
process.env.TURSO_DATABASE_URL = 'file::memory:';
delete process.env.TURSO_AUTH_TOKEN;
delete process.env.VERCEL;
process.env.BETTER_AUTH_URL = base;
process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID();
process.env.FLEET_ADMIN_EMAIL = 'owner@example.test';
process.env.FLEET_BOOTSTRAP_TOKEN = randomUUID() + randomUUID();
process.env.BLOB_READ_WRITE_TOKEN =
  'vercel_blob_rw_test_00000000000000000000000000000000';
const client = database.databaseClient();
let ownerCookie;
function request(path, input = {}, options = {}) {
  return new Request(base + '/api/auth/' + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: base,
      'x-forwarded-for': options.ip ?? '192.0.2.1',
      ...options.headers,
    },
    body: JSON.stringify(input),
  });
}
function cookie(response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}
before(async () => {
  for (const file of readdirSync('drizzle')
    .filter((file) => file.endsWith('.sql'))
    .sort())
    await client.executeMultiple(readFileSync('drizzle/' + file, 'utf8'));
});
after(() => client.close());

void test('libSQL preserves atomic batch rollback and affected-row counts', async () => {
  const db = database.adaptDatabase(client);
  const result = await db.batch([
    db.prepare("INSERT INTO settings VALUES('test-key','1')"),
  ]);
  assert.equal(result[0].meta.changes, 1);
  await assert.rejects(
    db.batch([
      db.prepare("UPDATE settings SET value='2' WHERE key='test-key'"),
      db.prepare("INSERT INTO settings VALUES('test-key','duplicate')"),
    ]),
  );
  assert.equal(
    (
      await db
        .prepare("SELECT value FROM settings WHERE key='test-key'")
        .first()
    ).value,
    '1',
  );
});
void test('forged hosting headers and unsigned cookies cannot read records, originals or exports', async () => {
  globalThis.PLATFORM_HEADERS = new Headers({
    'oai-authenticated-user-id': 'fake',
    'oai-authenticated-user-email': 'owner@example.test',
    cookie: 'better-auth.session_token=forged',
  });
  assert.equal(await identity.getChatGPTUser(), null);
  for (const path of ['snapshot', 'document/anything', 'historical-export']) {
    const response = await routes.GET(new Request(base + '/api/fleet/' + path));
    assert.equal(response.status, 401);
  }
});
void test('registration requires an invitation; bootstrap creates only the designated owner', async () => {
  const rejected = await auth.fleetAuth().handler(
    request(
      'sign-up/email',
      {
        email: 'intruder@example.test',
        name: 'Intruder',
        password: 'long-password-test',
      },
      {
        headers: { 'x-fleet-invitation': process.env.FLEET_BOOTSTRAP_TOKEN },
      },
    ),
  );
  assert.equal(rejected.status, 403);
  const accepted = await auth.fleetAuth().handler(
    request(
      'sign-up/email',
      {
        email: 'owner@example.test',
        name: 'Owner',
        password: 'long-password-test',
      },
      {
        headers: { 'x-fleet-invitation': process.env.FLEET_BOOTSTRAP_TOKEN },
      },
    ),
  );
  assert.equal(accepted.status, 200, await accepted.clone().text());
  ownerCookie = cookie(accepted);
  assert.ok(ownerCookie.includes('session_token='));
  assert.match(accepted.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(accepted.headers.get('set-cookie'), /SameSite=Lax/i);
  globalThis.PLATFORM_HEADERS = new Headers({ cookie: ownerCookie });
  assert.equal((await server.member()).role, 'Administrator');
  assert.equal(
    await auth.consumeInvitation(
      'owner@example.test',
      process.env.FLEET_BOOTSTRAP_TOKEN,
    ),
    false,
  );
  const account = await client.execute(
    'SELECT password FROM auth_account LIMIT 1',
  );
  assert.notEqual(account.rows[0].password, 'long-password-test');
});
void test('staff invitations are bound to active email, expire and can only be claimed once', async () => {
  const code = randomUUID(),
    stamp = new Date().toISOString();
  await client.execute({
    sql: 'INSERT INTO users VALUES(?,?,?,?,?)',
    args: ['staff1', 'staff@example.test', 'Viewer', 1, stamp],
  });
  await client.execute({
    sql: 'INSERT INTO staff_invitations VALUES(?,?,?,?,?,?,NULL)',
    args: [
      'invite1',
      'staff@example.test',
      createHash('sha256').update(code).digest('hex'),
      'owner@example.test',
      stamp,
      new Date(Date.now() + 60000).toISOString(),
    ],
  });
  assert.equal(
    await auth.consumeInvitation('elsewhere@example.test', code),
    false,
  );
  const results = await Promise.all([
    auth.consumeInvitation('staff@example.test', code),
    auth.consumeInvitation('staff@example.test', code),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
  await client.execute({
    sql: 'INSERT INTO staff_invitations VALUES(?,?,?,?,?,?,NULL)',
    args: [
      'invite2',
      'staff@example.test',
      createHash('sha256').update('expired').digest('hex'),
      'owner@example.test',
      stamp,
      '2000-01-01T00:00:00.000Z',
    ],
  });
  assert.equal(
    await auth.consumeInvitation('staff@example.test', 'expired'),
    false,
  );
});
void test('disabled access is enforced for an already authenticated session', async () => {
  globalThis.PLATFORM_HEADERS = new Headers({ cookie: ownerCookie });
  await client.execute(
    "UPDATE users SET active=0 WHERE email='owner@example.test'",
  );
  await assert.rejects(server.member(), (error) => error.status === 403);
  await client.execute(
    "UPDATE users SET active=1 WHERE email='owner@example.test'",
  );
});
void test('cross-origin sign-in is blocked and bad-password attempts are rate limited durably', async () => {
  const cross = request(
    'sign-in/email',
    { email: 'owner@example.test', password: 'long-password-test' },
    { headers: { origin: 'https://attacker.test' }, ip: '192.0.2.20' },
  );
  assert.equal((await auth.fleetAuth().handler(cross)).status, 403);
  let result;
  for (let i = 0; i < 7; i++)
    result = await auth
      .fleetAuth()
      .handler(
        request(
          'sign-in/email',
          { email: 'owner@example.test', password: 'incorrect-password' },
          { ip: '192.0.2.21' },
        ),
      );
  assert.equal(result.status, 429);
  assert.ok(
    (await client.execute('SELECT * FROM auth_rate_limit')).rows.length,
  );
});
void test('direct upload permissions are scoped to actor, path, content type, size and expiry', async () => {
  const intent = await uploads.prepareUpload(
    {
      name: 'register.pdf',
      mime: 'application/pdf',
      size: 8 * 1024 * 1024,
      kind: 'movement',
    },
    'owner@example.test',
  );
  await assert.rejects(
    uploads.claimUploadToken(intent.pathname, 'other@example.test'),
    (error) => error.status === 403,
  );
  const token = await uploads.claimUploadToken(
    intent.pathname,
    'owner@example.test',
  );
  assert.equal(token.maximumSizeInBytes, 8 * 1024 * 1024);
  assert.deepEqual(token.allowedContentTypes, ['application/pdf']);
  assert.equal(token.allowOverwrite, false);
  await assert.rejects(
    uploads.claimUploadToken(intent.pathname, 'owner@example.test'),
    (error) => error.status === 409,
  );
  await assert.rejects(
    uploads.finalizeUpload(intent.intentId, 'other@example.test'),
    (error) => error.status === 404,
  );
});
void test('unsigned Blob completion requests cannot create documents', async () => {
  const response = await uploadRoute.POST(
    new Request(base + '/api/uploads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'blob.upload-completed',
        payload: { blob: { pathname: 'staging/forged' } },
      }),
    }),
  );
  assert.ok(response.status >= 400);
  assert.equal(
    (await client.execute('SELECT * FROM documents')).rows.length,
    0,
  );
});
void test('logout revokes the server session', async () => {
  const result = await auth
    .fleetAuth()
    .handler(request('sign-out', {}, { headers: { cookie: ownerCookie } }));
  assert.equal(result.status, 200);
  globalThis.PLATFORM_HEADERS = new Headers({ cookie: ownerCookie });
  assert.equal(await identity.getChatGPTUser(), null);
});
void test('public mode disables account endpoints and upload authorization with no session', async () => {
  process.env.FLEET_ACCESS_MODE = 'public';
  globalThis.PLATFORM_HEADERS = new Headers();
  try {
    for (const path of ['sign-in/email', 'sign-up/email', 'sign-out'])
      assert.equal((await authRoute.POST(request(path))).status, 404, path);
    assert.equal(
      (await authRoute.GET(new Request(base + '/api/auth/get-session'))).status,
      404,
    );
    assert.equal(
      (await routes.GET(new Request(base + '/api/fleet/snapshot'))).status,
      200,
    );
    for (const action of ['prepare', 'finalize']) {
      const response = await uploadRoute.POST(
        new Request(base + '/api/uploads', {
          method: 'POST',
          headers: { origin: base, 'content-type': 'application/json' },
          body: JSON.stringify({ action }),
        }),
      );
      assert.equal(response.status, 403, action);
    }
  } finally {
    process.env.FLEET_ACCESS_MODE = 'private';
  }
});
