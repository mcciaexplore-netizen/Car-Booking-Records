import { platformRuntime } from './platform';
import type { Database, DocumentStore } from './platform-types';
import { getChatGPTUser } from '../app/chatgpt-auth';
import type { Role } from './domain';
import { publicAccessEnabled } from './access';
export type Runtime = {
  DB: Database;
  DOCUMENTS: DocumentStore;
  ZOHO_CLIENT_ID?: string;
  ZOHO_CLIENT_SECRET?: string;
  ZOHO_REFRESH_TOKEN?: string;
  ZOHO_DC?: string;
  ZOHO_OWNER?: string;
  ZOHO_APP?: string;
  AZURE_DOCUMENT_ENDPOINT?: string;
  AZURE_DOCUMENT_KEY?: string;
  EXTRACTION_ENABLED?: string;
  SCHEDULER_SECRET?: string;
  FLEET_ADMIN_EMAIL?: string;
  FLEET_UX_FIXTURES?: string;
};
export const runtime = () => {
  return platformRuntime();
};
export function db() {
  const d = runtime().DB;
  if (!d) throw new HttpError(503, 'Database is not provisioned.');
  return d;
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
export async function all<T = any>(sql: string, ...args: any[]): Promise<T[]> {
  return (
    await db()
      .prepare(sql)
      .bind(...args)
      .all<T>()
  ).results;
}
export async function first<T = any>(
  sql: string,
  ...args: any[]
): Promise<T | null> {
  return db()
    .prepare(sql)
    .bind(...args)
    .first<T>();
}
export async function setting<T>(key: string, fallback: T): Promise<T> {
  const r = await first('SELECT value FROM settings WHERE key=?', key);
  return r ? JSON.parse(r.value) : fallback;
}
export const setSetting = (key: string, value: unknown) =>
  db()
    .prepare(
      'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    )
    .bind(key, JSON.stringify(value))
    .run();
export async function hash(value: unknown) {
  const bytes =
    typeof value === 'string'
      ? new TextEncoder().encode(value)
      : value instanceof ArrayBuffer
        ? value
        : new TextEncoder().encode(JSON.stringify(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
export function assertRole(role: Role, allowed: Role[]) {
  if (!allowed.includes(role))
    throw new HttpError(403, 'Your role cannot perform this action.');
}
export async function member(
  allowed: Role[] = ['Administrator', 'Manager', 'Register operator', 'Viewer'],
) {
  if (publicAccessEnabled())
    throw new HttpError(
      403,
      'Changes and administration are unavailable in the public dashboard.',
    );
  const user = await getChatGPTUser();
  if (!user) throw new HttpError(401, 'Sign in to access Car Booking Details.');
  let record = await first(
    'SELECT * FROM users WHERE email=?',
    user.email.toLowerCase(),
  );
  const owner = runtime().FLEET_ADMIN_EMAIL;
  if (!record && owner && user.email.toLowerCase() === owner.toLowerCase()) {
    await db()
      .prepare(
        'INSERT OR IGNORE INTO users(id,email,role,active,createdAt) VALUES(?,?,?,?,?)',
      )
      .bind(user.userId, user.email.toLowerCase(), 'Administrator', 1, now())
      .run();
    record = await first(
      'SELECT * FROM users WHERE email=?',
      user.email.toLowerCase(),
    );
  }
  if (!record || !record.active)
    throw new HttpError(
      403,
      'Your account has not been granted Car Booking Details access. Contact the administrator.',
    );
  assertRole(record.role, allowed);
  return {
    id: user.userId,
    email: user.email,
    name: user.displayName,
    role: record.role as Role,
  };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    throw new HttpError(403, 'Request origin is not allowed.');
}
/** Public reading never creates a staff account or grants write permissions. */
export async function readAccess() {
  if (publicAccessEnabled())
    return {
      id: 'public',
      email: '',
      name: 'Public access',
      role: 'Viewer' as Role,
    };
  return member();
}
export async function body(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new HttpError(415, 'Expected JSON.');
  const text = new TextDecoder().decode(await limitedBody(request, 200000));
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}
export async function limitedBody(
  request: Request,
  limit: number,
): Promise<ArrayBuffer> {
  if (Number(request.headers.get('content-length')) > limit)
    throw new HttpError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) return new ArrayBuffer(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new HttpError(413, 'Request is too large.');
    }
    chunks.push(value);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result.buffer;
}
export function audit(
  entityId: string,
  action: string,
  actor: string,
  before: unknown,
  after: unknown,
) {
  return db()
    .prepare(
      'INSERT INTO change_history(id,entityId,action,actor,before,after,createdAt) VALUES(?,?,?,?,?,?,?)',
    )
    .bind(
      id(),
      entityId,
      action,
      actor,
      before === undefined ? null : JSON.stringify(before),
      after === undefined ? null : JSON.stringify(after),
      now(),
    );
}
export async function handle(work: () => Promise<Response>) {
  try {
    return await work();
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    return json(
      {
        error:
          'Operation failed. Saved records are unchanged; contact the administrator.',
      },
      500,
    );
  }
}
