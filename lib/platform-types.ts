/** Persistence contract shared by production adapters and isolated tests. */
import type { InValue } from '@libsql/client';
export interface PreparedQuery {
  bind(...args: InValue[]): PreparedQuery;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
}
export interface Database {
  prepare(sql: string): PreparedQuery;
  batch(
    queries: PreparedQuery[],
  ): Promise<{ success: boolean; meta: { changes: number } }[]>;
}
export interface DocumentStore {
  put(
    key: string,
    data: string | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<{ body: BodyInit } | null>;
  delete(key: string): Promise<unknown>;
}
