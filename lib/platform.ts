import { adaptDatabase, databaseClient } from './database';
import { privateDocuments } from './private-storage';
import type { Runtime } from './server';
/** Server only: no public-prefixed secrets or browser-header authentication. */
export function platformRuntime(): Runtime {
  return {
    ...process.env,
    DB: process.env.TURSO_DATABASE_URL
      ? adaptDatabase(databaseClient())
      : undefined,
    DOCUMENTS: privateDocuments,
    SCHEDULER_SECRET: process.env.CRON_SECRET ?? process.env.SCHEDULER_SECRET,
  } as Runtime;
}
