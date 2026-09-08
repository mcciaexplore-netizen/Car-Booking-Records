import {
  all,
  first,
  db,
  setting,
  setSetting,
  runtime,
  HttpError,
  now,
  id,
  hash,
  audit,
} from './server';
import { blank, validateValues, timestamp, type Kind } from './domain';
export type Mapping = {
  kind: Kind;
  report: string;
  form: string;
  fields: Record<string, string>;
  decisionValues?: Record<string, string>;
  dateFormat: 'iso-offset' | 'iso-local-ist' | 'dd-MMM-yyyy HH:mm:ss';
  modifiedField?: string;
  criteria?: string;
};
export type SyncConfig = {
  mappings: Mapping[];
  intervalMinutes: number;
  dailyApiBudget: number;
  allowanceVerified: boolean;
  incremental: boolean;
};
export const SYNC_DEFAULT: SyncConfig = {
  mappings: [],
  intervalMinutes: 60,
  dailyApiBudget: 0,
  allowanceVerified: false,
  incremental: false,
};
const DC: Record<string, string> = {
  US: 'com',
  IN: 'in',
  EU: 'eu',
  AU: 'com.au',
  JP: 'jp',
  CA: 'ca',
  SA: 'sa',
  CN: 'com.cn',
  UAE: 'ae',
};
export function configured() {
  const e = runtime();
  return !!(
    e.ZOHO_CLIENT_ID &&
    e.ZOHO_CLIENT_SECRET &&
    e.ZOHO_REFRESH_TOKEN &&
    DC[e.ZOHO_DC ?? ''] &&
    e.ZOHO_OWNER &&
    e.ZOHO_APP
  );
}
export async function token() {
  if (!configured())
    throw new HttpError(
      503,
      'Zoho is not connected. Configure the server secrets, account data centre, owner and app first.',
    );
  const e = runtime(),
    suffix = DC[e.ZOHO_DC!];
  const r = await fetch(`https://accounts.zoho.${suffix}/oauth/v2/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: e.ZOHO_CLIENT_ID!,
      client_secret: e.ZOHO_CLIENT_SECRET!,
      refresh_token: e.ZOHO_REFRESH_TOKEN!,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await r.json()) as any;
  if (!r.ok || !data.access_token)
    throw new HttpError(
      502,
      'Zoho OAuth refresh failed. Check the server connection.',
    );
  const domain = data.api_domain ?? `https://www.zohoapis.${suffix}`;
  if (domain !== `https://www.zohoapis.${suffix}`)
    throw new HttpError(
      502,
      'Zoho returned a different data centre. Check the configured region.',
    );
  return { access: data.access_token as string, domain };
}
export async function reserveCall() {
  const c = await setting('syncConfig', SYNC_DEFAULT);
  if (!c.allowanceVerified || c.dailyApiBudget < 1)
    throw new HttpError(
      409,
      'Verify the Zoho API allowance and set a daily budget before connecting.',
    );
  const day = now().slice(0, 10);
  await db()
    .prepare('INSERT OR IGNORE INTO api_budget(day,calls) VALUES(?,0)')
    .bind(day)
    .run();
  const result = await db()
    .prepare('UPDATE api_budget SET calls=calls+1 WHERE day=? AND calls<?')
    .bind(day, c.dailyApiBudget)
    .run();
  if (!result.meta.changes)
    throw new HttpError(
      429,
      'Fleet Desk daily API budget reached. Synchronization resumes after the UTC budget reset.',
    );
}
export async function zohoGet(
  path: string,
  query: Record<string, string> = {},
  cursor?: string,
  auth?: Awaited<ReturnType<typeof token>>,
) {
  await reserveCall();
  const t = auth ?? (await token());
  const url = new URL(t.domain + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const response = await fetch(url, {
    headers: {
      Authorization: `Zoho-oauthtoken ${t.access}`,
      accept: 'application/json',
      ...(cursor ? { record_cursor: cursor } : {}),
    },
    signal: AbortSignal.timeout(25000),
  });
  if (response.status === 429 || response.status >= 500) {
    const seconds = Math.min(
      3600,
      Math.max(10, Number(response.headers.get('retry-after')) || 60),
    );
    throw new RetryError(
      seconds,
      response.status === 429
        ? 'Zoho API rate limit reached.'
        : 'Zoho is temporarily unavailable.',
    );
  }
  const data = (await response.json()) as any;
  if (data.code === 3100) return { data: [], cursor: null };
  if (!response.ok || data.code !== 3000)
    throw new HttpError(
      502,
      `Zoho request failed (${Number(data.code) || response.status}). Review report access and mappings.`,
    );
  return {
    data: data.data ?? data,
    cursor: response.headers.get('record_cursor'),
  };
}
class RetryError extends Error {
  constructor(
    public seconds: number,
    message: string,
  ) {
    super(message);
  }
}
const base = (type: 'meta' | 'data') =>
  `/creator/v2.1/${type}/${encodeURIComponent(runtime().ZOHO_OWNER!)}/${encodeURIComponent(runtime().ZOHO_APP!)}`;
export async function discover() {
  const t = await token();
  const reports = await zohoGet(base('meta') + '/reports', {}, undefined, t);
  const forms = await zohoGet(base('meta') + '/forms', {}, undefined, t);
  const meta = {
    reports: reports.data,
    forms: forms.data,
    fields: {},
    discoveredAt: now(),
  };
  await setSetting('zohoMetadata', meta);
  return meta;
}
export async function discoverFields(form: string) {
  if (!/^[A-Za-z0-9_]+$/.test(form))
    throw new HttpError(400, 'Invalid form link name.');
  const meta: any = await setting('zohoMetadata', null);
  if (!meta) throw new HttpError(409, 'Discover reports and forms first.');
  const forms = meta.forms.forms ?? meta.forms;
  if (!Array.isArray(forms) || !forms.some((f: any) => f.link_name === form))
    throw new HttpError(400, 'Select a form returned by metadata discovery.');
  const fields = await zohoGet(base('meta') + `/form/${form}/fields`);
  meta.fields[form] = fields.data;
  await setSetting('zohoMetadata', meta);
  return meta;
}
export async function validateMappings(mappings: Mapping[]) {
  const meta: any = await setting('zohoMetadata', null);
  if (
    !meta ||
    !Array.isArray(mappings) ||
    mappings.length < 1 ||
    mappings.length > 16
  )
    throw new HttpError(
      400,
      'Discover the actual reports and fields before saving mappings.',
    );
  const reports = meta.reports.reports ?? meta.reports;
  const seen = new Set<string>();
  for (const m of mappings) {
    if (
      ![
        'vehicles',
        'employees',
        'drivers',
        'bookings',
        'approvals',
        'trips',
        'fuel',
        'maintenance',
      ].includes(m.kind) ||
      seen.has(m.kind)
    )
      throw new HttpError(400, 'Map each record type to at most one report.');
    seen.add(m.kind);
    if (
      !Array.isArray(reports) ||
      !reports.some((r: any) => r.link_name === m.report)
    )
      throw new HttpError(400, 'A mapped report was not discovered.');
    const fields = meta.fields[m.form]?.fields ?? meta.fields[m.form];
    if (!Array.isArray(fields))
      throw new HttpError(400, 'Inspect the selected form fields first.');
    const links = fields.map((f: any) => f.link_name);
    for (const p of Object.values(m.fields)) {
      if (typeof p !== 'string' || !links.includes(p.split('.')[0]))
        throw new HttpError(
          400,
          'A mapped field was not found in the inspected form.',
        );
    }
    if (m.modifiedField && !links.includes(m.modifiedField))
      throw new HttpError(
        400,
        'Modified-time field is not in the inspected metadata.',
      );
    if (
      !['iso-offset', 'iso-local-ist', 'dd-MMM-yyyy HH:mm:ss'].includes(
        m.dateFormat,
      )
    )
      throw new HttpError(400, 'Select an explicit timestamp format.');
  }
}
const valueAt = (r: any, path: string) =>
  path
    .split('.')
    .reduce((x, k) => (x && typeof x === 'object' ? x[k] : null), r);
export function mapRecord(raw: any, m: Mapping) {
  const data: any = { ...blank() };
  for (const [key, path] of Object.entries(m.fields)) {
    const value = valueAt(raw, path);
    data[key] = value === undefined || value === '' ? null : value;
  }
  const flags: string[] = [];
  for (const k of [
    'departure',
    'returnAt',
    'expectedReturn',
    'fuelLevelAt',
    'decidedAt',
  ]) {
    if (!data[k]) continue;
    let s = String(data[k]);
    if (
      m.dateFormat === 'iso-local-ist' &&
      /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)
    )
      s = s.replace(' ', 'T') + '+05:30';
    if (m.dateFormat === 'dd-MMM-yyyy HH:mm:ss') {
      const match = s.match(
        /^(\d{2})-([A-Za-z]{3})-(\d{4}) (\d{2}):(\d{2}):(\d{2})$/,
      );
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      if (match && months.includes(match[2]))
        s = `${match[3]}-${String(months.indexOf(match[2]) + 1).padStart(2, '0')}-${match[1]}T${match[4]}:${match[5]}:${match[6]}+05:30`;
    }
    data[k] = timestamp(s) !== null ? new Date(s).toISOString() : null;
    if (!data[k]) flags.push(`${k}: timestamp format could not be verified`);
  }
  for (const k of [
    'passengers',
    'startOdo',
    'endOdo',
    'litres',
    'amount',
    'capacity',
    'fuelLevel',
  ]) {
    if (data[k] !== null && data[k] !== undefined) {
      const s = String(data[k]);
      data[k] = /^\d+(\.\d+)?$/.test(s) ? Number(s) : null;
      if (data[k] === null) flags.push(`${k}: ambiguous number`);
    }
  }
  if (m.kind === 'approvals')
    data.decision = m.decisionValues?.[String(data.decision)] ?? null;
  if (m.kind === 'bookings')
    data.status = m.decisionValues?.[String(data.status)] ?? null;
  if (m.kind === 'trips' || m.kind === 'fuel' || m.kind === 'bookings') {
    const validated = validateValues(data);
    Object.assign(data, validated.values);
    flags.push(...validated.flags);
  }
  return {
    ...data,
    id: `zoho:${m.report}:${raw.ID}`,
    sourceId: String(raw.ID),
    source: 'zoho',
    confirmed: true,
    flags,
  };
}
export async function startSync(mode: 'full' | 'incremental' = 'full') {
  if (!configured()) throw new HttpError(503, 'Zoho is not connected.');
  const config = await setting('syncConfig', SYNC_DEFAULT);
  if (!config.mappings.length || !config.allowanceVerified)
    throw new HttpError(
      409,
      'Inspect field mappings and verify the account allowance first.',
    );
  const active = await first(
    "SELECT id FROM sync_runs WHERE status IN ('syncing','retrying')",
  );
  if (active) return active.id;
  const previous = await setting<string | null>('activeGeneration', null);
  if (
    !previous ||
    !config.incremental ||
    config.mappings.some((m) => !m.modifiedField)
  )
    mode = 'full';
  const run = id(),
    mappingHash = await hash(config.mappings);
  const inserted = await db()
    .prepare(
      "INSERT OR IGNORE INTO sync_runs(id,status,mode,startedAt,mappingHash) VALUES(?,'syncing',?,?,?)",
    )
    .bind(run, mode, now(), mappingHash)
    .run();
  if (!inserted.meta.changes)
    return (
      await first(
        "SELECT id FROM sync_runs WHERE status IN ('syncing','retrying')",
      )
    ).id;
  if (mode === 'incremental' && previous)
    await db()
      .prepare(
        'INSERT INTO source_records(generation,kind,id,report,sourceId,raw,data,fetchedAt) SELECT ?,kind,id,report,sourceId,raw,data,fetchedAt FROM source_records WHERE generation=?',
      )
      .bind(run, previous)
      .run();
  return run;
}
export async function syncStep() {
  const run = await first(
    "SELECT * FROM sync_runs WHERE status IN ('syncing','retrying') ORDER BY startedAt LIMIT 1",
  );
  if (!run) return { done: true };
  if (run.retryAt && run.retryAt > now())
    return { done: false, retryAt: run.retryAt };
  const lease = await db()
    .prepare(
      'UPDATE sync_runs SET leaseUntil=? WHERE id=? AND (leaseUntil IS NULL OR leaseUntil<?)',
    )
    .bind(new Date(Date.now() + 90000).toISOString(), run.id, now())
    .run();
  if (!lease.meta.changes) return { done: false, busy: true };
  try {
    const config = await setting('syncConfig', SYNC_DEFAULT);
    if ((await hash(config.mappings)) !== run.mappingHash)
      throw new HttpError(
        409,
        'Mappings changed during import. Start a fresh historical import.',
      );
    const m = config.mappings[run.reportIndex];
    if (!m) {
      await db().batch([
        db()
          .prepare(
            "UPDATE sync_runs SET status='succeeded',finishedAt=?,leaseUntil=NULL WHERE id=?",
          )
          .bind(now(), run.id),
        db()
          .prepare(
            "INSERT INTO settings(key,value) VALUES('activeGeneration',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          )
          .bind(JSON.stringify(run.id)),
        audit(
          run.id,
          'activate-sync',
          'system',
          await setting('activeGeneration', null),
          { generation: run.id, mode: run.mode },
        ),
      ]);
      return { done: true };
    }
    const query: Record<string, string> = {
      max_records: '1000',
      field_config: 'all',
    };
    if (m.criteria) query.criteria = m.criteria;
    if (run.mode === 'incremental' && m.modifiedField) {
      const previous = await first(
        'SELECT startedAt FROM sync_runs WHERE id=?',
        await setting('activeGeneration', null),
      );
      const watermark = new Date(Date.parse(previous.startedAt) - 300000)
        .toLocaleString('en-GB', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hourCycle: 'h23',
        })
        .replace(/ (\w{3}) /, '-$1-')
        .replace(',', '');
      query.criteria = [m.criteria, `${m.modifiedField} >= "${watermark}"`]
        .filter(Boolean)
        .map((x) => `(${x})`)
        .join(' && ');
    }
    const result = await zohoGet(
      base('data') + `/report/${encodeURIComponent(m.report)}`,
      query,
      run.cursor ?? undefined,
    );
    if (!Array.isArray(result.data))
      throw new HttpError(502, 'Unexpected Zoho record response.');
    if (result.cursor && result.cursor === run.cursor)
      throw new HttpError(
        502,
        'Zoho repeated a pagination cursor. Import stopped to protect completeness.',
      );
    for (let i = 0; i < result.data.length; i += 50) {
      const slice = result.data.slice(i, i + 50);
      await db().batch(
        slice.map((raw) => {
          if (!raw.ID)
            throw new HttpError(502, 'A source record has no stable ID.');
          const mapped = mapRecord(raw, m);
          return db()
            .prepare(
              'INSERT INTO source_records(generation,kind,id,report,sourceId,raw,data,fetchedAt) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(generation,kind,id) DO UPDATE SET raw=excluded.raw,data=excluded.data,fetchedAt=excluded.fetchedAt',
            )
            .bind(
              run.id,
              m.kind,
              mapped.id,
              m.report,
              String(raw.ID),
              JSON.stringify(raw),
              JSON.stringify(mapped),
              now(),
            );
        }),
      );
    }
    await db()
      .prepare(
        "UPDATE sync_runs SET reportIndex=?,cursor=?,pages=pages+1,count=count+?,attempts=0,status='syncing',retryAt=NULL,leaseUntil=NULL,error=NULL WHERE id=?",
      )
      .bind(
        result.cursor ? run.reportIndex : run.reportIndex + 1,
        result.cursor,
        result.data.length,
        run.id,
      )
      .run();
    return { done: false, pages: run.pages + 1 };
  } catch (e) {
    const transient =
      e instanceof RetryError ||
      e instanceof TypeError ||
      (e instanceof Error && ['TimeoutError', 'AbortError'].includes(e.name)) ||
      (e instanceof HttpError && e.status === 429);
    const attempts = run.attempts + 1;
    const retrying = transient && attempts <= 8;
    const delay =
      e instanceof RetryError ? e.seconds : Math.min(3600, 30 * 2 ** attempts);
    await db()
      .prepare(
        'UPDATE sync_runs SET status=?,error=?,attempts=?,retryAt=?,leaseUntil=NULL,finishedAt=? WHERE id=?',
      )
      .bind(
        retrying ? 'retrying' : 'failed',
        e instanceof HttpError || e instanceof RetryError
          ? e.message
          : 'Connection interrupted; the previous successful snapshot is retained.',
        attempts,
        retrying ? new Date(Date.now() + delay * 1000).toISOString() : null,
        retrying ? null : now(),
        run.id,
      )
      .run();
    return { done: !retrying, error: true };
  }
}
