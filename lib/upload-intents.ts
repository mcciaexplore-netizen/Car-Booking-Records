import { db, first, id, now, HttpError, runtime, limitedBody } from './server';
import { upload, MAX_UPLOAD, beginExtraction } from './documents';

export async function prepareUpload(
  input: { name?: unknown; mime?: unknown; size?: unknown; kind?: unknown },
  actor: string,
) {
  if (
    typeof input.mime !== 'string' ||
    !['image/jpeg', 'image/png', 'application/pdf'].includes(input.mime) ||
    typeof input.size !== 'number' ||
    !Number.isInteger(input.size) ||
    input.size < 8 ||
    input.size > MAX_UPLOAD ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    typeof input.kind !== 'string' ||
    !['movement', 'driver', 'fuel', 'receipt'].includes(input.kind)
  )
    throw new HttpError(
      400,
      'Choose a JPEG, PNG or PDF up to 10 MB and a document type.',
    );
  const intentId = id(),
    objectKey = `staging/${intentId}`;
  const stamp = now(),
    cutoff = new Date(Date.now() - 3600000).toISOString();
  const saved = await db()
    .prepare(`INSERT INTO upload_intents(id,actor,name,mime,size,kind,objectKey,createdAt,expiresAt)
    SELECT ?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM upload_intents WHERE actor=? AND createdAt>?)<60`)
    .bind(
      intentId,
      actor,
      input.name.slice(0, 240),
      input.mime,
      input.size,
      input.kind,
      objectKey,
      stamp,
      new Date(Date.now() + 15 * 60000).toISOString(),
      actor,
      cutoff,
    )
    .run();
  if (!saved.meta.changes)
    throw new HttpError(429, 'Upload limit reached. Try again in an hour.');
  return { intentId, pathname: objectKey };
}
export async function claimUploadToken(pathname: string, actor: string) {
  const intent = await first(
    'SELECT * FROM upload_intents WHERE objectKey=? AND actor=?',
    pathname,
    actor,
  );
  if (!intent || intent.result || intent.expiresAt <= now())
    throw new HttpError(
      403,
      'Upload permission expired. Select the file again.',
    );
  const claim = await db()
    .prepare(
      'UPDATE upload_intents SET tokenIssuedAt=? WHERE id=? AND tokenIssuedAt IS NULL',
    )
    .bind(now(), intent.id)
    .run();
  if (!claim.meta.changes)
    throw new HttpError(
      409,
      'This upload permission was already issued. Select the file again.',
    );
  return {
    allowedContentTypes: [intent.mime],
    maximumSizeInBytes: intent.size,
    validUntil: Date.parse(intent.expiresAt),
    addRandomSuffix: false,
    allowOverwrite: false,
  };
}
export async function finalizeUpload(intentId: string, actor: string) {
  const intent = await first(
    'SELECT * FROM upload_intents WHERE id=? AND actor=?',
    intentId,
    actor,
  );
  if (!intent) throw new HttpError(404, 'Upload not found.');
  if (intent.result) return JSON.parse(intent.result);
  if (intent.expiresAt <= now())
    throw new HttpError(410, 'Upload expired. Select the file again.');
  const object = await runtime().DOCUMENTS.get(intent.objectKey);
  if (!object)
    throw new HttpError(409, 'File transfer is not complete. Retry this file.');
  const buffer = await limitedBody(
    new Request('https://storage.local/', {
      method: 'POST',
      body: object.body,
      duplex: 'half',
    } as RequestInit),
    MAX_UPLOAD,
  );
  if (buffer.byteLength !== intent.size)
    throw new HttpError(400, 'Uploaded size does not match the selected file.');
  const result = await upload(
    new File([buffer], intent.name, { type: intent.mime }),
    intent.kind,
    actor,
  );
  await db()
    .prepare('UPDATE upload_intents SET result=? WHERE id=?')
    .bind(JSON.stringify(result), intentId)
    .run();
  // A failed cleanup must not turn a successfully saved original into an upload failure.
  try {
    await runtime().DOCUMENTS.delete(intent.objectKey);
  } catch {
    /* Scheduled cleanup retries. */
  }
  if (!result.duplicate && runtime().EXTRACTION_ENABLED === 'true') {
    try {
      await beginExtraction(result.documentId, actor);
    } catch {
      /* Review shows extraction status. */
    }
  }
  return result;
}
export async function cleanupStaging() {
  const rows = (
    await db()
      .prepare(
        'SELECT id,objectKey FROM upload_intents WHERE expiresAt<? LIMIT 100',
      )
      .bind(now())
      .all<{ id: string; objectKey: string }>()
  ).results;
  for (const row of rows) {
    await runtime().DOCUMENTS.delete(row.objectKey);
    await db()
      .prepare('DELETE FROM upload_intents WHERE id=?')
      .bind(row.id)
      .run();
  }
  return rows.length;
}
