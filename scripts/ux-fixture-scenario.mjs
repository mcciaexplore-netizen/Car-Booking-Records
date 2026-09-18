// Local isolated fixture state changes for recovery/access-denied browser checks.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { resolve } from 'node:path';
import { domain } from '../work/fleet-tests.mjs';
const mode = process.argv[2];
if (!['failure', 'recover', 'denied', 'allow'].includes(mode))
  throw Error('Use failure, recover, denied or allow.');
const mf = new Miniflare(
  convertV4MiniflareOptions({
    modules: true,
    script:
      'export default {fetch(){return new Response("Fixture scenarios only")}}',
    compatibilityDate: '2026-06-01',
    resourcePersistencePath: resolve('.wrangler/ux-fixtures/v3'),
    d1Databases: { DB: '00000000-0000-4000-8000-000000000000' },
  }),
);
try {
  const db = await mf.getD1Database('DB');
  const marker = await db
    .prepare("SELECT value FROM settings WHERE key='fixtureLabel'")
    .first();
  if (!marker?.value?.includes('SYNTHETIC'))
    throw Error('Refusing to modify unmarked storage.');
  if (mode === 'failure' || mode === 'recover')
    await db
      .prepare(
        'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .bind(
        'rules',
        mode === 'failure'
          ? '{deliberately malformed fixture'
          : JSON.stringify(domain.DEFAULT_RULES),
      )
      .run();
  else
    await db
      .prepare("UPDATE users SET active=? WHERE email='seedy@sites.test'")
      .bind(mode === 'allow' ? 1 : 0)
      .run();
  console.log('Isolated fixture scenario: ' + mode);
} finally {
  await mf.dispose();
}
