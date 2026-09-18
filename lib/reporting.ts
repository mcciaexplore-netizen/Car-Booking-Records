import { PERMISSIONS, timestamp, type Trip, type Fuel } from './domain';

export const METRIC_LABELS: Record<string, string> = {
  review: 'Trips requiring review',
  pending: 'Pending image reviews',
  open: 'Open trips',
  overdue: 'Overdue trips',
  distance: 'Valid recorded distance',
  'distance-missing': 'Missing or invalid distance',
  missing: 'Missing return or odometer',
  'no-usage': 'No recorded usage',
  'fuel-quantity-missing': 'Missing fuel quantities',
  'fuel-amount-missing': 'Missing fuel amounts',
};
export const ISSUE_LABELS: Record<string, string> = {
  return: 'Missing return',
  odometer: 'Missing or invalid odometer',
  time: 'Missing or ambiguous departure',
  approval: 'Missing approval evidence',
  conflict: 'Conflicting details',
};
export function tripIssues(t: Trip) {
  return [
    !t.returnAt && 'return',
    (t.startOdo == null || t.endOdo == null || t.endOdo < t.startOdo) &&
      'odometer',
    timestamp(t.departure) === null && 'time',
    (t.permission === PERMISSIONS[2] || t.permission === PERMISSIONS[3]) &&
      'approval',
    (t.permission === PERMISSIONS[1] ||
      t.differences?.some((x) => /differs|exceeds|changed since/i.test(x))) &&
      'conflict',
  ].filter(Boolean) as string[];
}
export function periodKey(value: string | null | undefined, monthly = false) {
  if (!value) return 'Unknown date';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value))
    return value.slice(0, monthly ? 7 : 10);
  if (timestamp(value) === null) return 'Unknown date';
  return new Date(value)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    .slice(0, monthly ? 7 : 10);
}
export function sortedRecords<T extends Record<string, unknown>>(
  rows: T[],
  key = 'date',
  direction = 'desc',
  dateBasis: 'journey' | 'purchase' = 'journey',
) {
  const field = (r: T) =>
    key === 'date'
      ? dateBasis === 'purchase'
        ? (r.registerDate ?? r.departure ?? r.createdAt ?? null)
        : (r.departure ?? r.registerDate ?? r.createdAt ?? null)
      : r[key];
  const scalar = (value: unknown) =>
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
      ? String(value)
      : '';
  return [...rows].sort((a, b) => {
    const x = field(a),
      y = field(b);
    if (x == null || x === '')
      return y == null || y === ''
        ? scalar(a.id).localeCompare(scalar(b.id))
        : 1;
    if (y == null || y === '') return -1;
    const n =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : scalar(x).localeCompare(scalar(y), 'en', { numeric: true });
    return (
      (direction === 'asc' ? n : -n) || scalar(a.id).localeCompare(scalar(b.id))
    );
  });
}
export function pageRecords<T>(rows: T[], requested = 1, size = 20) {
  const pageSize = [10, 20, 50].includes(size) ? size : 20;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.max(1, Math.min(pages, Math.floor(requested) || 1));
  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
    pages,
  };
}
export function groupedTrips(
  trips: Trip[],
  key: 'vehicleId' | 'employee' | 'department' | 'day' | 'month',
) {
  const groups = new Map<
    string,
    { key: string; count: number; distance: number | null; excluded: number }
  >();
  for (const t of trips) {
    const value =
      key === 'day' || key === 'month'
        ? periodKey(t.departure ?? t.registerDate, key === 'month')
        : String(t[key] || '__unknown');
    const g = groups.get(value) ?? {
      key: value,
      count: 0,
      distance: null,
      excluded: 0,
    };
    g.count++;
    if (t.distance == null) g.excluded++;
    else g.distance = (g.distance ?? 0) + t.distance;
    groups.set(value, g);
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key),
  );
}
export function summarize(s: { trips: Trip[]; fuel: Fuel[] }) {
  const fuelMonths = new Map<
    string,
    {
      key: string;
      litres: number | null;
      amount: number | null;
      quantityMissing: number;
      amountMissing: number;
      count: number;
    }
  >();
  for (const f of s.fuel) {
    const key = periodKey(f.registerDate ?? f.departure, true);
    const g = fuelMonths.get(key) ?? {
      key,
      litres: null,
      amount: null,
      quantityMissing: 0,
      amountMissing: 0,
      count: 0,
    };
    g.count++;
    if (f.litres == null) g.quantityMissing++;
    else g.litres = (g.litres ?? 0) + f.litres;
    if (f.amount == null) g.amountMissing++;
    else g.amount = (g.amount ?? 0) + f.amount;
    fuelMonths.set(key, g);
  }
  return {
    vehicle: groupedTrips(s.trips, 'vehicleId'),
    employee: groupedTrips(s.trips, 'employee'),
    department: groupedTrips(s.trips, 'department'),
    daily: groupedTrips(s.trips, 'day').sort((a, b) =>
      b.key.localeCompare(a.key),
    ),
    monthly: groupedTrips(s.trips, 'month').sort((a, b) =>
      b.key.localeCompare(a.key),
    ),
    fuelMonths: [...fuelMonths.values()].sort((a, b) =>
      a.key.localeCompare(b.key),
    ),
    fuelVehicles: [
      ...new Set(s.fuel.map((f) => f.vehicleId ?? '__unknown')),
    ].map((key) => ({
      key,
      litres: s.fuel
        .filter((f) => (f.vehicleId ?? '__unknown') === key)
        .reduce(
          (n: number | null, f: Fuel) =>
            f.litres == null ? n : (n ?? 0) + f.litres,
          null,
        ),
      amount: s.fuel
        .filter((f) => (f.vehicleId ?? '__unknown') === key)
        .reduce(
          (n: number | null, f: Fuel) =>
            f.amount == null ? n : (n ?? 0) + f.amount,
          null,
        ),
    })),
    permission: PERMISSIONS.map((key) => ({
      key,
      count: s.trips.filter((t: Trip) => t.permission === key).length,
    })),
    issues: Object.keys(ISSUE_LABELS).map((key) => ({
      key,
      count: s.trips.filter((t: Trip) => tripIssues(t).includes(key)).length,
    })),
    overdue: s.trips.filter((t: Trip) => t.tripStatus === 'Overdue').length,
    missing: s.trips.filter(
      (t: Trip) => !t.returnAt || t.startOdo == null || t.endOdo == null,
    ).length,
  };
}
