"use client";

import React from "react";

export type Column<T extends Record<string, any>> = {
  key: keyof T | string;
  header: string;
  sortable?: boolean;
  width?: string | number;
  render?: (row: T) => React.ReactNode;
};

type SortDir = "asc" | "desc";

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  initialSort,
  pageSizeOptions = [10, 25, 50],
  defaultPageSize = 10,
  loading = false,
  hidePageSizeControls = false,
  hidePaginationControls = false,
}: {
  columns: Column<T>[];
  data: T[];
  initialSort?: { key: string; direction: SortDir };
  pageSizeOptions?: number[];
  defaultPageSize?: number;
  loading?: boolean;
  hidePageSizeControls?: boolean;
  hidePaginationControls?: boolean;
}) {
  const [sortKey, setSortKey] = React.useState<string | null>(
    initialSort?.key ?? null
  );
  const [sortDir, setSortDir] = React.useState<SortDir>(
    initialSort?.direction ?? "asc"
  );
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(defaultPageSize);

  const sorted = React.useMemo(() => {
    if (!sortKey) return [...data];
    const sortedData = [...data].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return -1;
      if (bv == null) return 1;
      if (typeof av === "number" && typeof bv === "number") {
        return av - bv;
      }
      return String(av).localeCompare(String(bv));
    });
    return sortDir === "asc" ? sortedData : sortedData.reverse();
  }, [data, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = React.useMemo(() => {
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  }

  return (
    <div className="card p-0 overflow-hidden relative" aria-busy={loading}>
      {/* Desktop/tablet table */}
      <div className="overflow-x-auto hidden md:block">
        <table className="table">
          <thead>
            <tr>
              {columns.map((col) => {
                const key = String(col.key);
                const isSorted = sortKey === key;
                return (
                  <th
                    key={key}
                    style={{ width: col.width }}
                    onClick={() => col.sortable && toggleSort(key)}
                    className={col.sortable ? "cursor-pointer select-none" : ""}
                    aria-sort={
                      isSorted ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                    }
                  >
                    <div className="flex items-center gap-1">
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="text-xs opacity-60">
                          {isSorted ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {current.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-10 text-center text-[var(--muted)]">
                  No data to display
                </td>
              </tr>
            ) : (
              current.map((row, idx) => (
                <tr key={(row as any).id ?? idx}>
                  {columns.map((col) => (
                    <td key={String(col.key)}>
                      {col.render ? col.render(row) : String((row as any)[col.key as any] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden">
        {current.length === 0 ? (
          <div className="p-6 text-center text-[var(--muted)]">No data to display</div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {current.map((row, idx) => (
              <li key={(row as any).id ?? idx} className="p-4">
                <div className="font-semibold">
                  {columns[0]?.render
                    ? (columns[0].render as any)(row)
                    : String((row as any)[columns[0]?.key as any] ?? "")}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                  {columns.slice(1).map((col) => (
                    <div key={String(col.key)} className="text-sm">
                      <div className="text-[var(--muted)]">{col.header}</div>
                      <div>
                        {col.render ? col.render(row) : String((row as any)[col.key as any] ?? "")}
                      </div>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!(hidePageSizeControls && hidePaginationControls) && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3">
          {!hidePageSizeControls && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--muted)]">Rows per page</span>
              <select
                className="select h-9"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!hidePaginationControls && (
            <div className="flex items-center gap-2">
              <button
                className="btn btn-secondary h-9"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                Prev
              </button>
              <span className="text-sm">
                Page {page} of {pageCount}
              </span>
              <button
                className="btn btn-secondary h-9"
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                disabled={page >= pageCount}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 bg-white/60 dark:bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-10">
          <div
            role="progressbar"
            aria-label="Loading"
            className="h-10 w-10 rounded-full border-2 border-[var(--border)] border-t-[var(--ring)] animate-spin"
          />
        </div>
      )}
    </div>
  );
}
