import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("page-header-shell flex flex-col justify-between gap-5 lg:flex-row lg:items-end", className)}>
      <div className="page-header-copy min-w-0">
        {eyebrow ? <p className="page-header-eyebrow mb-2 text-[10px] font-black uppercase tracking-[0.27em] text-amber-600 dark:text-amber-300">{eyebrow}</p> : null}
        <h1 className="page-header-title text-3xl font-black tracking-tight text-foreground">{title}</h1>
        {description ? <p className="page-header-description mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">{description}</p> : null}
      </div>
      {meta || actions ? <div className="page-header-actions flex flex-wrap items-center gap-2">{meta}{actions}</div> : null}
    </header>
  );
}
