import { BellRing, ChartNoAxesCombined, ImageIcon, Phone, Settings2 } from "lucide-react";
import type { ComponentType } from "react";

export type SettingsSectionId = "branding" | "appearance" | "alerts" | "reports" | "channels";

export type SettingsSectionMeta = {
  id: SettingsSectionId;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  scope: "personal" | "shared";
};

/**
 * تعريف أقسام شاشة الإعدادات.
 * ملاحظة: هذا الملف عرض فقط (presentation) ولا يمس أي منطق حفظ أو بيانات.
 */
export const SETTINGS_SECTIONS: SettingsSectionMeta[] = [
  {
    id: "branding",
    label: "الهوية والشعار",
    description: "شعار الشركة الظاهر في تقارير PDF",
    icon: ImageIcon,
    scope: "shared",
  },
  {
    id: "appearance",
    label: "المظهر والتخصيص",
    description: "حجم الأرقام، الأيقونة، والاختصارات",
    icon: Settings2,
    scope: "personal",
  },
  {
    id: "alerts",
    label: "الصوت والتنبيهات",
    description: "نغمة الإشعارات ونسبة تنبيه النقص",
    icon: BellRing,
    scope: "shared",
  },
  {
    id: "reports",
    label: "التقارير والجدولة",
    description: "المستلمون، الموعد اليومي، والعلامة المائية",
    icon: ChartNoAxesCombined,
    scope: "shared",
  },
  {
    id: "channels",
    label: "قنوات الإرسال",
    description: "إشعارات واتساب الرسمية",
    icon: Phone,
    scope: "shared",
  },
];

type Props = {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
};

export function SettingsSidebar({ active, onSelect }: Props) {
  return (
    <nav
      aria-label="أقسام الإعدادات"
      className="lg:sticky lg:top-4 rounded-2xl border border-[#dce7ee] bg-white/95 p-2 shadow-[0_10px_30px_rgba(18,44,84,0.055)] backdrop-blur-md"
    >
      <p className="hidden px-3 pb-1 pt-2 text-[10px] font-black uppercase tracking-[0.18em] text-[#94a3b8] lg:block">
        الأقسام
      </p>
      <div className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
        {SETTINGS_SECTIONS.map(section => {
          const Icon = section.icon;
          const isActive = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              aria-current={isActive ? "page" : undefined}
              className={[
                "group flex min-w-max items-center gap-3 rounded-xl px-3 py-2.5 text-right transition-colors lg:min-w-0 lg:w-full",
                isActive
                  ? "bg-[#e8f7f6] text-[#0d4f62] shadow-[inset_0_0_0_1px_rgba(13,79,98,0.12)]"
                  : "text-[#334e68] hover:bg-[#f4fafb]",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  isActive ? "bg-[#0d4f62] text-white" : "bg-[#eef4f6] text-[#0d7180]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] font-black leading-tight">{section.label}</span>
                <span className="mt-0.5 hidden truncate text-[11px] font-semibold text-slate-400 lg:block">
                  {section.description}
                </span>
              </span>
              <span
                className={[
                  "ms-auto hidden shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black lg:inline-flex",
                  section.scope === "personal"
                    ? "bg-[#e8f7f6] text-[#0d7180]"
                    : "bg-[#eef2f6] text-[#64748b]",
                ].join(" ")}
              >
                {section.scope === "personal" ? "خاص بك" : "مشترك"}
              </span>
            </button>
          );
        })}
      </div>
      <p className="hidden border-t border-[#eef3f6] px-3 pb-1 pt-3 text-[10.5px] font-semibold leading-5 text-slate-400 lg:block">
        الأقسام المعلّمة بـ«خاص بك» تُحفظ على هذا الجهاز فقط، والباقي إعدادات مشتركة للفريق.
      </p>
    </nav>
  );
}
