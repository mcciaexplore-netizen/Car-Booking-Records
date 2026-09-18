import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function buildVercel(env = process.env, run = spawnSync) {
  const production = env.VERCEL_ENV === 'production';
  if (production) {
    if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN)
      throw new Error(
        'Connect TURSO_DATABASE_URL and TURSO_AUTH_TOKEN before deploying production.',
      );
    if (!/^(libsql|https):\/\//.test(env.TURSO_DATABASE_URL))
      throw new Error('Production requires a durable remote database.');
  }
  const result = run(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build'],
    { stdio: 'inherit', env: { ...env, NITRO_PRESET: 'vercel' } },
  );
  if (result.status !== 0) return result.status ?? 1;
  // Initialize/upgrade the connected database before Vercel publishes this build.
  // Preview builds must never apply migrations to a shared production database.
  if (production) {
    const migration = run(process.execPath, ['scripts/migrate-vercel.mjs'], {
      stdio: 'inherit',
      env,
    });
    return migration.status ?? 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(buildVercel());
