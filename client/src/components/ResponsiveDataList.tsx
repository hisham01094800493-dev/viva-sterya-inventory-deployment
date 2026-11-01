import * as React from "react";
import { cn } from "@/lib/utils";

export type ResponsiveColumn<T> = {
  key: string;
  header: string;
  /** Cell renderer for the desktop table. */
  cell: (row: T, index: number) => React.ReactNode;
  /** Value used inside the mobile card grid. Falls back to `cell`. */
  cardValue?: (row: T, index: number) => React.ReactNode;
  /** Hide this column inside the mobile card (e.g. image columns). */
  hideOnCard?: boolean;
  /** Render as the card title instead of a labelled field. */
  cardTitle?: boolean;
  /** Render as the card subtitle/meta line. */
  cardMeta?: boolean;
  /** Extra classes for the <th>/<td>. */
  className?: string;
  /** Numeric column: right-aligned + tabular figures. */
  numeric?: boolean;
};

type ResponsiveDataListProps<T> = {
  rows: T[];
  columns: ResponsiveColumn<T>[];
  rowKey: (row: T, index: number) => React.Key;
  /** Table aria-label. */
  label: string;
  /** Card actions (rendered in the card footer and optionally in the table). */
  actions?: (row: T, index: number) => React.ReactNode;
  /** Table-only actions column header. */
  actionsHeader?: string;
  onRowClick?: (row: T, index: number) => void;
  rowAriaLabel?: (row: T, index: number) => string;
  /** Message when there are no rows. */
  empty?: React.ReactNode;
  /** Minimum table width so wide tables keep horizontal scroll on desktop. */
  minTableWidth?: number;
  className?: string;
  tableClassName?: string;
  /** Extra classes applied to each mobile card. */
  cardClassName?: string;
  /** Sticky table header. */
  stickyHeader?: boolean;
  /** Show the table header row on desktop only (default true). */
  showHeader?: boolean;
};

/**
 * Renders a real <table> from `md` upwards and a stack of readable cards on
 * phones. Keeps one single source of truth for the data + actions so the two
 * presentations can never drift apart.
 */
