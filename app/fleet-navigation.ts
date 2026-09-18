'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const KEYS = [
  'from',
  'to',
  'vehicleId',
  'employee',
  'employeeId',
  'driver',
  'driverId',
  'department',
  'destination',
  'permission',
  'outcome',
  'source',
  'q',
  'metric',
  'issue',
];
export function useFleetNavigation(
  views: readonly string[],
  fallback = 'Overview',
) {
  const router = useRouter(),
    path = usePathname(),
    search = useSearchParams();
  const current = search.toString();
  const pending = useRef(current);
  const returnUrl = useRef<string | null>(null);
  const scroll = useRef(new Map<string, number>());
  const opener = useRef<HTMLElement | null>(null);
  const wasDetail = useRef(!!search.get('detail'));
  useEffect(() => {
    const detail = !!search.get('detail');
    if (wasDetail.current && !detail)
      requestAnimationFrame(() =>
        opener.current?.isConnected
          ? opener.current.focus({ preventScroll: true })
          : document
              .getElementById('fleet-main')
              ?.focus({ preventScroll: true }),
      );
    wasDetail.current = detail;
  }, [search]);
  useEffect(() => {
    pending.current = current;
  }, [current]);
  const write = useCallback(
    (changes: Record<string, string | null>, replace = false) => {
      const p = new URLSearchParams(pending.current);
      scroll.current.set(pending.current, window.scrollY);
      Object.entries(changes).forEach(([k, v]) =>
        v ? p.set(k, v) : p.delete(k),
      );
      pending.current = p.toString();
      router[replace ? 'replace' : 'push'](path + (p.size ? '?' + p : ''), {
        scroll: false,
      });
    },
    [router, path],
  );
  const view = views.includes(search.get('view') ?? '')
    ? search.get('view')!
    : fallback;
  const filters = Object.fromEntries(
    KEYS.filter((k) => search.get(k)).map((k) => [k, search.get(k)!]),
  );
  const setView = useCallback(
    (v: string) => {
      write({
        view: v === fallback ? null : v,
        page: null,
        detail: null,
        id: null,
        layout: null,
        metric: null,
        issue: null,
        outcome: null,
        ...(!['Overview', 'Trip register', 'Permission review'].includes(v)
          ? { permission: null }
          : {}),
      });
      requestAnimationFrame(() => {
        window.scrollTo(0, 0);
        document.getElementById('fleet-main')?.focus({ preventScroll: true });
      });
    },
    [write, fallback],
  );
  const setFilters = useCallback(
    (
      value:
        | Record<string, string>
        | ((old: Record<string, string>) => Record<string, string>),
    ) => {
      const p = new URLSearchParams(pending.current),
        old = Object.fromEntries(
          KEYS.filter((k) => p.get(k)).map((k) => [k, p.get(k)!]),
        );
      const next = typeof value === 'function' ? value(old) : value;
      write(
        {
          ...Object.fromEntries(KEYS.map((k) => [k, next[k] || null])),
          page: null,
        },
        true,
      );
    },
    [write],
  );
  const open = useCallback(
    (kind: string, id: string) => {
      opener.current = document.activeElement as HTMLElement;
      returnUrl.current = pending.current;
      write({ detail: kind, id });
    },
    [write],
  );
  const close = useCallback(() => {
    if (returnUrl.current !== null) {
      const previous = returnUrl.current;
      returnUrl.current = null;
      router.back();
      requestAnimationFrame(() =>
        window.scrollTo(0, scroll.current.get(previous) ?? 0),
      );
    } else write({ detail: null, id: null }, true);
  }, [router, write]);
  useEffect(() => {
    const y = scroll.current.get(current);
    if (y !== undefined && !search.get('detail'))
      requestAnimationFrame(() => window.scrollTo(0, y));
  }, [current, search]);
  return {
    returnFocus: opener,
    params: search,
    view,
    setView,
    filters,
    setFilters,
    write,
    open,
    close,
    detail: search.get('detail'),
    id: search.get('id'),
    page: Number(search.get('page')) || 1,
    pageSize: Number(search.get('pageSize')) || 20,
    sort: search.get('sort') || 'date',
    direction: search.get('direction') || 'desc',
    layout: ['records', 'daily', 'monthly'].includes(search.get('layout') ?? '')
      ? search.get('layout')!
      : 'records',
  };
}
export function useDebounced<T>(value: T, delay = 300) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setResult(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return result;
}
