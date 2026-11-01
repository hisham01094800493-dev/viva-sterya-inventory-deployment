import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type ActiveFilter = { id: string; label: string; onRemove?: () => void };

export function FilterBar({
  title = "الفلاتر",
  description,
  resultCount,
  activeFilters = [],
  onClear,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  resultCount?: ReactNode;
  activeFilters?: ActiveFilter[];
  onClear?: () => void;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("report-filter-card rounded-[1.75rem] border border-border bg-card text-card-foreground shadow-sm", className)} aria-label={typeof title === "string" ? title : "الفلاتر"}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-foreground">{title}</h2>
            {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {resultCount !== undefined ? <Badge variant="outline" className="rounded-full border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-black text-primary">{resultCount}</Badge> : null}
        </div>
        {activeFilters.length ? (
          <div className="flex flex-wrap items-center gap-2" aria-label="الفلاتر النشطة">
            <span className="text-[11px] font-bold text-muted-foreground">الفلاتر النشطة:</span>
            {activeFilters.map(filter => (
              <button key={filter.id} type="button" onClick={filter.onRemove} disabled={!filter.onRemove} className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-bold text-primary transition hover:bg-primary/10 disabled:cursor-default">
                {filter.label}
                {filter.onRemove ? <X className="h-3 w-3" aria-hidden="true" /> : null}
              </button>
            ))}
            {onClear ? <button type="button" onClick={onClear} className="text-[11px] font-black text-destructive underline-offset-4 hover:underline">مسح الكل</button> : null}
          </div>
        ) : null}
        {children ? <div className="report-filter-grid grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{children}</div> : null}
      </div>
    </section>
  );
}
