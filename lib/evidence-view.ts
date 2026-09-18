export type OriginalEvidence = {
  [key: string]: unknown;
  values?: Record<string, unknown>;
  fieldColumns?: Record<string, string>;
  headers?: Record<string, string>;
  pageGeometry?: {
    pageNumber: number;
    width: number;
    height: number;
    unit?: string;
  } | null;
  cells?: {
    columnIndex: number;
    content?: string;
    boundingRegions?: { pageNumber: number; polygon: number[] }[];
  }[];
};
/** Source coordinates only; never derive handwriting or identity from an image. */
export function rowPolygons(
  original: OriginalEvidence | null | undefined,
  page: number,
) {
  const geometry = original?.pageGeometry;
  if (
    geometry?.pageNumber !== page ||
    !(geometry.width > 0) ||
    !(geometry.height > 0)
  )
    return [];
  return (original?.cells ?? []).flatMap((cell) =>
    (cell.boundingRegions ?? [])
      .filter(
        (r) =>
          r.pageNumber === page &&
          Array.isArray(r.polygon) &&
          r.polygon.length >= 6 &&
          r.polygon.length % 2 === 0 &&
          r.polygon.every(
            (n, i) =>
              typeof n === 'number' &&
              Number.isFinite(n) &&
              n >= 0 &&
              n <= (i % 2 ? geometry.height : geometry.width),
          ),
      )
      .map((r) =>
        r.polygon
          .reduce((points: string[], n: number, i: number) => {
            if (i % 2 === 0)
              points.push(
                `${(n / geometry.width) * 100},${(r.polygon[i + 1] / geometry.height) * 100}`,
              );
            return points;
          }, [])
          .join(' '),
      ),
  );
}

export function originalField(
  original: OriginalEvidence | null | undefined,
  key: string,
) {
  const columns = original?.fieldColumns;
  if (columns && original?.cells) {
    const cells = original.cells.filter(
      (c) => columns[original.headers?.[c.columnIndex] ?? ''] === key,
    );
    if (cells.length) return cells.map((c) => c.content).join(' | ');
  }
  if (original?.values && key in original.values) return original.values[key];
  if (original && key in original) return original[key];
  return null;
}
