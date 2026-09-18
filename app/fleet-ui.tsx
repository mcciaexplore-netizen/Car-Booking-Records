'use client';
import type { ReactNode } from 'react';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import { ClipboardList, SearchX } from 'lucide-react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
export const fmt = (v: number | null | undefined, d = 0) =>
  v == null
    ? '—'
    : new Intl.NumberFormat('en-IN', { maximumFractionDigits: d }).format(v);
export const money = (v: number | null | undefined) =>
  v == null
    ? '—'
    : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(v);
export const date = (v: string | null | undefined) =>
  v
    ? new Date(v.length === 10 ? v + 'T00:00:00+05:30' : v).toLocaleString(
        'en-IN',
        {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          ...(v.length > 10 ? { hour: '2-digit', minute: '2-digit' } : {}),
        },
      )
    : 'Unknown';
export const display = (v: any) =>
  v === null || v === undefined || v === '' ? 'Unknown' : String(v);
export const localTime = (v: string | null) =>
  v
    ? new Date(v)
        .toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata' })
        .replace(' ', 'T')
        .slice(0, 16)
    : '';
export function Badge({ text }: { text: string }) {
  return (
    <span
      className={
        'badge ' +
        (text === 'Matched prior approval' ||
        text === 'Confirmed register entry'
          ? 'green'
          : text === 'Confirmed unauthorized after review'
            ? 'red'
            : text === 'Documented exception accepted'
              ? 'blue'
              : /Incomplete|Insufficient|correction|review|differ|No matching|Overdue|draft/i.test(
                    text,
                  )
                ? 'amber'
                : 'neutral')
      }
    >
      {text}
    </span>
  );
}
export function SearchPicker({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  const items = options.map((o) => ({
    value: o.value || '__all',
    label: o.label,
  }));
  const selected = items.find((o) => o.value === (value || '__all')) ?? null;
  return (
    <Combobox
      items={items}
      value={selected}
      onValueChange={(v) => onChange(!v || v.value === '__all' ? '' : v.value)}
      itemToStringLabel={(o) => o.label}
      isItemEqualToValue={(a, b) => a.value === b.value}
    >
      <ComboboxInput aria-label={label} placeholder={label} showClear />
      <ComboboxContent className="fleet-overlay">
        <ComboboxEmpty>No matching options</ComboboxEmpty>
        <ComboboxList>
          {(item: { value: string; label: string }) => (
            <ComboboxItem key={item.value} value={item}>
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
export function Picker({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select
      items={options.map((o) => ({
        value: o.value || '__all',
        label: o.label,
      }))}
      value={value || '__all'}
      onValueChange={(v) => onChange(v === '__all' ? '' : (v ?? ''))}
    >
      <SelectTrigger aria-label={label} className="w-full min-h-10">
        <SelectValue>
          {options.find((o) => o.value === value)?.label ?? label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || '__all'} value={o.value || '__all'}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function DataTable({
  headers,
  empty,
  children,
  filtered = false,
  emptyTitle = 'Your records will appear here',
  emptyDescription = 'Import your Zoho reports or confirm an uploaded register to get started.',
}: {
  headers: string[];
  empty: boolean;
  children: ReactNode;
  filtered?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return (
    <Table className={empty ? 'table-empty' : undefined}>
      <TableHeader>
        <TableRow>
          {headers.map((h) => (
            <TableHead key={h}>{h}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {empty ? (
          <TableRow>
            <TableCell colSpan={headers.length}>
              <div className="empty-state">
                <span className="empty-icon">
                  {filtered ? (
                    <SearchX size={24} />
                  ) : (
                    <ClipboardList size={24} />
                  )}
                </span>
                <strong>{filtered ? 'No matching records' : emptyTitle}</strong>
                <span>
                  {filtered
                    ? 'Try a wider date range or clear the filters to see more records.'
                    : emptyDescription}
                </span>
              </div>
            </TableCell>
          </TableRow>
        ) : (
          children
        )}
      </TableBody>
    </Table>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field-label">
      {label}
      {children}
    </label>
  );
}
export async function api(path: string, body?: unknown, signal?: AbortSignal) {
  const r = await fetch('/api/fleet/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal,
    cache: 'no-store',
  });
  const result: any = await r.json();
  if (!r.ok)
    throw Object.assign(
      new Error(result.error ?? 'The request could not be completed.'),
      { status: r.status },
    );
  return result;
}
