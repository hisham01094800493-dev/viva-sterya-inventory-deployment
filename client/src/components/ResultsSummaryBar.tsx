import * as React from "react";
import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ActiveFilter = {
  /** Stable key used for individual removal. */
  key: string;
  /** Human label, e.g. "من تاريخ". */
  label: string;
  /** Displayed value, e.g. "2024-01-01". */
  value: string;
  /** Optional tone for the chip. */
  tone?: "default" | "neutral" | "positive" | "negative" | "caution";
};

type ResultsSummaryBarProps = {
  /** Number of rows currently visible. */
  count: number;
  /** Arabic noun for the counted entity, e.g. "صنف" / "حركة". */
  unit: string;
  /** Optional secondary note, e.g. "من أصل 1,240". */
  totalNote?: string;
  filters?: ActiveFilter[];
  onRemoveFilter?: (key: string) => void;
  onClearFilters?: () => void;
  /** Extra controls rendered at the end of the bar (e.g. a "filters" button). */
  children?: React.ReactNode;
  className?: string;
  /** Hide the bar when there are no filters and no count override. */
  alwaysShow?: boolean;
};

/**
 * Single place that answers "how many rows am I looking at, and why".
 * Shows the result count plus one removable chip per active filter.
 */
export function ResultsSummaryBar({
  count,
  unit,
  totalNote,
  filters = [],
  onRemoveFilter,
  onClearFilters,
  children,
  className,
  alwaysShow = true,
}: ResultsSummaryBarProps) {
  if (!alwaysShow && !filters.length) return null;

  const formatted = new Intl.NumberFormat("en-US").format(count);

  return (
    <div className={cn("results-bar", className)} role="status" aria-live="polite">
      <span className="results-bar__count">
        <Filter className="h-3.5 w-3.5 text-[var(--brand)]" aria-hidden="true" />
        <b>{formatted}</b>
        <span className="text-[var(--text-muted)]">{unit}</span>
      </span>

      {totalNote ? (
        <span className="text-[11px] font-bold text-[var(--text-muted)]">{totalNote}</span>
      ) : null}

      {filters.length ? (
        <>
          <span className="hidden h-4 w-px bg-[var(--border-strong)] sm:block" aria-hidden="true" />
          <ul className="flex flex-wrap items-center gap-1.5">
            {filters.map((filter) => (
              <li key={filter.key}>
                <span
                  className={cn(
                    "chip",
                    filter.tone === "neutral" && "chip--neutral",
                    filter.tone === "positive" && "chip--positive",
                    filter.tone === "negative" && "chip--negative",
                    filter.tone === "caution" && "chip--caution"
                  )}
                >
                  <span className="font-black opacity-80">{filter.label}:</span>
                  <span className="max-w-32 truncate">{filter.value}</span>
                  {onRemoveFilter ? (
                    <button
                      type="button"
                      onClick={() => onRemoveFilter(filter.key)}
                      aria-label={`إزالة فلتر ${filter.label}`}
                      className="chip-remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {onClearFilters && filters.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClearFilters}
              className="ms-auto h-7 rounded-lg px-2 text-[11px] font-black text-[var(--negative)] hover:bg-[color-mix(in_oklab,var(--negative)_12%,transparent)]"
            >
              مسح الكل
            </Button>
          ) : null}
        </>
      ) : null}

      {children ? <div className="ms-auto flex items-center gap-1.5">{children}</div> : null}
    </div>
  );
}

export default ResultsSummaryBar;
