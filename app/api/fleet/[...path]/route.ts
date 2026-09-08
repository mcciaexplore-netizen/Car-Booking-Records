import {
  handle,
  limitedBody,
  json,
  member,
  sameOrigin,
  body,
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
} from '../../../../lib/server';
import { snapshot, recordReconciliations, review } from '../../../../lib/data';
import { csv, DEFAULT_RULES, FIELDS, type Role } from '../../../../lib/domain';
import {
  upload,
  beginExtraction,
  pollExtraction,
  addManualRow,
  saveRow,
} from '../../../../lib/documents';
import {
  configured,
  discover,
  discoverFields,
  SYNC_DEFAULT,
  validateMappings,
  startSync,
  syncStep,
} from '../../../../lib/zoho';
export const dynamic = 'force-dynamic';
const parts = (r: Request) =>
  new URL(r.url).pathname.split('/').filter(Boolean).slice(2);
const WRITE: Role[] = ['Administrator', 'Manager', 'Register operator'];
export async function GET(request: Request) {
  return handle(async () => {
    const [route, recordId] = parts(request),
      user = await member();
    const params = new URL(request.url).searchParams;
    if (route === 'snapshot')
      return json({ user, ...(await snapshot(params)) });
    if (route === 'export') {
      const s = await snapshot(params);
      const type = params.get('type') ?? 'trips';
      const records =
        type === 'fuel'
          ? s.fuel
          : type === 'bookings'
            ? s.bookings
            : type === 'noUsage'
              ? s.noUsage
              : s.trips;
      return new Response('\ufeff' + csv(records), {
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="fleet-${type.replace(/[^a-z]/gi, '')}.csv"`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }
    if (route === 'document') {
      const doc = await first(
        'SELECT * FROM documents WHERE id=? AND deletedAt IS NULL',
        recordId,
      );
      if (!doc) throw new HttpError(404, 'Document not found.');
      const object = await runtime().DOCUMENTS.get(doc.objectKey);
      if (!object) throw new HttpError(404, 'Original file is unavailable.');
      return new Response(object.body, {
        headers: {
          'Content-Type': doc.mime,
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Security-Policy': "sandbox; frame-ancestors 'self'",
          'Referrer-Policy': 'no-referrer',
        },
      });
    }
    if (route === 'history')
      return json({
        changes: await all(
          'SELECT * FROM change_history WHERE entityId=? ORDER BY createdAt',
          recordId,
        ),
        decisions: await all(
          'SELECT * FROM review_decisions WHERE tripId=? ORDER BY createdAt',
          recordId,
        ),
        reconciliations: await all(
          'SELECT * FROM reconciliations WHERE tripId=? ORDER BY createdAt',
          recordId,
        ),
      });
    if (route === 'alerts')
      return json({
        alerts: await all(
          "SELECT * FROM alerts WHERE state='open' ORDER BY updatedAt DESC",
        ),
        delivery: 'disabled',
      });
    if (route === 'settings') {
      await member(['Administrator']);
      return json({
        syncConfig: await setting('syncConfig', SYNC_DEFAULT),
        metadata: await setting('zohoMetadata', null),
        rules: await setting('rules', DEFAULT_RULES),
        registerColumns: await setting('registerColumns', {}),
        extractionBudget: await setting('extractionBudget', {
          monthlyPages: 0,
          maxPagesPerDocument: 0,
        }),
        retention: await setting('retention', { originalDays: null }),
        notificationRules: await setting('notificationRules', {
          permission: true,
          overdue: true,
          sync: true,
          correction: true,
          missing: true,
          deliveryEnabled: false,
        }),
        users: await all('SELECT * FROM users'),
        runs: await all(
          'SELECT * FROM sync_runs ORDER BY startedAt DESC LIMIT 30',
        ),
        configured: {
          zoho: configured(),
          extraction:
            runtime().EXTRACTION_ENABLED === 'true' &&
            !!runtime().AZURE_DOCUMENT_KEY,
          schedulerSecret: !!runtime().SCHEDULER_SECRET,
        },
        budget: await all('SELECT * FROM api_budget ORDER BY day DESC LIMIT 7'),
      });
    }
    throw new HttpError(404, 'Unknown endpoint.');
  });
}
export async function POST(request: Request) {
  return handle(async () => {
    const [route, recordId] = parts(request);
    if (route === 'scheduled') {
      const secret = runtime().SCHEDULER_SECRET;
      if (
        !secret ||
        (await hash(request.headers.get('authorization') ?? '')) !==
          (await hash(`Bearer ${secret}`))
      )
        throw new HttpError(401, 'Invalid scheduler authentication.');
      const config = await setting('syncConfig', SYNC_DEFAULT);
      if (!config.allowanceVerified || !configured())
        return json({ state: 'not configured' });
      const active = await first(
        "SELECT id FROM sync_runs WHERE status IN ('syncing','retrying')",
      );
      const last = await first(
        "SELECT * FROM sync_runs WHERE status='succeeded' ORDER BY startedAt DESC LIMIT 1",
      );
      if (
        !active &&
        (!last ||
          Date.now() - Date.parse(last.startedAt) >=
            config.intervalMinutes * 60000)
      ) {
        const full = await first(
          "SELECT * FROM sync_runs WHERE mode='full' AND status='succeeded' ORDER BY startedAt DESC LIMIT 1",
        );
        await startSync(
          !full || Date.now() - Date.parse(full.startedAt) > 86400000
            ? 'full'
            : 'incremental',
        );
      }
      const result = await syncStep();
      await recordReconciliations();
      return json(result);
    }
    sameOrigin(request);
    if (route === 'upload') {
      const user = await member(WRITE);
      const length = Number(request.headers.get('content-length'));
      if (length > 11 * 1024 * 1024)
        throw new HttpError(413, 'Maximum upload size is 10 MB per file.');
      const data = await new Response(
          await limitedBody(request, 11 * 1024 * 1024),
          {
            headers: {
              'Content-Type': request.headers.get('content-type') ?? '',
            },
          },
        ).formData(),
        file = data.get('file');
      if (!(file instanceof File)) throw new HttpError(400, 'Select a file.');
      const result = await upload(file, String(data.get('kind')), user.email);
      if (!result.duplicate && runtime().EXTRACTION_ENABLED === 'true') {
        try {
          await beginExtraction(result.documentId, user.email);
        } catch {
          /* Original remains securely available; status is visible in review. */
        }
      }
      return json(result);
    }
    if (['extract', 'poll', 'draft', 'row'].includes(route)) {
      const user = await member(WRITE),
        input = await body(request);
      let result;
      if (route === 'extract')
        result = await beginExtraction(recordId, user.email);
      if (route === 'poll') result = await pollExtraction(recordId);
      if (route === 'draft')
        result = await addManualRow(
          recordId,
          input.page,
          input.row,
          user.email,
        );
      if (route === 'row')
        result = await saveRow(
          recordId,
          input.version,
          input.values,
          input.confirm === true,
          user.email,
        );
      if (route === 'row') await recordReconciliations();
      return json(result);
    }
    if (route === 'review') {
      const user = await member(['Administrator', 'Manager']);
      return json(await review(await body(request), user.email));
    }
    const user = await member(['Administrator']);
    const input = await body(request);
    if (route === 'discover') return json(await discover());
    if (route === 'fields') return json(await discoverFields(input.form));
    if (route === 'sync') {
      if (input.step) {
        const result = await syncStep();
        if (result.done) await recordReconciliations();
        return json(result);
      }
      return json({
        runId: await startSync(
          input.mode === 'incremental' ? 'incremental' : 'full',
        ),
      });
    }
    if (route === 'settings') {
      const permitted = [
        'syncConfig',
        'rules',
        'registerColumns',
        'extractionBudget',
        'retention',
        'notificationRules',
      ];
      if (!permitted.includes(input.key))
        throw new HttpError(400, 'Unknown setting.');
      const v = input.value;
      if (input.key === 'syncConfig') {
        if (
          !v ||
          !Number.isInteger(v.intervalMinutes) ||
          v.intervalMinutes < 15 ||
          !Number.isInteger(v.dailyApiBudget) ||
          v.dailyApiBudget < 1 ||
          v.dailyApiBudget > 100000 ||
          typeof v.allowanceVerified !== 'boolean'
        )
          throw new HttpError(
            400,
            'Enter a verified daily API budget and interval of at least 15 minutes.',
          );
        if (v.mappings.length) await validateMappings(v.mappings);
        if (
          await first(
            "SELECT id FROM sync_runs WHERE status IN ('syncing','retrying')",
          )
        )
          throw new HttpError(
            409,
            'Wait for the current import before changing mappings.',
          );
      }
      if (
        input.key === 'rules' &&
        (!Number.isFinite(v.earlyMinutes) ||
          !Number.isFinite(v.lateMinutes) ||
          v.earlyMinutes < 0 ||
          v.lateMinutes < 0 ||
          v.earlyMinutes > 1440 ||
          v.lateMinutes > 1440)
      )
        throw new HttpError(
          400,
          'Tolerances must be between 0 and 1440 minutes.',
        );
      if (
        input.key === 'registerColumns' &&
        Object.values(v).some((x) => !Object.keys(FIELDS).includes(String(x)))
      )
        throw new HttpError(
          400,
          'Map printed column headers to a supported register field.',
        );
      if (
        input.key === 'extractionBudget' &&
        (!Number.isInteger(v.monthlyPages) ||
          v.monthlyPages < 1 ||
          !Number.isInteger(v.maxPagesPerDocument) ||
          v.maxPagesPerDocument < 1 ||
          v.maxPagesPerDocument > 30)
      )
        throw new HttpError(
          400,
          'Enter a page budget; maximum 30 pages per document.',
        );
      if (
        input.key === 'retention' &&
        v.originalDays !== null &&
        (!Number.isInteger(v.originalDays) || v.originalDays < 30)
      )
        throw new HttpError(
          400,
          'Retention must be at least 30 days, or null to retain until policy is agreed.',
        );
      if (input.key === 'notificationRules') {
        v.deliveryEnabled = false;
        delete v.recipients;
        delete v.webhook;
      }
      await db().batch([
        db()
          .prepare(
            'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
          )
          .bind(input.key, JSON.stringify(v)),
        audit(
          input.key,
          'settings',
          user.email,
          await setting(input.key, null),
          v,
        ),
      ]);
      if (['rules', 'notificationRules'].includes(input.key))
        await recordReconciliations();
      return json({ saved: true });
    }
    if (route === 'users') {
      const roles: Role[] = [
        'Administrator',
        'Manager',
        'Register operator',
        'Viewer',
      ];
      if (
        typeof input.email !== 'string' ||
        !/^\S+@\S+\.\S+$/.test(input.email) ||
        !roles.includes(input.role)
      )
        throw new HttpError(400, 'Enter an email address and valid role.');
      const email = input.email.toLowerCase();
      if (
        email === user.email.toLowerCase() &&
        (input.role !== 'Administrator' || input.active === false)
      )
        throw new HttpError(
          400,
          'You cannot remove your own administrator access.',
        );
      await db().batch([
        db()
          .prepare(
            'INSERT INTO users(id,email,role,active,createdAt) VALUES(?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,active=excluded.active',
          )
          .bind(id(), email, input.role, input.active === false ? 0 : 1, now()),
        audit(
          email,
          'access-change',
          user.email,
          await first('SELECT role,active FROM users WHERE email=?', email),
          { role: input.role, active: input.active !== false },
        ),
      ]);
      return json({ saved: true });
    }
    if (route === 'purge') {
      if (typeof input.reason !== 'string' || input.reason.trim().length < 5)
        throw new HttpError(400, 'Document the retention deletion reason.');
      const policy = await setting('retention', {
        originalDays: null as number | null,
      });
      if (!policy.originalDays)
        throw new HttpError(409, 'Configure an agreed retention period first.');
      const cutoff = new Date(
        Date.now() - policy.originalDays * 86400000,
      ).toISOString();
      const doc = await first(
        'SELECT * FROM documents WHERE id=? AND deletedAt IS NULL AND createdAt<?',
        recordId,
        cutoff,
      );
      if (!doc)
        throw new HttpError(
          409,
          'Document is not eligible under the retention policy.',
        );
      if (
        await first(
          "SELECT id FROM extracted_rows WHERE documentId=? AND state!='Confirmed register entry'",
          recordId,
        )
      )
        throw new HttpError(
          409,
          'Unresolved rows must be reviewed before deleting the original.',
        );
      await runtime().DOCUMENTS.delete(doc.objectKey);
      if (doc.extractionKey)
        await runtime().DOCUMENTS.delete(doc.extractionKey);
      await db().batch([
        db()
          .prepare('UPDATE documents SET deletedAt=?,status=? WHERE id=?')
          .bind(now(), 'deleted under retention policy', recordId),
        audit(
          recordId,
          'retention-delete',
          user.email,
          { sha256: doc.sha256 },
          { reason: input.reason },
        ),
      ]);
      return json({ deleted: true });
    }
    throw new HttpError(404, 'Unknown endpoint.');
  });
}
