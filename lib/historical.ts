import input from './sample-records.json';
import {
  reconcile,
  type SampleInput,
  type SourceRow,
  type TripReview,
} from './reconcile';
export function historicalRows(p: URLSearchParams) {
  const records = reconcile(input as unknown as SampleInput),
    view = p.get('view') ?? 'Overview';
  const match = (r: SourceRow) =>
    !(p.get('from') && p.get('to') && p.get('from')! > p.get('to')!) &&
    (!p.get('vehicle') ||
      p.get('vehicle') === 'All' ||
      r.vehicle === p.get('vehicle')) &&
    (!p.get('from') ||
      (typeof r.dateISO === 'string' && r.dateISO >= p.get('from')!)) &&
    (!p.get('to') ||
      (typeof r.dateISO === 'string' && r.dateISO <= p.get('to')!)) &&
    (!p.get('query') ||
      JSON.stringify(r).toLowerCase().includes(p.get('query')!.toLowerCase()));
  const actual = records.actual.filter(
    (r) =>
      match(r) &&
      (!p.get('outcome') ||
        p.get('outcome') === 'All' ||
        r.outcome === p.get('outcome')),
  );
  const rows =
    view === 'Zoho bookings'
      ? records.zoho.filter(match)
      : view === 'Image bookings'
        ? records.imageBookings.filter(match)
        : view === 'Data quality'
          ? actual.filter((r) => r.issues.length > 0)
          : actual;
  return rows.map((r) => ({
    reference: r.id,
    source: r.source,
    sheet: r.sheet,
    row: r.row,
    vehicle: r.vehicle ?? null,
    employee: r.employee ?? null,
    date: r.dateISO ?? null,
    original_date: r.date ?? null,
    driver: r.driver ?? null,
    destination: r.destination ?? null,
    ...('outcome' in r
      ? {
          candidate_result: r.outcome,
          permission: 'Prior approval not evidenced',
          odometer_km: r.distance ?? null,
          reported_km: r.reportedKm ?? null,
          candidate_zoho_rows: (r as TripReview).candidates
            .map((c) => c.id + ' (' + c.basis + ')')
            .join('; '),
          issues: (r as TripReview).issues.join('; '),
        }
      : { source_status: r.status ?? null }),
  }));
}
