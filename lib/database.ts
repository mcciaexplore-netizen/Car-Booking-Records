import {
  createClient,
  type Client,
  type InStatement,
  type InValue,
} from '@libsql/client';
import type { Database, PreparedQuery } from './platform-types';

let client: Client | undefined;
export function databaseClient() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error('TURSO_DATABASE_URL is not configured.');
  if (
    process.env.VERCEL &&
    !url.startsWith('libsql://') &&
    !url.startsWith('https://')
  )
    throw new Error('Vercel requires a durable remote database.');
  if (process.env.VERCEL && !process.env.TURSO_AUTH_TOKEN)
    throw new Error('TURSO_AUTH_TOKEN is not configured.');
  return (client ??= createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  }));
}
export function adaptDatabase(connection: Client): Database {
  class Query implements PreparedQuery {
    readonly statement: InStatement;
    constructor(
      readonly sql: string,
      args: InValue[] = [],
    ) {
      this.statement = { sql, args };
    }
    bind(...args: InValue[]) {
      return new Query(this.sql, args);
    }
    async all<T>() {
      const result = await connection.execute(this.statement);
      return {
        results: result.rows.map((row) =>
          Object.fromEntries(Object.entries(row)),
        ) as T[],
      };
    }
    async first<T>() {
      return (await this.all<T>()).results[0] ?? null;
    }
    async run() {
      const result = await connection.execute(this.statement);
      return { success: true, meta: { changes: result.rowsAffected } };
    }
  }
  return {
    prepare: (sql) => new Query(sql),
    async batch(queries) {
      const results = await connection.batch(
        queries.map((query) => {
          if (!(query instanceof Query))
            throw new Error('Foreign database query.');
          return query.statement;
        }),
        'write',
      );
      return results.map((result) => ({
        success: true,
        meta: { changes: result.rowsAffected },
      }));
    },
  };
}
