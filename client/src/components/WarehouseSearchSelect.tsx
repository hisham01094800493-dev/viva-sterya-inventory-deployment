import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronsUpDown, Warehouse } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

export type WarehouseSearchOption = { value: string; label: string; slot?: number };

export function filterWarehouseSearchOptions(options: WarehouseSearchOption[], query: string) {
  const normalized = query.trim().toLocaleLowerCase("ar-EG");
  if (!normalized) return options;
  return options.filter(option => option.label.toLocaleLowerCase("ar-EG").includes(normalized));
}

export function WarehouseSearchSelect({ options, value, onValueChange, placeholder = "ابحث واختر المخزن", ariaLabel = "اختيار المخزن", disabled = false }: { options: WarehouseSearchOption[]; value: string; onValueChange: (value: string) => void; placeholder?: string; ariaLabel?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find(option => option.value === value);
  const filtered = useMemo(() => filterWarehouseSearchOptions(options, query), [options, query]);
  return <Popover open={open} onOpenChange={nextOpen => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }}><PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-label={ariaLabel} aria-expanded={open} disabled={disabled} className="h-10 w-full justify-between rounded-xl border-input bg-background px-3 text-right font-normal text-[#102a43]"><span className={cn("flex min-w-0 items-center gap-2 truncate", !selected && "text-slate-400")}><Warehouse className="h-4 w-4 shrink-0 text-[#0d7180]" />{selected?.label ?? placeholder}</span><ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" /></Button></PopoverTrigger><PopoverContent align="start" className="w-[min(92vw,380px)] overflow-hidden rounded-xl border-[#b9d4d9] p-0" dir="rtl"><Command shouldFilter={false}><CommandInput value={query} onValueChange={setQuery} placeholder="ابحث باسم المخزن..." autoFocus /><CommandList className="max-h-64"><CommandEmpty>لا توجد مخازن مطابقة.</CommandEmpty><CommandGroup heading="المخازن المعتمدة">{filtered.map(option => <CommandItem key={option.value} value={option.value} onSelect={() => { onValueChange(option.value); setOpen(false); setQuery(""); }} className="cursor-pointer py-2.5 text-right"><Check className={cn("ml-2 h-4 w-4 text-[#0d806c]", value === option.value ? "opacity-100" : "opacity-0")} /><Warehouse className="h-4 w-4 text-[#0d7180]" /><span className="flex-1 font-bold">{option.label}</span>{option.slot ? <span className="text-[10px] text-slate-400">#{option.slot}</span> : null}</CommandItem>)}</CommandGroup></CommandList></Command></PopoverContent></Popover>;
}
