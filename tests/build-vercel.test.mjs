import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVercel } from '../scripts/build-vercel.mjs';

const production = {
  VERCEL_ENV: 'production',
  TURSO_DATABASE_URL: 'libsql://database.example.test',
  TURSO_AUTH_TOKEN: 'synthetic-test-token',
};

test('production refuses absent credentials and ephemeral databases before starting a build', () => {
  const unexpected = () =>
    assert.fail('No build or database operation should start.');
  for (const env of [
    { VERCEL_ENV: 'production' },
    { ...production, TURSO_AUTH_TOKEN: '' },
    { ...production, TURSO_DATABASE_URL: 'file:local.db' },
  ])
    assert.throws(
      () => buildVercel(env, unexpected),
      /Connect TURSO|durable remote/,
    );
});

test('local and preview builds never migrate even if database credentials are present', () => {
  for (const VERCEL_ENV of [undefined, 'development', 'preview']) {
    const calls = [];
    assert.equal(
      buildVercel({ ...production, VERCEL_ENV }, (_node, args) => {
        calls.push(args[0]);
        return { status: 0 };
      }),
      0,
    );
    assert.deepEqual(calls, ['node_modules/vite/bin/vite.js']);
  }
});

test('a failed application build leaves the production database untouched', () => {
  const calls = [];
  assert.equal(
    buildVercel(production, (_node, args) => {
      calls.push(args[0]);
      return { status: 2 };
    }),
    2,
  );
  assert.deepEqual(calls, ['node_modules/vite/bin/vite.js']);
});

test('a successful production build applies versioned migrations before release', () => {
  const calls = [];
  assert.equal(
    buildVercel(production, (_node, args) => {
      calls.push(args[0]);
      return { status: 0 };
    }),
    0,
  );
  assert.deepEqual(calls, [
    'node_modules/vite/bin/vite.js',
    'scripts/migrate-vercel.mjs',
  ]);
});

test('database migration failure prevents a successful production release', () => {
  for (const status of [1, null]) {
    assert.equal(
      buildVercel(production, (_node, args) => ({
        status: args[0] === 'scripts/migrate-vercel.mjs' ? status : 0,
      })),
      1,
    );
  }
});