export function ResponsiveDataList<T>({
  rows,
  columns,
  rowKey,
  label,
  actions,
  actionsHeader = "إجراء",
  onRowClick,
  rowAriaLabel,
  empty,
  minTableWidth = 720,
  className,
  tableClassName,
  cardClassName,
  stickyHeader = false,
  showHeader = true,
}: ResponsiveDataListProps<T>) {
  if (!rows.length) {
    return (
      <div className={cn("p-8 text-center text-sm text-[var(--text-muted)]", className)}>
        {empty ?? "لا توجد نتائج مطابقة."}
      </div>
    );
  }

  const titleColumn = columns.find((column) => column.cardTitle);
  const metaColumn = columns.find((column) => column.cardMeta);
  const cardFields = columns.filter(
    (column) => !column.hideOnCard && !column.cardTitle && !column.cardMeta
  );

  return (
    <div className={className}>
      {/* ---------- Desktop table ---------- */}
      <div className="hidden overflow-x-auto md:block">
        <table
          className={cn("w-full text-right text-sm", tableClassName)}
          style={{ minWidth: minTableWidth }}
          aria-label={label}
        >
          {showHeader ? (
            <thead
              className={cn(
                "bg-[var(--surface-muted)] text-[11px] font-black text-[var(--text-muted)]",
                stickyHeader && "sticky top-0 z-10"
              )}
            >
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={cn("px-4 py-3", column.numeric && "text-left", column.className)}
                  >
                    {column.header}
                  </th>
                ))}
                {actions ? (
                  <th scope="col" className="px-4 py-3 text-left">
                    {actionsHeader}
                  </th>
                ) : null}
              </tr>
            </thead>
          ) : null}
          <tbody className="divide-y divide-[var(--border-soft)]">
            {rows.map((row, index) => {
              const clickable = Boolean(onRowClick);
              return (
                <tr
                  key={rowKey(row, index)}
                  onClick={clickable ? () => onRowClick?.(row, index) : undefined}
                  onKeyDown={
                    clickable
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onRowClick?.(row, index);
                          }
                        }
                      : undefined
                  }
                  tabIndex={clickable ? 0 : undefined}
                  role={clickable ? "button" : undefined}
                  aria-label={rowAriaLabel?.(row, index)}
                  className={cn(
                    "align-middle transition-colors",
                    clickable &&
                      "cursor-pointer hover:bg-[var(--surface-muted)] focus:bg-[var(--surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand)]"
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-4 py-3 text-[var(--text-strong)]",
                        column.numeric && "text-left font-black tabular-nums",
                        column.className
                      )}
                    >
                      {column.cell(row, index)}
                    </td>
                  ))}
                  {actions ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end">{actions(row, index)}</div>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------- Mobile cards ---------- */}
      <ul className="flex flex-col gap-2.5 md:hidden" aria-label={label}>
        {rows.map((row, index) => {
          const clickable = Boolean(onRowClick);
          return (
            <li
              key={rowKey(row, index)}
              className={cn("data-card", clickable && "active:scale-[0.995] transition-transform", cardClassName)}
              onClick={clickable ? () => onRowClick?.(row, index) : undefined}
            >
              <div className="data-card__head">
                <div className="min-w-0">
                  {titleColumn ? (
                    <div className="data-card__title">{titleColumn.cardValue?.(row, index) ?? titleColumn.cell(row, index)}</div>
                  ) : null}
                  {metaColumn ? (
                    <div className="data-card__meta mt-0.5">
                      {metaColumn.cardValue?.(row, index) ?? metaColumn.cell(row, index)}
                    </div>
                  ) : null}
                </div>
              </div>

              {cardFields.length ? (
                <dl className="data-card__grid">
                  {cardFields.map((column) => (
                    <div key={column.key} className="data-card__field">
                      <dt>{column.header}</dt>
                      <dd>{column.cardValue?.(row, index) ?? column.cell(row, index)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {actions ? (
                <div className="data-card__actions" onClick={(event) => event.stopPropagation()}>
                  {actions(row, index)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ResponsiveDataList;

/* --------------------------------------------------------------------------
   MobileRecordCards
   Renders *only* the card presentation (hidden from `md` up). Use it next to
   an existing wide <table> to give phones a readable layout without
   duplicating the table markup or its behaviour.
   -------------------------------------------------------------------------- */

export type MobileRecordField = {
  label: string;
  value: React.ReactNode;
  /** Highlight the value (quantities, totals). */
  emphasis?: boolean;
  /** Tone for the value. */
  tone?: "default" | "positive" | "negative" | "caution";
};

type MobileRecordCardsProps<T> = {
  rows: T[];
  rowKey: (row: T, index: number) => React.Key;
  title: (row: T, index: number) => React.ReactNode;
  subtitle?: (row: T, index: number) => React.ReactNode;
  fields: (row: T, index: number) => MobileRecordField[];
  actions?: (row: T, index: number) => React.ReactNode;
  onRowClick?: (row: T, index: number) => void;
  /** Optional badge rendered next to the title (e.g. movement type). */
  badge?: (row: T, index: number) => React.ReactNode;
  empty?: React.ReactNode;
  className?: string;
  label?: string;
};

const toneClass: Record<NonNullable<MobileRecordField["tone"]>, string> = {
  default: "text-[var(--text-strong)]",
  positive: "text-[var(--positive)]",
  negative: "text-[var(--negative)]",
  caution: "text-[var(--caution)]",
};

export function MobileRecordCards<T>({
  rows,
  rowKey,
  title,
  subtitle,
  fields,
  actions,
  onRowClick,
  badge,
  empty,
  className,
  label,
}: MobileRecordCardsProps<T>) {
  if (!rows.length) {
    return (
      <div className={cn("p-8 text-center text-sm text-[var(--text-muted)] md:hidden", className)}>
        {empty ?? "لا توجد نتائج مطابقة."}
      </div>
    );
  }

  return (
    <ul className={cn("flex flex-col gap-2.5 md:hidden", className)} aria-label={label}>
      {rows.map((row, index) => (
        <li
          key={rowKey(row, index)}
          className={cn("data-card", onRowClick && "cursor-pointer transition-transform active:scale-[0.995]")}
          onClick={onRowClick ? () => onRowClick(row, index) : undefined}
        >
          <div className="data-card__head">
            <div className="min-w-0">
              <div className="data-card__title">{title(row, index)}</div>
              {subtitle ? <div className="data-card__meta mt-0.5">{subtitle(row, index)}</div> : null}
            </div>
            {badge ? <div className="shrink-0">{badge(row, index)}</div> : null}
          </div>

          <dl className="data-card__grid">
            {fields(row, index).map((field) => (
              <div key={field.label} className="data-card__field">
                <dt>{field.label}</dt>
                <dd
                  className={cn(
                    toneClass[field.tone ?? "default"],
                    field.emphasis && "font-black tabular-nums"
                  )}
                >
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>

          {actions ? (
            <div className="data-card__actions" onClick={(event) => event.stopPropagation()}>
              {actions(row, index)}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}


