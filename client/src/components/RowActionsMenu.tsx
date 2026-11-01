import * as React from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type RowAction = {
  /** Stable key for the action. */
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  onSelect: () => void;
  disabled?: boolean;
  /** Renders in the destructive colour and is separated from the rest. */
  destructive?: boolean;
  /** Hidden from the menu entirely (permission based). */
  hidden?: boolean;
  /** Shown as a hint under the label, e.g. a shortcut or the target name. */
  hint?: string;
};

type RowActionsMenuProps = {
  actions: RowAction[];
  /** Accessible label, should include the row name. */
  label: string;
  align?: "start" | "end";
  className?: string;
  /** Compact icon button used inside dense tables. */
  size?: "sm" | "default";
  /** Optional extra content rendered before the menu (e.g. a primary button). */
  leading?: React.ReactNode;
};

/**
 * Single, consistent actions menu for every operational table row.
 * Replaces the long strips of icon buttons that used to wrap on mobile.
 */
export function RowActionsMenu({
  actions,
  label,
  align = "end",
  className,
  size = "sm",
  leading,
}: RowActionsMenuProps) {
  const visible = actions.filter((action) => !action.hidden);
  const primary = visible.filter((action) => !action.destructive);
  const destructive = visible.filter((action) => action.destructive);

  if (!visible.length && !leading) return null;

  return (
    <div className={cn("flex items-center justify-end gap-1", className)}>
      {leading}
      {visible.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={label}
              className={cn(
                "icon-btn border-0 bg-transparent hover:bg-[var(--brand-soft)]",
                size === "sm" ? "h-9 w-9" : "h-10 w-10"
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <MoreVertical className="h-4 w-4" strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align={align}
            className="min-w-52 rounded-2xl border-[var(--border-strong)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-raised)]"
            onClick={(event) => event.stopPropagation()}
          >
            <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-bold text-[var(--text-muted)]">
              {label}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {primary.map((action) => {
              const Icon = action.icon;
              return (
                <DropdownMenuItem
                  key={action.key}
                  disabled={action.disabled}
                  onSelect={() => action.onSelect()}
                  className="cursor-pointer gap-2.5 rounded-xl px-2 py-2 text-sm font-bold text-[var(--text-strong)] transition-colors focus:bg-[var(--brand-soft)] focus:text-[var(--brand)]"
                >
                  {Icon ? (
                    <span className="icon-tile icon-tile--xs">
                      <Icon className="h-4 w-4" strokeWidth={1.9} />
                    </span>
                  ) : null}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{action.label}</span>
                    {action.hint ? (
                      <span className="truncate text-[10px] font-medium text-[var(--text-muted)]">
                        {action.hint}
                      </span>
                    ) : null}
                  </span>
                </DropdownMenuItem>
              );
            })}
            {destructive.length ? (
              <>
                <DropdownMenuSeparator />
                {destructive.map((action) => {
                  const Icon = action.icon;
                  return (
                    <DropdownMenuItem
                      key={action.key}
                      disabled={action.disabled}
                      onSelect={() => action.onSelect()}
                      className="cursor-pointer gap-2.5 rounded-xl px-2 py-2 text-sm font-bold text-[var(--negative)] transition-colors focus:bg-[color-mix(in_oklab,var(--negative)_14%,transparent)] focus:text-[var(--negative)]"
                    >
                      {Icon ? (
                        <span className="icon-tile icon-tile--xs icon-tile--negative">
                          <Icon className="h-4 w-4" strokeWidth={1.9} />
                        </span>
                      ) : null}
                      <span className="truncate">{action.label}</span>
                    </DropdownMenuItem>
                  );
                })}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

export default RowActionsMenu;
