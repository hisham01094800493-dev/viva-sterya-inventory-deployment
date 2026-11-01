import type { ComponentType, ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type ActionMenuItem = {
  id: string;
  label: ReactNode;
  onSelect: () => void;
  icon?: ComponentType<{ className?: string }>;
  destructive?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
};

export function ActionMenu({ items, label = "إجراءات", align = "end", className }: { items: ActionMenuItem[]; label?: string; align?: "start" | "center" | "end"; className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" className={cn("h-9 w-9 rounded-xl border-border bg-background text-foreground hover:bg-accent", className)} aria-label={label} title={label}>
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="min-w-44 rounded-xl p-1 [direction:rtl]">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <div key={item.id}>
              {item.separatorBefore ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem disabled={item.disabled} onSelect={item.onSelect} className={cn("cursor-pointer gap-2 rounded-lg px-3 py-2.5 text-sm font-bold", item.destructive && "text-destructive focus:text-destructive")}>
                {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                <span className="min-w-0 flex-1">{item.label}</span>
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
