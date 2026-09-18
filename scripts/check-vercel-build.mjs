import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const output = resolve('.vercel/output');
const config = JSON.parse(await readFile(join(output, 'config.json'), 'utf8'));
assert.equal(config.version, 3);
assert.ok(config.routes.some((route) => route.dest === '/__server'));
const functionDir = join(output, 'functions/__server.func');
const fn = JSON.parse(
  await readFile(join(functionDir, '.vc-config.json'), 'utf8'),
);
assert.equal(fn.supportsResponseStreaming, true);
assert.equal(fn.runtime, 'nodejs24.x');
const { default: handler } = await import(
  pathToFileURL(join(functionDir, 'index.mjs')).href
);
// This smoke check intentionally has no service credentials or company data session.
delete process.env.BETTER_AUTH_SECRET;
delete process.env.TURSO_DATABASE_URL;
for (const [path, status, text] of [
  ['/', 200, 'Car Booking Details'],
  ['/login', 200, 'mccia-logo-source.png'],
  ['/api/fleet/snapshot', 401, 'Sign in'],
  ['/api/fleet/historical-export', 401, 'Sign in'],
  ['/api/fleet/document/private-original', 401, 'Sign in'],
  ['/missing-page-for-smoke-check', 404, ''],
]) {
  const response = await handler.fetch(
    new Request('https://example.test' + path, {
      headers: {
        'oai-authenticated-user-id': 'forged',
        'oai-authenticated-user-email': 'forged@example.test',
      },
    }),
    {},
  );
  assert.equal(response.status, status, path);
  assert.ok((await response.text()).includes(text), path);
  console.log(`Verified ${path}: ${status}`);
}
async function inventory(dir) {
  let bytes = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) bytes += await inventory(file);
    else bytes += (await stat(file)).size;
  }
  return bytes;
}
const bytes = await inventory(functionDir);
assert.ok(
  bytes < 250 * 1024 * 1024,
  'Function exceeds the standard Vercel bundle limit.',
);
console.log(
  `Vercel function size: ${(bytes / 1024 / 1024).toFixed(1)} MiB. Rebuild on Vercel/Linux; do not deploy Windows prebuilt binaries.`,
);
async function checkPublic(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) await checkPublic(file);
    else {
      assert.ok(
        !/sample-records|\.env|\.sqlite|\.db$|\.sql$/.test(entry.name),
        'Private file in static output.',
      );
      if (/\.(?:js|json|html)$/.test(entry.name)) {
        const text = await readFile(file, 'utf8');
        // Setting names in the admin help text and the Blob SDK are expected;
        // application server modules, historical payloads and values are not.
        assert.ok(
          !/TURSO_AUTH_TOKEN|BETTER_AUTH_SECRET|function consumeInvitation/.test(
            text,
          ),
          'Application server module in public output.',
        );
        assert.ok(
          !text.includes('"importedOn":') || !text.includes('"consolidated":'),
          'Historical records in public output.',
        );
      }
    }
  }
}
await checkPublic(join(output, 'static'));
console.log(
  'Verified static output excludes application server modules and historical records.',
);
