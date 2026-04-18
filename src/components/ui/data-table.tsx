"use client";

import { useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Pagination } from "./pagination";

interface DataTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  pageSize?: number;
  searchColumn?: string;
  searchValue?: string;
  emptyMessage?: string;
  className?: string;
  stickyHeader?: boolean;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData>({
  data,
  columns,
  pageSize = 25,
  searchColumn,
  searchValue,
  emptyMessage = "No data",
  className = "",
  stickyHeader = false,
  onRowClick,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>(() => {
    if (searchColumn && searchValue) {
      return [{ id: searchColumn, value: searchValue }];
    }
    return [];
  });

  // Sync external search to column filters
  if (searchColumn && searchValue !== undefined) {
    const existing = columnFilters.find((f) => f.id === searchColumn);
    if (existing?.value !== searchValue) {
      const next = columnFilters.filter((f) => f.id !== searchColumn);
      if (searchValue) next.push({ id: searchColumn, value: searchValue });
      setTimeout(() => setColumnFilters(next), 0);
    }
  }

  const table = useReactTable({
    data,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
  });

  const rows = table.getRowModel().rows;
  const pageCount = table.getPageCount();
  const currentPage = table.getState().pagination.pageIndex + 1;

  return (
    <div className={className}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px] leading-5">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className={stickyHeader ? "sticky top-0 z-10 bg-bg-primary" : ""}
              >
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const isNumeric = header.column.columnDef.meta && typeof header.column.columnDef.meta === "object" && "numeric" in header.column.columnDef.meta;

                  return (
                    <th
                      key={header.id}
                      className={`border-b border-border pb-2.5 pr-4 font-medium text-text-muted text-[11px] uppercase tracking-[0.08em] last:pr-0 ${
                        isNumeric ? "text-right" : "text-left"
                      } ${canSort ? "cursor-pointer select-none" : ""}`}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <span className="inline-flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort && (
                          <span className="inline-flex flex-col">
                            {sorted === "asc" ? (
                              <ChevronUp className="w-3 h-3 text-accent" />
                            ) : sorted === "desc" ? (
                              <ChevronDown className="w-3 h-3 text-accent" />
                            ) : (
                              <ChevronsUpDown className="w-3 h-3 text-text-muted/50" />
                            )}
                          </span>
                        )}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="font-mono">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-8 text-center text-[13px] text-text-muted font-body"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={onRowClick ? "cursor-pointer transition-colors hover:bg-bg-hover/50" : ""}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isNumeric = cell.column.columnDef.meta && typeof cell.column.columnDef.meta === "object" && "numeric" in cell.column.columnDef.meta;
                    return (
                      <td
                        key={cell.id}
                        className={`border-b border-border/40 py-2 pr-4 align-top last:pr-0 ${
                          isNumeric ? "text-right" : ""
                        }`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between pt-3">
          <span className="text-xs text-text-muted font-mono">
            {table.getFilteredRowModel().rows.length} results
          </span>
          <Pagination
            currentPage={currentPage}
            totalPages={pageCount}
            onPageChange={(page) => table.setPageIndex(page - 1)}
          />
        </div>
      )}
    </div>
  );
}
