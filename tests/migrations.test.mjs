import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createClient } from '@libsql/client';
void test('migration runner can be repeated without changing saved data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'car-booking-migration-'));
  const url = 'file:' + join(directory, 'test.db').replaceAll('\\', '/');
  const env = {
    ...process.env,
    TURSO_DATABASE_URL: url,
    TURSO_AUTH_TOKEN: '',
    VERCEL: '',
  };
  let client;
  try {
    const first = spawnSync(process.execPath, ['scripts/migrate-vercel.mjs'], {
      env,
      encoding: 'utf8',
    });
    assert.equal(first.status, 0, first.stderr);
    client = createClient({ url });
    await client.execute(
      "INSERT INTO settings VALUES('migration-test','preserved')",
    );
    client.close();
    client = undefined;
    const second = spawnSync(process.execPath, ['scripts/migrate-vercel.mjs'], {
      env,
      encoding: 'utf8',
    });
    assert.equal(second.status, 0, second.stderr);
    client = createClient({ url });
    assert.equal(
      (
        await client.execute(
          "SELECT value FROM settings WHERE key='migration-test'",
        )
      ).rows[0].value,
      'preserved',
    );
    assert.equal(
      (await client.execute('SELECT * FROM fleet_migrations')).rows.length,
      3,
    );
    await client.execute(
      "UPDATE fleet_migrations SET checksum='tampered' WHERE name='0002_vercel_platform.sql'",
    );
    client.close();
    client = undefined;
    const changed = spawnSync(
      process.execPath,
      ['scripts/migrate-vercel.mjs'],
      { env, encoding: 'utf8' },
    );
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /Previously applied migration changed/);
  } finally {
    client?.close();
    // Only this test-created temporary directory is removed.
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('car-booking-migration-'));
    await rm(directory, { recursive: true, force: true });
  }
});
