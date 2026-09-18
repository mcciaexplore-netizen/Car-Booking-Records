import {
  first,
  db,
  setting,
  runtime,
  HttpError,
  now,
  id,
  hash,
  audit,
} from './server';
import { blank, validateValues, NUMBERS, TIMES, type Values } from './domain';
export const MAX_UPLOAD = 10 * 1024 * 1024;
export function detectMime(bytes: Uint8Array) {
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return 'image/jpeg';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => bytes[i] === x))
    return 'image/png';
  if (new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-')
    return 'application/pdf';
  return null;
}
export async function upload(file: File, kind: string, actor: string) {
  if (!['movement', 'driver', 'fuel', 'receipt'].includes(kind))
    throw new HttpError(400, 'Select a document type.');
  if (file.size < 8 || file.size > MAX_UPLOAD)
    throw new HttpError(413, 'Use a JPEG, PNG or PDF up to 10 MB.');
  const buffer = await file.arrayBuffer(),
    mime = detectMime(new Uint8Array(buffer));
  if (!mime || mime !== file.type)
    throw new HttpError(
      415,
      'The file content does not match an allowed JPEG, PNG or PDF type.',
    );
  const sha = await hash(buffer);
  const existing = await first('SELECT * FROM documents WHERE sha256=?', sha);
  if (existing)
    return {
      documentId: existing.id,
      duplicate: true,
      deleted: !!existing.deletedAt,
    };
  const docId = id(),
    key = `originals/${sha}`;
  await runtime().DOCUMENTS.put(key, buffer, {
    httpMetadata: { contentType: mime },
  });
  await db().batch([
    db()
      .prepare(
        'INSERT OR IGNORE INTO documents(id,sha256,name,mime,size,objectKey,kind,status,uploadedBy,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        docId,
        sha,
        file.name.slice(0, 240),
        mime,
        file.size,
        key,
        kind,
        'awaiting extraction',
        actor,
        now(),
      ),
    audit(docId, 'upload', actor, null, { name: file.name, sha256: sha }),
  ]);
  const saved = await first('SELECT id FROM documents WHERE sha256=?', sha);
  return { documentId: saved.id, duplicate: saved.id !== docId };
}
function endpoint() {
  const e = runtime();
  if (
    e.EXTRACTION_ENABLED !== 'true' ||
    !e.AZURE_DOCUMENT_ENDPOINT ||
    !e.AZURE_DOCUMENT_KEY
  )
    throw new HttpError(
      409,
      'Automatic extraction is not configured. You can transcribe and review rows manually.',
    );
  const u = new URL(e.AZURE_DOCUMENT_ENDPOINT);
  if (
    u.protocol !== 'https:' ||
    !u.hostname.endsWith('.cognitiveservices.azure.com') ||
    u.pathname !== '/' ||
    u.search ||
    u.username
  )
    throw new HttpError(
      503,
      'Azure endpoint is not a permitted Document Intelligence resource.',
    );
  return u.origin;
}
export async function beginExtraction(docId: string, actor: string) {
  const origin = endpoint();
  const doc = await first(
    'SELECT * FROM documents WHERE id=? AND deletedAt IS NULL',
    docId,
  );
  if (!doc) throw new HttpError(404, 'Document not found.');
  if (doc.operation || doc.status === 'extracted')
    return { status: doc.status };
  const e = runtime();
  const budget = await setting('extractionBudget', {
    monthlyPages: 0,
    maxPagesPerDocument: 0,
  });
  if (
    budget.monthlyPages < 1 ||
    budget.maxPagesPerDocument < 1 ||
    budget.maxPagesPerDocument > 30
  )
    throw new HttpError(
      409,
      'Configure an extraction page budget (at most 30 pages per document).',
    );
  const month = now().slice(0, 7),
    usage = await setting(`extractionUsage:${month}`, 0);
  if (usage + budget.maxPagesPerDocument > budget.monthlyPages)
    throw new HttpError(429, 'Monthly extraction page budget reached.');
  const claimed = await db()
    .prepare(
      "UPDATE documents SET status='submitting',error=NULL WHERE id=? AND status IN ('awaiting extraction','extraction failed') AND operation IS NULL",
    )
    .bind(docId)
    .run();
  if (!claimed.meta.changes)
    throw new HttpError(
      409,
      'This document already has an extraction request.',
    );
  // Reserve the maximum submitted page count before sending; no retry on uncertain POST outcomes.
  await db()
    .prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)')
    .bind(`extractionUsage:${month}`, '0')
    .run();
  const reserved = await db()
    .prepare(
      'UPDATE settings SET value=CAST(CAST(value AS INTEGER)+? AS TEXT) WHERE key=? AND CAST(value AS INTEGER)+?<=?',
    )
    .bind(
      budget.maxPagesPerDocument,
      `extractionUsage:${month}`,
      budget.maxPagesPerDocument,
      budget.monthlyPages,
    )
    .run();
  if (!reserved.meta.changes) {
    await db()
      .prepare("UPDATE documents SET status='awaiting extraction' WHERE id=?")
      .bind(docId)
      .run();
    throw new HttpError(429, 'Monthly extraction page budget reached.');
  }
  const original = await runtime().DOCUMENTS.get(doc.objectKey);
  if (!original) throw new HttpError(404, 'Original upload is unavailable.');
  try {
    const r = await fetch(
      `${origin}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=2024-11-30&pages=1-${budget.maxPagesPerDocument}`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': e.AZURE_DOCUMENT_KEY!,
          'Content-Type': doc.mime,
        },
        body: original.body,
        signal: AbortSignal.timeout(30000),
      },
    );
    const operation = r.headers.get('operation-location');
    if (!r.ok || !operation || new URL(operation).origin !== origin)
      throw new Error('Extraction submission uncertain');
    await db().batch([
      db()
        .prepare(
          "UPDATE documents SET status='extracting',operation=? WHERE id=?",
        )
        .bind(operation, docId),
      audit(docId, 'extraction-request', actor, null, {
        provider: 'Azure Document Intelligence',
        maxPages: budget.maxPagesPerDocument,
      }),
    ]);
    return { status: 'extracting' };
  } catch {
    await db()
      .prepare(
        "UPDATE documents SET status='submission uncertain',error='Check Azure request history before retrying to avoid duplicate charges.' WHERE id=?",
      )
      .bind(docId)
      .run();
    throw new HttpError(
      502,
      'Extraction submission could not be confirmed. Check Azure request history before retrying.',
    );
  }
}
export function extractDrafts(
  result: any,
  columns: Record<string, string> = {},
) {
  const rows: {
    page: number;
    row: number;
    original: any;
    values: Values;
    flags: string[];
  }[] = [];
  for (const [tableIndex, table] of (result.tables ?? []).entries()) {
    const headers = new Map<number, string>(
      (table.cells ?? [])
        .filter((c: any) => c.kind === 'columnHeader')
        .map((c: any) => [c.columnIndex, c.content]),
    );
    const indices = [
      ...new Set<number>(
        (table.cells ?? [])
          .filter((c: any) => c.kind !== 'columnHeader')
          .map((c: any) => c.rowIndex),
      ),
    ];
    for (const rowIndex of indices) {
      const cells = table.cells.filter(
        (c: any) => c.rowIndex === rowIndex && c.kind !== 'columnHeader',
      );
      const values: any = blank(),
        flags = [
          'Verify every extracted value against the original before confirmation.',
        ];
      for (const cell of cells) {
        const field = columns[String(headers.get(cell.columnIndex) ?? '')];
        if (!field || !(field in values)) continue;
        const raw = String(cell.content ?? '').trim();
        if (!raw) continue;
        // Raw dates/times remain unresolved. The operator must explicitly supply date and AM/PM.
        if (TIMES.includes(field) || field === 'registerDate') {
          flags.push(`${field}: confirm explicit date/time from “${raw}”`);
          continue;
        }
        if (NUMBERS.includes(field)) {
          if (/^\d+(\.\d+)?$/.test(raw)) values[field] = Number(raw);
          else flags.push(`${field}: ambiguous number “${raw}”`);
        } else if (field !== 'signaturePresent') values[field] = raw;
        const regions = cell.boundingRegions ?? [];
        if (!regions.length) flags.push('Source cell location is uncertain.');
      }
      const page =
        cells[0]?.boundingRegions?.[0]?.pageNumber ??
        table.boundingRegions?.[0]?.pageNumber ??
        1;
      const low = (result.pages ?? [])
        .find((p: any) => p.pageNumber === page)
        ?.words?.some((w: any) => w.confidence < 0.85);
      if (low)
        flags.push(
          'Low-confidence handwriting on this page; inspect the row carefully.',
        );
      const checked = validateValues(values);
      rows.push({
        page,
        row: tableIndex * 10000 + rowIndex + 1,
        original: {
          tableIndex,
          rowIndex,
          cells,
          headers: Object.fromEntries(headers),
          values: checked.values,
          fieldColumns: columns,
          pageGeometry: (() => {
            const p = (result.pages ?? []).find(
              (p: any) => p.pageNumber === page,
            );
            return p
              ? {
                  width: p.width,
                  height: p.height,
                  unit: p.unit,
                  pageNumber: p.pageNumber,
                }
              : null;
          })(),
        },
        values: checked.values,
        flags: [...flags, ...checked.flags],
      });
    }
  }
  if (!rows.length)
    for (const page of result.pages ?? [])
      rows.push({
        page: page.pageNumber,
        row: 1,
        original: { lines: page.lines, words: page.words },
        values: blank(),
        flags: [
          'No reliable table rows detected. Transcribe from the page; no values have been inferred.',
        ],
      });
  return rows;
}
export async function pollExtraction(docId: string) {
  const origin = endpoint(),
    doc = await first(
      'SELECT * FROM documents WHERE id=? AND deletedAt IS NULL',
      docId,
    );
  if (!doc) throw new HttpError(404, 'Document not found.');
  if (doc.status !== 'extracting' || !doc.operation)
    return { status: doc.status };
  if (new URL(doc.operation).origin !== origin)
    throw new HttpError(400, 'Invalid extraction operation.');
  const response = await fetch(doc.operation, {
    headers: { 'Ocp-Apim-Subscription-Key': runtime().AZURE_DOCUMENT_KEY! },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw new HttpError(502, 'Extraction status is temporarily unavailable.');
  const result = (await response.json()) as any;
  if (result.status === 'failed') {
    await db()
      .prepare(
        "UPDATE documents SET status='extraction failed',error='The provider could not extract this document. Manual transcription remains available.',operation=NULL WHERE id=?",
      )
      .bind(docId)
      .run();
    return { status: 'extraction failed' };
  }
  if (result.status !== 'succeeded') return { status: 'extracting' };
  const extractionKey = `extractions/${docId}.json`;
  await runtime().DOCUMENTS.put(extractionKey, JSON.stringify(result));
  const columns = await setting<Record<string, string>>('registerColumns', {}),
    rows = extractDrafts(result.analyzeResult, columns);
  for (let i = 0; i < rows.length; i += 30)
    await db().batch(
      rows
        .slice(i, i + 30)
        .map((row) =>
          db()
            .prepare(
              'INSERT OR IGNORE INTO extracted_rows(id,documentId,page,row,original,corrected,flags,state,createdAt) VALUES(?,?,?,?,?,?,?,?,?)',
            )
            .bind(
              `${docId}:${row.page}:${row.row}`,
              docId,
              row.page,
              row.row,
              JSON.stringify(row.original),
              JSON.stringify(row.values),
              JSON.stringify(row.flags),
              'Needs correction',
              now(),
            ),
        ),
    );
  await db()
    .prepare(
      "UPDATE documents SET status='extracted',extractionKey=? WHERE id=?",
    )
    .bind(extractionKey, docId)
    .run();
  return { status: 'extracted', rows: rows.length };
}
export async function addManualRow(
  docId: string,
  page: number,
  row: number,
  actor: string,
) {
  const doc = await first(
    'SELECT id FROM documents WHERE id=? AND deletedAt IS NULL',
    docId,
  );
  if (!doc) throw new HttpError(404, 'Document not found.');
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 2000 ||
    !Number.isInteger(row) ||
    row < 1 ||
    row > 9999
  )
    throw new HttpError(400, 'Enter a valid page and row number.');
  const rowId = `${docId}:${page}:${row}`;
  await db().batch([
    db()
      .prepare(
        'INSERT OR IGNORE INTO extracted_rows(id,documentId,page,row,original,corrected,flags,state,createdAt) VALUES(?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        rowId,
        docId,
        page,
        row,
        JSON.stringify({ method: 'manual', values: blank() }),
        JSON.stringify(blank()),
        JSON.stringify(['Manual transcription required.']),
        'Extracted draft',
        now(),
      ),
    audit(rowId, 'manual-draft', actor, null, { documentId: docId, page, row }),
  ]);
  return rowId;
}
export async function saveRow(
  rowId: string,
  version: number,
  values: unknown,
  confirm: boolean,
  actor: string,
) {
  const row = await first(
    'SELECT r.*,d.kind FROM extracted_rows r JOIN documents d ON d.id=r.documentId WHERE r.id=? AND d.deletedAt IS NULL',
    rowId,
  );
  if (!row) throw new HttpError(404, 'Register row not found.');
  if (row.version !== version)
    throw new HttpError(409, 'This row changed. Reload before saving.');
  const checked = validateValues(values);
  if (checked.flags.length) throw new HttpError(400, checked.flags.join(' '));
  const v = checked.values;
  if (confirm && !v.vehicleId)
    throw new HttpError(400, 'Confirm the vehicle registration first.');
  if (confirm && !v.departure && !v.registerDate)
    throw new HttpError(
      400,
      'Confirm at least the register date or departure date first.',
    );
  const state = confirm ? 'Confirmed register entry' : 'Needs correction',
    stamp = now(),
    encoded = JSON.stringify(v);
  const statements = [
    db()
      .prepare(
        'INSERT INTO change_history(id,entityId,action,actor,before,after,createdAt) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM extracted_rows WHERE id=? AND version=?)',
      )
      .bind(
        id(),
        rowId,
        confirm ? 'confirm-row' : 'correct-row',
        actor,
        JSON.stringify(row),
        JSON.stringify({ values: v, state }),
        stamp,
        rowId,
        version,
      ),
    db()
      .prepare(
        'UPDATE extracted_rows SET corrected=?,state=?,version=version+1,flags=?,reviewer=?,reviewedAt=? WHERE id=? AND version=?',
      )
      .bind(
        encoded,
        state,
        confirm ? '[]' : row.flags,
        actor,
        stamp,
        rowId,
        version,
      ),
  ];
  // Reopening a correction removes that row from confirmed metrics until reconfirmed.
  if (confirm && (row.kind === 'movement' || row.kind === 'driver'))
    statements.push(
      db()
        .prepare(
          'INSERT INTO actual_trips(id,rowId,data,updatedAt) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM extracted_rows WHERE id=? AND version=? AND reviewedAt=?) ON CONFLICT(rowId) DO UPDATE SET data=excluded.data,updatedAt=excluded.updatedAt',
        )
        .bind(
          `register:${rowId}`,
          rowId,
          encoded,
          stamp,
          rowId,
          version + 1,
          stamp,
        ),
    );
  else
    statements.push(
      db()
        .prepare(
          'DELETE FROM actual_trips WHERE rowId=? AND EXISTS(SELECT 1 FROM extracted_rows WHERE id=? AND version=? AND reviewedAt=?)',
        )
        .bind(rowId, rowId, version + 1, stamp),
    );
  if (confirm && (v.litres !== null || v.amount !== null))
    statements.push(
      db()
        .prepare(
          'INSERT INTO fuel_purchases(id,rowId,data,updatedAt) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM extracted_rows WHERE id=? AND version=? AND reviewedAt=?) ON CONFLICT(rowId) DO UPDATE SET data=excluded.data,updatedAt=excluded.updatedAt',
        )
        .bind(
          `fuel:${rowId}`,
          rowId,
          encoded,
          stamp,
          rowId,
          version + 1,
          stamp,
        ),
    );
  else
    statements.push(
      db()
        .prepare(
          'DELETE FROM fuel_purchases WHERE rowId=? AND EXISTS(SELECT 1 FROM extracted_rows WHERE id=? AND version=? AND reviewedAt=?)',
        )
        .bind(rowId, rowId, version + 1, stamp),
    );
  const results = await db().batch(statements);
  if (!results[1].meta.changes)
    throw new HttpError(409, 'This row changed. Reload before saving.');
  return { state, version: version + 1 };
}
