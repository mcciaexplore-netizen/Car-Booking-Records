export const RULE_VERSION = 'fleet-2026-09-08.1';
export const PERMISSIONS = [
  'Matched prior approval',
  'Approval found, details differ',
  'No matching approval found',
  'Insufficient evidence',
  'Confirmed unauthorized after review',
  'Documented exception accepted',
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export type Role = 'Administrator' | 'Manager' | 'Register operator' | 'Viewer';
export type Kind =
  | 'vehicles'
  | 'employees'
  | 'drivers'
  | 'bookings'
  | 'approvals'
  | 'trips'
  | 'fuel'
  | 'maintenance';
export type Values = {
  registerDate: string | null;
  vehicleId: string | null;
  employee: string | null;
  employeeId: string | null;
  driver: string | null;
  driverId: string | null;
  department: string | null;
  bookingRef: string | null;
  destination: string | null;
  purpose: string | null;
  passengers: number | null;
  departure: string | null;
  returnAt: string | null;
  expectedReturn: string | null;
  startOdo: number | null;
  endOdo: number | null;
  litres: number | null;
  amount: number | null;
  payer: string | null;
  receiptRef: string | null;
  remarks: string | null;
  signaturePresent: boolean | null;
  fuelLevel: number | null;
  fuelLevelAt: string | null;
};
export const FIELDS: Record<keyof Values, string> = {
  registerDate: 'Register date',
  vehicleId: 'Vehicle registration',
  employee: 'Employee / requester',
  employeeId: 'Employee ID',
  driver: 'Driver',
  driverId: 'Driver ID',
  department: 'Department',
  bookingRef: 'Booking reference',
  destination: 'Destination',
  purpose: 'Purpose',
  passengers: 'Passengers',
  departure: 'Departure date and time',
  returnAt: 'Return date and time',
  expectedReturn: 'Expected return',
  startOdo: 'Starting odometer',
  endOdo: 'Ending odometer',
  litres: 'Fuel purchased (litres)',
  amount: 'Fuel amount (INR)',
  payer: 'Fuel paid by',
  receiptRef: 'Receipt reference',
  remarks: 'Remarks / damage',
  signaturePresent: 'Signature present',
  fuelLevel: 'Fuel level (%)',
  fuelLevelAt: 'Fuel level recorded at',
};
export const NUMBERS = [
  'passengers',
  'startOdo',
  'endOdo',
  'litres',
  'amount',
  'fuelLevel',
];
export const TIMES = ['departure', 'returnAt', 'expectedReturn', 'fuelLevelAt'];
export const blank = (): Values =>
  Object.fromEntries(Object.keys(FIELDS).map((k) => [k, null])) as Values;
export type Vehicle = {
  id: string;
  registration: string | null;
  name: string | null;
  capacity: number | null;
  fuelLevel: number | null;
  fuelLevelAt: string | null;
};
export type Booking = Values & {
  id: string;
  sourceId?: string;
  status: string | null;
};
export type Approval = {
  id: string;
  bookingRef: string | null;
  decision: string | null;
  decidedAt: string | null;
  approver: string | null;
};
export type Trip = Values & {
  id: string;
  source: 'register' | 'zoho' | 'both';
  confirmed: boolean;
  rowId?: string;
  documentId?: string;
  page?: number;
  row?: number;
  linkedSourceIds?: string[];
  permission?: Permission;
  tripStatus?: string;
  distance?: number | null;
  differences?: string[];
  bookingId?: string | null;
  candidateIds?: string[];
  evidenceHash?: string;
  originalPermission?: Permission;
};
export type Fuel = Values & { id: string; source: string; rowId?: string };
export type Decision = {
  id: string;
  tripId: string;
  action: string;
  bookingId: string | null;
  duplicateOf: string | null;
  reason: string;
  reviewer: string;
  createdAt: string;
  evidenceHash: string;
  originalResult: string;
};
export const normalize = (s: unknown) =>
  String(s ?? '')
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
export const registration = (s: unknown) =>
  normalize(s).replace(/[\s-]/g, '').toUpperCase();
export function validDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [year, month, day] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}
export function timestamp(s: unknown): number | null {
  if (
    typeof s !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(
      s,
    ) ||
    !validDate(s.slice(0, 10)) ||
    Number(s.slice(11, 13)) > 23 ||
    Number(s.slice(14, 16)) > 59
  )
    return null;
  const n = Date.parse(s);
  return Number.isFinite(n) ? n : null;
}
export function toUTC(s: string): string | null {
  const n = timestamp(s);
  return n === null ? null : new Date(n).toISOString();
}
export function validDistance(t: Values): number | null {
  return typeof t.startOdo === 'number' &&
    typeof t.endOdo === 'number' &&
    Number.isFinite(t.startOdo) &&
    Number.isFinite(t.endOdo) &&
    t.startOdo >= 0 &&
    t.endOdo >= t.startOdo &&
    timestamp(t.departure) !== null &&
    timestamp(t.returnAt) !== null &&
    timestamp(t.returnAt)! >= timestamp(t.departure)!
    ? t.endOdo - t.startOdo
    : null;
}
export function validateValues(input: unknown): {
  values: Values;
  flags: string[];
} {
  const x = (input && typeof input === 'object' ? input : {}) as Record<
      string,
      unknown
    >,
    v = blank(),
    flags: string[] = [];
  for (const k of Object.keys(FIELDS) as (keyof Values)[]) {
    const raw = x[k];
    if (raw === null || raw === undefined || raw === '') continue;
    if (NUMBERS.includes(k)) {
      if (
        typeof raw !== 'number' ||
        !Number.isFinite(raw) ||
        raw < 0 ||
        (k === 'passengers' && !Number.isInteger(raw)) ||
        (k === 'fuelLevel' && raw > 100)
      ) {
        flags.push(`${FIELDS[k]} is ambiguous or invalid`);
        continue;
      }
    } else if (TIMES.includes(k)) {
      if (timestamp(raw) === null) {
        flags.push(
          `${FIELDS[k]} needs an explicit date, time and timezone; never guess AM/PM`,
        );
        continue;
      }
    } else if (k === 'signaturePresent') {
      if (typeof raw !== 'boolean') {
        flags.push('Signature presence is uncertain');
        continue;
      }
    } else if (typeof raw !== 'string' || raw.length > 4000) {
      flags.push(`${FIELDS[k]} is invalid`);
      continue;
    }
    if (k === 'registerDate' && (typeof raw !== 'string' || !validDate(raw))) {
      flags.push('Register date needs a valid YYYY-MM-DD date');
      continue;
    }
    (v as any)[k] = TIMES.includes(k) ? toUTC(raw as string) : raw;
  }
  if (
    v.returnAt &&
    v.departure &&
    timestamp(v.returnAt)! < timestamp(v.departure)!
  )
    flags.push(
      'Return precedes departure. Supply an explicit overnight return date.',
    );
  if (v.startOdo !== null && v.endOdo !== null && v.endOdo < v.startOdo)
    flags.push('Ending odometer is below starting odometer.');
  return { values: v, flags };
}
export function tripStatus(t: Trip, now = Date.now()): string {
  const start = timestamp(t.departure),
    end = timestamp(t.returnAt),
    expected = timestamp(t.expectedReturn);
  if (
    !t.confirmed ||
    start === null ||
    start > now ||
    !t.vehicleId ||
    (t.returnAt && end === null) ||
    (end !== null && (end < start || end > now))
  )
    return 'Incomplete information';
  if (end !== null) return 'Returned';
  return expected !== null && now > expected ? 'Overdue' : 'In progress';
}
export type Rules = { earlyMinutes: number; lateMinutes: number };
export const DEFAULT_RULES: Rules = { earlyMinutes: 30, lateMinutes: 60 };
export function reconcile(
  t: Trip,
  bookings: Booking[],
  approvals: Approval[],
  vehicles: Vehicle[],
  rules = DEFAULT_RULES,
  selectedId?: string,
) {
  const differences: string[] = [];
  const dep = timestamp(t.departure);
  const byReference = t.bookingRef
    ? bookings.filter(
        (b) =>
          b.bookingRef === t.bookingRef ||
          b.sourceId === t.bookingRef ||
          b.id === t.bookingRef,
      )
    : [];
  const candidates = bookings
    .filter(
      (b) =>
        b.vehicleId &&
        registration(b.vehicleId) === registration(t.vehicleId) &&
        dep !== null &&
        timestamp(b.departure) !== null &&
        Math.abs(dep - timestamp(b.departure)!) <= 86400000,
    )
    .map((b) => ({
      b,
      score:
        Number(normalize(b.employee) === normalize(t.employee)) * 3 +
        Number(normalize(b.driver) === normalize(t.driver)) * 2 +
        Number(normalize(b.destination) === normalize(t.destination)) * 2 +
        similarity(b.employee, t.employee),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.b.id);
  const b = selectedId
    ? bookings.find((x) => x.id === selectedId)
    : byReference.length === 1
      ? byReference[0]
      : undefined;
  let permission: Permission = 'Insufficient evidence';
  if (!t.confirmed) differences.push('Extraction has not been confirmed.');
  else if (dep === null)
    differences.push('Departure timestamp is missing or ambiguous.');
  else if (!b) {
    permission =
      byReference.length > 1 || candidates.length
        ? 'Insufficient evidence'
        : 'No matching approval found';
    differences.push(
      byReference.length > 1
        ? 'Booking reference is not unique.'
        : candidates.length
          ? 'Candidate bookings require a human to confirm the link.'
          : 'No matching booking in the last successful import.',
    );
  } else {
    const refs = [b.id, b.bookingRef, b.sourceId].filter(Boolean);
    const events = approvals
      .filter((a) => refs.includes(a.bookingRef))
      .sort(
        (a, b) =>
          (timestamp(a.decidedAt) ?? Infinity) -
          (timestamp(b.decidedAt) ?? Infinity),
      );
    const prior = events.filter(
      (a) => timestamp(a.decidedAt) !== null && timestamp(a.decidedAt)! < dep,
    );
    const last = prior.at(-1);
    const atSameTime = last
      ? prior.filter((a) => a.decidedAt === last.decidedAt)
      : [];
    if (events.some((a) => timestamp(a.decidedAt) === null)) {
      differences.push('An approval-history event has no reliable timestamp.');
    } else if (
      !last ||
      normalize(last.decision) !== 'approved' ||
      atSameTime.some((a) => normalize(a.decision) !== 'approved')
    ) {
      permission = 'No matching approval found';
      differences.push(
        last
          ? `Last decision before departure: ${last.decision ?? 'unknown'}.`
          : 'No approval existed before departure; later approvals are not prior approval.',
      );
    } else {
      permission = 'Matched prior approval';
      const vehicle = vehicles.find(
        (v) =>
          registration(v.registration ?? v.id) === registration(t.vehicleId),
      );
      const required: [string, unknown, unknown][] = [
        ['Vehicle', t.vehicleId, b.vehicleId],
        ['Employee', t.employeeId ?? t.employee, b.employeeId ?? b.employee],
        ['Driver', t.driverId ?? t.driver, b.driverId ?? b.driver],
      ];
      let missing = false;
      for (const [label, actual, allowed] of required) {
        if (!actual || !allowed) {
          differences.push(`${label} is missing in the trip or booking.`);
          missing = true;
        } else if (
          label === 'Vehicle'
            ? registration(actual) !== registration(allowed)
            : normalize(actual) !== normalize(allowed)
        )
          differences.push(`${label} differs from booking.`);
      }
      if (timestamp(b.departure) === null) {
        missing = true;
        differences.push('Booked departure is missing.');
      } else {
        const delta = (dep - timestamp(b.departure)!) / 60000;
        if (delta < -rules.earlyMinutes || delta > rules.lateMinutes)
          differences.push('Departure falls outside the configured tolerance.');
      }
      if (
        timestamp(b.expectedReturn) !== null &&
        dep >= timestamp(b.expectedReturn)!
      )
        differences.push('Departure is after the approved booking window.');
      if (
        t.passengers === null ||
        b.passengers === null ||
        vehicle?.capacity == null
      ) {
        missing = true;
        differences.push('Passenger or vehicle-capacity evidence is missing.');
      } else if (t.passengers > b.passengers || t.passengers > vehicle.capacity)
        differences.push('Passenger count exceeds approval or capacity.');
      if (
        t.destination &&
        b.destination &&
        normalize(t.destination) !== normalize(b.destination)
      )
        differences.push('Destination differs from booking.');
      if (differences.length)
        permission = missing
          ? 'Insufficient evidence'
          : 'Approval found, details differ';
    }
  }
  return {
    permission: permission as Permission,
    differences,
    bookingId: b?.id ?? null,
    candidateIds: candidates,
    approvalEvents: b
      ? approvals.filter((a) =>
          [b.id, b.bookingRef, b.sourceId].includes(a.bookingRef),
        )
      : [],
  };
}
// Suggestions only: this score never creates a permission classification.
export function similarity(a: unknown, b: unknown) {
  const x = normalize(a),
    y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) =>
    new Set(
      Array.from({ length: Math.max(0, s.length - 1) }, (_, i) =>
        s.slice(i, i + 2),
      ),
    );
  const p = grams(x),
    q = grams(y);
  return (2 * [...p].filter((v) => q.has(v)).length) / (p.size + q.size || 1);
}
export function exactSameTrip(a: Trip, b: Trip) {
  return (
    !!a.vehicleId &&
    !!b.vehicleId &&
    registration(a.vehicleId) === registration(b.vehicleId) &&
    !!a.bookingRef &&
    a.bookingRef === b.bookingRef &&
    timestamp(a.departure) !== null &&
    timestamp(a.departure) === timestamp(b.departure) &&
    a.startOdo !== null &&
    a.startOdo === b.startOdo &&
    normalize(a.employee) === normalize(b.employee) &&
    normalize(a.driver) === normalize(b.driver) &&
    (!a.returnAt || !b.returnAt || a.returnAt === b.returnAt) &&
    (a.endOdo === null || b.endOdo === null || a.endOdo === b.endOdo)
  );
}
export function deduplicateTrips(rows: Trip[], decisions: Decision[] = []) {
  const result: Trip[] = [];
  const current = latestDecisions(decisions);
  for (const t of [...rows].sort(
    (a, b) => Number(b.source === 'register') - Number(a.source === 'register'),
  )) {
    const d = current.get(t.id);
    if (
      d?.action === 'duplicate' &&
      d.duplicateOf &&
      rows.some((x) => x.id === d.duplicateOf) &&
      d.duplicateOf !== t.id
    )
      continue;
    const target = result.find(
      (x) => x.source !== t.source && exactSameTrip(x, t),
    );
    if (target) {
      target.source = 'both';
      target.linkedSourceIds = [...(target.linkedSourceIds ?? []), t.id];
      target.returnAt ??= t.returnAt;
      target.endOdo ??= t.endOdo;
    } else result.push({ ...t });
  }
  return result;
}
export function latestDecisions(ds: Decision[]) {
  const m = new Map<string, Decision>();
  for (const d of [...ds].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  ))
    m.set(d.tripId, d);
  return m;
}
export function filterRecords<T extends Record<string, any>>(
  rows: T[],
  p: URLSearchParams,
  dateBasis: 'journey' | 'purchase' = 'journey',
): T[] {
  return rows.filter((r) => {
    const recordedDate = r.registerDate
      ? `${r.registerDate}T00:00:00+05:30`
      : null;
    const dateValue =
      dateBasis === 'purchase'
        ? (recordedDate ?? r.departure)
        : (r.departure ?? recordedDate);
    const ms = timestamp(dateValue);
    if (
      p.get('from') &&
      (ms === null || ms < Date.parse(`${p.get('from')}T00:00:00+05:30`))
    )
      return false;
    if (
      p.get('to') &&
      (ms === null ||
        ms >= Date.parse(`${p.get('to')}T00:00:00+05:30`) + 86400000)
    )
      return false;
    for (const key of [
      'vehicleId',
      'employee',
      'employeeId',
      'driver',
      'driverId',
      'department',
      'destination',
      'permission',
    ])
      if (
        p.get(key) &&
        (p.get(key) === '__unknown'
          ? !!r[key]
          : normalize(r[key]) !== normalize(p.get(key)))
      )
        return false;
    if (
      p.get('outcome') &&
      normalize(r.permission) !== normalize(p.get('outcome'))
    )
      return false;
    if (p.get('source') && r.source !== p.get('source') && r.source !== 'both')
      return false;
    if (
      p.get('q') &&
      !normalize(JSON.stringify(r)).includes(normalize(p.get('q')))
    )
      return false;
    if (
      p.get('metric') === 'review' &&
      !PERMISSIONS.slice(1, 4).includes(r.permission)
    )
      return false;
    if (
      p.get('metric') === 'open' &&
      !['In progress', 'Overdue'].includes(r.tripStatus)
    )
      return false;
    if (p.get('metric') === 'distance' && r.distance == null) return false;
    if (p.get('metric') === 'distance-missing' && r.distance != null)
      return false;
    if (p.get('metric') === 'overdue' && r.tripStatus !== 'Overdue')
      return false;
    if (
      p.get('metric') === 'missing' &&
      r.returnAt &&
      r.startOdo != null &&
      r.endOdo != null
    )
      return false;
    if (p.get('metric') === 'fuel-quantity-missing' && r.litres != null)
      return false;
    if (p.get('metric') === 'fuel-amount-missing' && r.amount != null)
      return false;
    const issue = p.get('issue');
    if (issue === 'return' && r.returnAt) return false;
    if (
      issue === 'odometer' &&
      r.startOdo != null &&
      r.endOdo != null &&
      r.endOdo >= r.startOdo
    )
      return false;
    if (issue === 'time' && timestamp(r.departure) !== null) return false;
    if (issue === 'approval' && !PERMISSIONS.slice(2, 4).includes(r.permission))
      return false;
    if (
      issue === 'conflict' &&
      r.permission !== PERMISSIONS[1] &&
      !r.differences?.some((x: string) =>
        /differs|exceeds|changed since/i.test(x),
      )
    )
      return false;
    return true;
  });
}
export function metrics(trips: Trip[], fuel: Fuel[], pending: number) {
  const valid = trips.filter(
    (t) => t.distance !== null && t.distance !== undefined,
  );
  return {
    trips: trips.length,
    matched: trips.filter((t) => t.permission === PERMISSIONS[0]).length,
    review: trips.filter((t) =>
      PERMISSIONS.slice(1, 4).includes(t.permission as any),
    ).length,
    unauthorized: trips.filter((t) => t.permission === PERMISSIONS[4]).length,
    distance: valid.length ? valid.reduce((s, t) => s + t.distance!, 0) : null,
    distanceExcluded: trips.length - valid.length,
    litres: sumKnown(fuel, 'litres'),
    spend: sumKnown(fuel, 'amount'),
    fuelQuantityExcluded: fuel.filter((f) => f.litres === null).length,
    fuelAmountExcluded: fuel.filter((f) => f.amount === null).length,
    open: trips.filter((t) =>
      ['In progress', 'Overdue'].includes(t.tripStatus ?? ''),
    ).length,
    pending,
    kmPerLitre: null,
  };
}
function sumKnown(rows: Fuel[], key: 'litres' | 'amount') {
  const values = rows
    .map((r) => r[key])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return values.length ? values.reduce((a, b) => a + b, 0) : null;
}
export function csv(
  rows: Record<string, unknown>[],
  keys = Object.keys(rows[0] ?? {}),
) {
  const cell = (v: unknown) => {
    let s =
      typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
    if (/^\s*[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return [
    keys.map(cell).join(','),
    ...rows.map((r) => keys.map((k) => cell(r[k])).join(',')),
  ].join('\r\n');
}
export function odometerIssues(trips: Trip[]) {
  const issues: { tripId: string; message: string }[] = [];
  const last = new Map<string, Trip>();
  for (const t of [...trips].sort(
    (a, b) => (timestamp(a.departure) ?? 0) - (timestamp(b.departure) ?? 0),
  )) {
    const prev = last.get(registration(t.vehicleId));
    if (t.startOdo !== null && t.endOdo !== null && t.endOdo < t.startOdo)
      issues.push({
        tripId: t.id,
        message: 'Odometer decreases within this trip.',
      });
    if (
      prev?.endOdo != null &&
      t.startOdo !== null &&
      prev.endOdo !== t.startOdo
    )
      issues.push({
        tripId: t.id,
        message: `Odometer difference from previous return: ${t.startOdo - prev.endOdo} km. Investigate the recording gap.`,
      });
    if (t.vehicleId) last.set(registration(t.vehicleId), t);
  }
  return issues;
}
