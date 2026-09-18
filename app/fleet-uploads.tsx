'use client';
import { useEffect, useRef, useState } from 'react';
import { FileText, Upload, RotateCcw, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, Badge, Picker, Field, date, fmt } from './fleet-ui';
import { Pager } from './fleet-records';
import { upload as uploadBlob } from '@vercel/blob/client';

type QueueItem = {
  id: string;
  file: File;
  kind: string;
  state: string;
  error?: string;
  documentId?: string;
};
export function UploadWorkspace({
  data,
  nav,
  canUpload,
  refresh,
  run,
  busy,
}: any) {
  const [kind, setKind] = useState('movement'),
    [queue, setQueue] = useState<QueueItem[]>([]),
    [dragging, setDragging] = useState(false),
    [message, setMessage] = useState('');
  const running = useRef(new Set<string>());
  const uploadActive = queue.some((q) =>
    ['Selected', 'Validating', 'Uploading'].includes(q.state),
  );
  useEffect(() => {
    if (!uploadActive) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [uploadActive]);
  async function send(item: QueueItem) {
    if (running.current.has(item.id)) return;
    running.current.add(item.id);
    const update = (fields: Partial<QueueItem>) =>
      setQueue((q) =>
        q.map((x) => (x.id === item.id ? { ...x, ...fields } : x)),
      );
    update({ state: 'Validating', error: undefined });
    try {
      if (
        !['image/jpeg', 'image/png', 'application/pdf'].includes(item.file.type)
      )
        throw Error('Choose a JPEG, PNG or PDF file.');
      if (!item.file.size || item.file.size > 10 * 1024 * 1024)
        throw Error('Each file must be nonempty and no larger than 10 MB.');
      update({ state: 'Uploading' });
      const sendMetadata = async <T,>(input: object): Promise<T> => {
        const response = await fetch('/api/uploads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        });
        const result = (await response.json()) as T & { error?: string };
        if (!response.ok)
          throw Error(result.error ?? 'Upload failed. Retry this file.');
        return result;
      };
      const intent = await sendMetadata<{ pathname: string; intentId: string }>(
        {
          action: 'prepare',
          name: item.file.name,
          mime: item.file.type,
          size: item.file.size,
          kind: item.kind,
        },
      );
      await uploadBlob(intent.pathname, item.file, {
        access: 'private',
        handleUploadUrl: '/api/uploads',
        contentType: item.file.type,
      });
      const result = await sendMetadata<{
        documentId: string;
        duplicate: boolean;
        deleted?: boolean;
      }>({ action: 'finalize', intentId: intent.intentId });
      update({
        state: result.deleted
          ? 'Duplicate — original removed by retention policy'
          : result.duplicate
            ? 'Duplicate recognized'
            : 'Original saved',
        documentId: result.deleted ? undefined : result.documentId,
      });
      await refresh();
    } catch (e: any) {
      update({ state: 'Failed', error: e.message });
    } finally {
      running.current.delete(item.id);
    }
  }
  async function addFiles(files: File[]) {
    const items = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      kind,
      state: 'Selected',
    }));
    setQueue((q) => [...q, ...items]);
    setMessage('');
    for (const item of items) await send(item);
    setMessage(
      'Batch processed. Check each file’s result below. Saved originals and extraction status are shown separately.',
    );
  }
  const docs = data.documents.filter(
    (d: any) =>
      nav.filters.metric !== 'pending' ||
      data.documentProgress?.[d.id]?.confirmed !==
        data.documentProgress?.[d.id]?.total ||
      data.documentProgress?.[d.id]?.total === 0,
  );
  return (
    <div className="uploads-workspace">
      <section
        className={'panel upload-dropzone ' + (dragging ? 'dragging' : '')}
        onDragOver={(e) => {
          if (canUpload) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (canUpload) void addFiles(Array.from(e.dataTransfer.files));
        }}
        aria-label="Upload register documents"
      >
        <div>
          <Upload size={26} />
          <h2>Add original registers and receipts</h2>
          <p>JPEG, PNG or PDF · up to 10 MB each · originals stay private</p>
          <p className="extraction-availability">
            {data.extractionAvailable
              ? 'Automated extraction is configured. Confirm its draft rows before they count as records.'
              : 'Automated extraction is not configured. Upload an original, then add and review rows manually.'}
          </p>
        </div>
        {canUpload && (
          <div className="upload-controls">
            <Field label="Document type">
              <Picker
                value={kind}
                onChange={setKind}
                label="Document type"
                options={[
                  { value: 'movement', label: 'Vehicle movement register' },
                  { value: 'driver', label: 'Driver logbook' },
                  { value: 'fuel', label: 'Fuel register' },
                  { value: 'receipt', label: 'Fuel receipt' },
                ]}
              />
            </Field>
            <Field label="Choose files or drop them here">
              <Input
                id="fleet-upload-input"
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  void addFiles(files);
                }}
              />
            </Field>
          </div>
        )}
      </section>
      {queue.length > 0 && (
        <section className="panel">
          <h2>Upload queue</h2>
          <p className="muted">
            Keep this page open while originals are uploading. Successfully
            saved files remain available below.
          </p>
          <div role="status" className="sr-only">
            {message}
          </div>
          {queue.map((item) => (
            <article className="upload-queue-row" key={item.id}>
              <FileText />
              <div>
                <strong>{item.file.name}</strong>
                <small>
                  {fmt(item.file.size / 1024)} KB · {item.kind}
                </small>
                {item.error && (
                  <p className="form-error" role="alert">
                    {item.error}
                  </p>
                )}
              </div>
              <Badge text={item.state} />
              {item.state === 'Failed' && (
                <Button variant="outline" onClick={() => void send(item)}>
                  <RotateCcw size={14} /> Retry file
                </Button>
              )}
              {item.documentId && (
                <a
                  className="text-link"
                  href={
                    '/api/fleet/document/' + encodeURIComponent(item.documentId)
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  View saved original
                </a>
              )}
            </article>
          ))}
          <p className="muted">{message}</p>
          <Button
            variant="ghost"
            disabled={uploadActive}
            onClick={() =>
              setQueue((q) => q.filter((x) => x.state === 'Failed'))
            }
          >
            Clear completed queue items
          </Button>
        </section>
      )}
      <section aria-label="Uploaded documents">
        <div className="section-heading">
          <h2>Uploaded documents</h2>
          <div className="saved-views">
            <Button
              variant={nav.filters.metric === 'pending' ? 'outline' : 'default'}
              onClick={() => nav.setFilters({})}
            >
              All documents
            </Button>
            <Button
              variant={nav.filters.metric === 'pending' ? 'default' : 'outline'}
              onClick={() => nav.setFilters({ metric: 'pending' })}
            >
              Pending review · {data.metrics.pending}
            </Button>
          </div>
        </div>
        {!docs.length && (
          <div className="panel empty-state">
            <FileText size={30} />
            <strong>
              {nav.filters.metric === 'pending'
                ? 'No documents awaiting review on this page'
                : 'No documents uploaded'}
            </strong>
            <p>
              {nav.filters.metric === 'pending'
                ? 'Choose All documents or another page to inspect saved originals.'
                : 'Choose a register image or PDF above. Its original will remain linked to every reviewed row.'}
            </p>
          </div>
        )}
        <div className="document-grid">
          {docs.map((doc: any) => {
            const dr = data.rows.filter((r: any) => r.documentId === doc.id);
            const progress = data.documentProgress?.[doc.id];
            const next =
              dr.find((r: any) => r.state !== 'Confirmed register entry') ??
              dr[0];
            return (
              <article className="panel document-card" key={doc.id}>
                <a
                  className="document-thumbnail"
                  href={'/api/fleet/document/' + encodeURIComponent(doc.id)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={'Open original ' + doc.name}
                >
                  {doc.mime.startsWith('image/') ? (
                    <img
                      loading="lazy"
                      src={'/api/fleet/document/' + encodeURIComponent(doc.id)}
                      alt={'Uploaded ' + doc.kind + ' document: ' + doc.name}
                    />
                  ) : (
                    <FileText size={38} />
                  )}
                </a>
                <div>
                  <h3>{doc.name}</h3>
                  <p className="muted">
                    {doc.kind} · {fmt(doc.size / 1024)} KB ·{' '}
                    {date(doc.createdAt)}
                  </p>
                  <Badge text={doc.status} />
                  <p>
                    {progress?.confirmed ?? 0} of {progress?.total ?? dr.length}{' '}
                    rows confirmed · {progress?.pageCount ?? 'Unknown'} pages
                  </p>
                  {doc.error && <p className="form-error">{doc.error}</p>}
                  <div className="document-actions">
                    {next && (
                      <Button onClick={() => nav.open('row', next.id)}>
                        Resume review <ArrowUpRight size={15} />
                      </Button>
                    )}
                    {canUpload && data.extractionAvailable && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              api(
                                (doc.status === 'extracting'
                                  ? 'poll/'
                                  : 'extract/') + encodeURIComponent(doc.id),
                                {},
                              ),
                            'Extraction status checked. Confirm the extracted rows before use.',
                          )
                        }
                      >
                        {doc.status === 'extracting'
                          ? 'Check extraction'
                          : 'Extract rows'}
                      </Button>
                    )}
                  </div>
                  <details>
                    <summary>Rows and source references ({dr.length})</summary>
                    {dr.map((r: any) => (
                      <button
                        className="row-link"
                        key={r.id}
                        onClick={() => nav.open('row', r.id)}
                      >
                        Page {r.page}, row {r.row} <Badge text={r.state} />
                      </button>
                    ))}
                  </details>
                  {canUpload && (
                    <details>
                      <summary>Add a row manually</summary>
                      <form
                        className="add-row-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void run(async () => {
                            const id = await api(
                              'draft/' + encodeURIComponent(doc.id),
                              {
                                page: Number(f.get('page')),
                                row: Number(f.get('row')),
                              },
                            );
                            await refresh();
                            nav.open('row', id);
                          }, 'Draft created. Copy only what the original supports.');
                        }}
                      >
                        <Field label="Page">
                          <Input
                            name="page"
                            type="number"
                            min={1}
                            defaultValue={1}
                            required
                          />
                        </Field>
                        <Field label="Row">
                          <Input
                            name="row"
                            type="number"
                            min={1}
                            defaultValue={dr.length + 1}
                            required
                          />
                        </Field>
                        <Button variant="outline" disabled={busy}>
                          Add draft row
                        </Button>
                      </form>
                    </details>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <Pager meta={data.pagination?.documents} nav={nav} />
      </section>
    </div>
  );
}
