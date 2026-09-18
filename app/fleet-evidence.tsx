'use client';
import { useState, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize,
  ExternalLink,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { date, display, Badge } from './fleet-ui';
import { FIELDS, timestamp, type Trip, type Booking } from '@/lib/domain';
import { rowPolygons } from '@/lib/evidence-view';

export function DocumentViewer({ document, page = 1, row, original }: any) {
  const [zoom, setZoom] = useState(100),
    [rotation, setRotation] = useState(0),
    [currentPage, setPage] = useState(page),
    [ratio, setRatio] = useState(1);
  useEffect(() => {
    setPage(page);
    setZoom(100);
    setRotation(0);
  }, [document?.id, page]);
  if (!document)
    return (
      <div className="empty-state">
        <FileText />
        <strong>No uploaded original linked</strong>
        <p>The source record and its history remain available below.</p>
      </div>
    );
  const url = '/api/fleet/document/' + encodeURIComponent(document.id),
    pdf = document.mime === 'application/pdf';
  const polygons = rowPolygons(original, currentPage),
    turned = rotation === 90 || rotation === 270;
  const transform =
    rotation === 90
      ? 'rotate(90deg)'
      : rotation === 180
        ? 'rotate(180deg)'
        : rotation === 270
          ? 'rotate(270deg)'
          : 'none';
  return (
    <section className="document-viewer" aria-label="Original document viewer">
      <div className="viewer-toolbar">
        <Button
          variant="outline"
          aria-label="Zoom out"
          disabled={zoom <= 50}
          onClick={() => setZoom((v) => Math.max(50, v - 25))}
        >
          <ZoomOut size={16} />
        </Button>
        <output aria-live="polite">{zoom}%</output>
        <Button
          variant="outline"
          aria-label="Zoom in"
          disabled={zoom >= 300}
          onClick={() => setZoom((v) => Math.min(300, v + 25))}
        >
          <ZoomIn size={16} />
        </Button>
        <Button
          variant="outline"
          aria-label="Fit original to width"
          onClick={() => {
            setZoom(100);
            setRotation(0);
          }}
        >
          <Maximize size={16} />
        </Button>
        {!pdf && (
          <Button
            variant="outline"
            aria-label="Rotate image clockwise"
            onClick={() => setRotation((v) => (v + 90) % 360)}
          >
            <RotateCw size={16} />
          </Button>
        )}
        <a className="text-link" href={url} target="_blank" rel="noreferrer">
          Original <ExternalLink size={14} />
        </a>
      </div>
      {pdf && (
        <label className="viewer-page">
          PDF page{' '}
          <Input
            type="number"
            min={1}
            value={currentPage}
            onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))}
          />
          <span>Use the PDF toolbar to rotate or search.</span>
        </label>
      )}
      <div className="document-canvas">
        {pdf ? (
          <iframe
            key={currentPage + ':' + zoom}
            title={`Original PDF: ${document.name}`}
            src={url + '#page=' + currentPage + '&zoom=' + zoom}
          />
        ) : (
          <div
            className="image-footprint"
            style={{
              width: zoom + '%',
              aspectRatio: String(turned ? 1 / ratio : ratio),
            }}
          >
            <div
              className="image-surface"
              style={{
                width: turned ? 100 / ratio + '%' : '100%',
                transformOrigin: 'top left',
                transform,
                left: rotation === 90 || rotation === 180 ? '100%' : 0,
                top: rotation === 180 || rotation === 270 ? '100%' : 0,
              }}
            >
              <img
                src={url}
                alt={'Original ' + document.kind + ': ' + document.name}
                onLoad={(e) =>
                  setRatio(
                    e.currentTarget.naturalWidth /
                      e.currentTarget.naturalHeight,
                  )
                }
              />
              {polygons.length > 0 && (
                <svg
                  className="row-highlight"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-label="Source cell locations"
                >
                  <title>Source cell locations for this row</title>
                  {polygons.map((points: string, i: number) => (
                    <polygon key={i} points={points} />
                  ))}
                </svg>
              )}
            </div>
          </div>
        )}
      </div>
      <p className="viewer-reference">
        {document.name} · page {currentPage}
        {row ? ' · row ' + row : ''}.{' '}
        {pdf
          ? 'PDF navigation depends on your browser viewer. Use the page and row reference.'
          : polygons.length
            ? 'Highlighted cells use the extractor’s source coordinates.'
            : 'Row coordinates are unavailable; use the page and row reference.'}{' '}
        View controls never alter the original.
      </p>
    </section>
  );
}
const parse = (x: any) => {
  try {
    return typeof x === 'string' ? JSON.parse(x) : x;
  } catch {
    return x;
  }
};
export function ChangeHistory({ history }: any) {
  if (history?.error)
    return (
      <p className="form-error" role="alert">
        History could not be retrieved: {history.error}
      </p>
    );
  if (!history)
    return <p className="muted">History is loading or unavailable.</p>;
  const events = [
    ...(history.changes ?? []).map((x: any) => ({
      ...x,
      type: 'Correction / change',
    })),
    ...(history.decisions ?? []).map((x: any) => ({
      ...x,
      type: 'Review decision',
    })),
  ].sort((a, b) =>
    String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
  );
  return (
    <section className="history-panel">
      <h3>Change and decision history</h3>
      {!events.length && (
        <p className="muted">No recorded changes or review decisions.</p>
      )}
      <ol className="evidence-timeline">
        {events.map((e: any) => {
          const beforeRaw = parse(e.before),
            afterRaw = parse(e.after);
          const before = beforeRaw?.corrected
              ? { ...parse(beforeRaw.corrected), state: beforeRaw.state }
              : beforeRaw?.values
                ? { ...beforeRaw.values, state: beforeRaw.state }
                : beforeRaw,
            after = afterRaw?.values
              ? { ...afterRaw.values, state: afterRaw.state }
              : afterRaw;
          return (
            <li key={e.type + e.id}>
              <div>
                <strong>{e.action ?? e.type}</strong>
                <time>{date(e.createdAt)}</time>
              </div>
              <p>{e.actor ?? e.reviewer ?? 'Actor not recorded'}</p>
              {e.reason && <p>{e.reason}</p>}
              {e.originalResult && (
                <p>
                  Original classification:{' '}
                  {parse(e.originalResult)?.permission ?? 'Not recorded'}
                </p>
              )}
              {e.originalResult && (
                <details>
                  <summary>Original classification</summary>
                  <pre>{JSON.stringify(parse(e.originalResult), null, 2)}</pre>
                </details>
              )}
              {after && typeof after === 'object' && (
                <dl>
                  {Object.keys(after)
                    .filter(
                      (k) =>
                        JSON.stringify(before?.[k]) !==
                        JSON.stringify(after[k]),
                    )
                    .map((k) => (
                      <div key={k}>
                        <dt>{(FIELDS as any)[k] ?? k}</dt>
                        <dd>
                          {typeof after[k] === 'object'
                            ? JSON.stringify(after[k])
                            : display(before?.[k]) + ' → ' + display(after[k])}
                        </dd>
                      </div>
                    ))}
                </dl>
              )}
            </li>
          );
        })}
      </ol>
      <details>
        <summary>Matching-rule and source history</summary>
        {history.reconciliations?.map((r: any) => (
          <p key={r.id}>
            {date(r.createdAt)} · Rule {r.ruleVersion}
          </p>
        ))}
        <pre className="json-view">{JSON.stringify(history, null, 2)}</pre>
      </details>
    </section>
  );
}
export function ApprovalTimeline({ approvals = [], trip }: any) {
  const events = [
    ...approvals.map((a: any) => ({
      id: a.id,
      title: a.decision ?? 'Unknown decision',
      at: a.decidedAt,
      detail: a.approver ?? 'Approver not recorded',
      late:
        a.decision === 'approved' &&
        timestamp(a.decidedAt) !== null &&
        timestamp(trip?.departure) !== null &&
        timestamp(a.decidedAt)! >= timestamp(trip.departure)!,
    })),
    ...(trip
      ? [
          { id: 'departure', title: 'Recorded departure', at: trip.departure },
          { id: 'return', title: 'Recorded return', at: trip.returnAt },
        ]
      : []),
  ];
  const known = events
    .filter((e) => timestamp(e.at) !== null)
    .sort((a, b) => timestamp(a.at)! - timestamp(b.at)!);
  const unknown = events.filter((e) => timestamp(e.at) === null);
  return (
    <section>
      <h3>Evidence timeline · IST</h3>
      {!approvals.length && (
        <p className="flag">No approval history supplied for this booking.</p>
      )}
      <ol className="evidence-timeline">
        {known.map((e) => (
          <li key={e.id}>
            <div>
              <strong>{e.title}</strong>
              <time>{date(e.at)}</time>
            </div>
            {e.detail && <p>{e.detail}</p>}
            {e.late && (
              <Badge text="At or after departure — not prior approval" />
            )}
          </li>
        ))}
      </ol>
      {unknown.length > 0 && (
        <div className="undated-events">
          <h4>Timestamp not recorded</h4>
          {unknown.map((e) => (
            <p key={e.id}>
              {e.title}
              {e.detail ? ' · ' + e.detail : ''}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
export function EvidenceComparison({
  trip,
  booking,
}: {
  trip: Trip;
  booking?: Booking;
}) {
  const fields = [
    'vehicleId',
    'employee',
    'driver',
    'departure',
    'expectedReturn',
    'destination',
    'passengers',
  ] as const;
  return (
    <div className="comparison-table">
      <table aria-label="Register and booking comparison">
        <thead>
          <tr className="comparison-head">
            <th scope="col">Field</th>
            <th scope="col">Register</th>
            <th scope="col">Booking</th>
            <th scope="col">Observation</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((k) => {
            const a = trip[k],
              b = booking?.[k],
              missing = a == null || b == null;
            const time = ['departure', 'expectedReturn'].includes(k);
            return (
              <tr className="comparison-row" key={k}>
                <th scope="row">{FIELDS[k]}</th>
                <td data-label="Register">
                  {time ? date(a as string | null) : display(a)}
                </td>
                <td data-label="Booking">
                  {time ? date(b as string | null) : display(b)}
                </td>
                <td data-label="Observation">
                  {missing
                    ? 'Evidence missing'
                    : String(a) === String(b)
                      ? 'Same recorded value'
                      : 'Values differ — review rules'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        Value comparisons explain the evidence. Permission is determined
        separately by the server’s approval, timing, identity and capacity
        rules.
      </p>
    </div>
  );
}
