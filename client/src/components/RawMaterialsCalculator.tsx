import { useMemo, useState, type ReactNode } from "react";
import { Copy, Printer, Ruler, Weight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  calculateCeramicMaterials,
  calculateRebarMaterials,
  type CeramicCalculation,
  type RebarCalculation,
} from "@/lib/materialsCalculator";

type AreaMode = "tile" | "carton";

const materialNumber = new Intl.NumberFormat("ar-EG", {
  maximumFractionDigits: 3,
});
const showNumber = (value: number | null | undefined) =>
  value == null ? "—" : materialNumber.format(value);

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );
}

function makePrintWindow(title: string, lines: string[]) {
  const printWindow = window.open("", "_blank", "width=760,height=760");
  if (!printWindow) return false;
  printWindow.opener = null;
  printWindow.document.open();
  printWindow.document.write(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;color:#152b3d;margin:36px;line-height:1.7}h1{font-size:24px;border-bottom:2px solid #0d7180;padding-bottom:12px}ul{padding:0;list-style:none}li{padding:10px 0;border-bottom:1px solid #e2e8f0}.note{margin-top:24px;color:#64748b;font-size:12px}@media print{body{margin:18mm}}</style></head><body><h1>${escapeHtml(title)}</h1><ul>${lines.map(line => `<li>${escapeHtml(line)}</li>`).join("")}</ul><p class="note">النتائج تقديرية وتُراجع مع مواصفات المورد والقياس الفعلي.</p></body></html>`
  );
  printWindow.document.close();
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
  return true;
}

function ResultMetric({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-xl border p-3 ${emphasis ? "border-teal-500/40 bg-teal-500/10" : "border-border bg-muted/50"}`}
    >
      <p className="text-[11px] font-semibold leading-5 text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1 break-words text-lg font-black tabular-nums ${emphasis ? "text-teal-700 dark:text-teal-300" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="block text-xs font-bold text-foreground">{label}</span>
      {children}
      {hint && (
        <span className="block text-[10px] leading-4 text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}

function ceramicLines(name: string, result: CeramicCalculation) {
  return [
    `الصنف/المقاس: ${name.trim() || "سيراميك"}`,
    `عدد البلاطات المطلوب: ${showNumber(result.requestedTileCount)} بلاطة`,
    `الهالك المحسوب: ${showNumber(result.wastageTileCount)} بلاطة (${showNumber(result.wastageAreaSquareMeters)} م²)`,
    `الكمية بعد الهالك: ${showNumber(result.targetTileCount)} بلاطة`,
    `عدد الكراتين: ${result.cartonsRequired == null ? "غير محسوب" : showNumber(result.cartonsRequired)}`,
    `كمية البلاطات الفعلية من الكراتين: ${showNumber(result.suppliedTileCount)} بلاطة`,
    `المساحة قبل الهالك: ${showNumber(result.baseAreaSquareMeters)} م²`,
    `المساحة بعد الهالك: ${showNumber(result.targetAreaSquareMeters)} م²`,
    `المساحة الفعلية بعد تقريب الكراتين: ${showNumber(result.suppliedAreaSquareMeters)} م²`,
    `زيادة تقريب الكراتين: ${showNumber(result.tilesFromCartonRounding)} بلاطة / ${showNumber(result.cartonRoundingAreaSquareMeters)} م²`,
  ];
}

function rebarLines(name: string, result: RebarCalculation) {
  return [
    `الصنف/المقاس: ${name.trim() || `حديد قطر ${showNumber(result.diameterMm)} مم`}`,
    `قطر السيخ: ${showNumber(result.diameterMm)} مم`,
    `العدد قبل الهالك: ${showNumber(result.requestedBarCount)} سيخ`,
    `الزيادة للهالك: ${showNumber(result.extraBarCount)} سيخ`,
    `العدد النهائي: ${showNumber(result.totalBarCount)} سيخ`,
    `الطول قبل الهالك: ${showNumber(result.requestedLengthMeters)} م`,
    `إجمالي الأطوال بعد الهالك: ${showNumber(result.totalLengthMeters)} م`,
    `وزن المتر المستخدم: ${showNumber(result.weightPerMeterKg)} كجم/م`,
    `الوزن قبل الهالك: ${showNumber(result.requestedWeightKg)} كجم`,
    `الوزن الإجمالي المحسوب: ${showNumber(result.totalWeightKg)} كجم (${showNumber(result.totalWeightTons)} طن)`,
  ];
}

export function RawMaterialsCalculator() {
  const [materialTab, setMaterialTab] = useState("ceramic");
  const [areaMode, setAreaMode] = useState<AreaMode>("tile");
  const [ceramicName, setCeramicName] = useState("");
  const [tileCount, setTileCount] = useState("");
  const [tilesPerCarton, setTilesPerCarton] = useState("");
  const [areaPerTile, setAreaPerTile] = useState("");
  const [areaPerCarton, setAreaPerCarton] = useState("");
  const [ceramicWastage, setCeramicWastage] = useState("5");
  const [rebarName, setRebarName] = useState("");
  const [diameter, setDiameter] = useState("16");
  const [customDiameter, setCustomDiameter] = useState("");
  const [barCount, setBarCount] = useState("");
  const [barLength, setBarLength] = useState("12");
  const [weightPerMeter, setWeightPerMeter] = useState("");
  const [rebarWastage, setRebarWastage] = useState("0");
  const [actionMessage, setActionMessage] = useState("");

  const ceramic = useMemo(
    () =>
      calculateCeramicMaterials({
        tileCount: Number(tileCount),
        tilesPerCarton: tilesPerCarton ? Number(tilesPerCarton) : null,
        areaPerTile:
          areaMode === "tile" && areaPerTile ? Number(areaPerTile) : null,
        areaPerCarton:
          areaMode === "carton" && areaPerCarton ? Number(areaPerCarton) : null,
        wastagePercent: Number(ceramicWastage),
      }),
    [
      tileCount,
      tilesPerCarton,
      areaMode,
      areaPerTile,
      areaPerCarton,
      ceramicWastage,
    ]
  );

  const activeDiameter =
    diameter === "custom" ? Number(customDiameter) : Number(diameter);
  const rebar = useMemo(
    () =>
      calculateRebarMaterials({
        diameterMm: activeDiameter,
        barCount: Number(barCount),
        barLengthMeters: Number(barLength),
        wastagePercent: Number(rebarWastage),
        weightPerMeterKg: weightPerMeter ? Number(weightPerMeter) : null,
      }),
    [activeDiameter, barCount, barLength, rebarWastage, weightPerMeter]
  );

  const activeLines =
    materialTab === "ceramic"
      ? ceramic
        ? ceramicLines(ceramicName, ceramic)
        : []
      : rebar
        ? rebarLines(rebarName, rebar)
        : [];
  const activeTitle =
    materialTab === "ceramic" ? "حاسبة السيراميك" : "حاسبة الحديد";

  const copyResult = async () => {
    if (!activeLines.length) return;
    try {
      await navigator.clipboard.writeText(activeLines.join("\n"));
      setActionMessage("تم نسخ النتيجة.");
    } catch {
      setActionMessage(
        "تعذر النسخ من هذا المتصفح. يمكنك تحديد النتائج ونسخها يدويًا."
      );
    }
  };

  const printResult = () => {
    if (!activeLines.length) return;
    const opened = makePrintWindow(activeTitle, activeLines);
    setActionMessage(
      opened ? "تم فتح نسخة الطباعة." : "اسمح بفتح نافذة الطباعة من المتصفح."
    );
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-300">
            <Ruler className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-black text-foreground">
              حاسبة الخامات
            </h3>
            <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
              تقدير الكمية مع الهالك وتقريب الكراتين أو الأسياخ الكاملة.
            </p>
          </div>
        </div>
      </div>

      <Tabs
        value={materialTab}
        onValueChange={value => {
          setMaterialTab(value);
          setActionMessage("");
        }}
      >
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 bg-muted p-1">
          <TabsTrigger
            value="ceramic"
            className="min-h-10 rounded-lg font-bold"
          >
            حاسبة السيراميك
          </TabsTrigger>
          <TabsTrigger value="rebar" className="min-h-10 rounded-lg font-bold">
            حاسبة الحديد
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ceramic" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="اسم الصنف أو المقاس"
              hint="مثال: سيراميك أرضيات 60 × 60 سم"
            >
              <Input
                value={ceramicName}
                onChange={event => setCeramicName(event.target.value)}
                placeholder="اكتب الاسم أو المقاس"
                className="h-10 rounded-xl bg-background"
              />
            </Field>
            <Field label="عدد البلاطات المطلوبة">
              <Input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={tileCount}
                onChange={event => setTileCount(event.target.value)}
                placeholder="مثال: 100"
                className="h-10 rounded-xl bg-background text-left"
                dir="ltr"
              />
            </Field>
            <Field
              label="البلاطات في الكرتونة"
              hint="اتركه فارغًا إذا كنت لا تحسب بالكراتين."
            >
              <Input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={tilesPerCarton}
                onChange={event => setTilesPerCarton(event.target.value)}
                placeholder="مثال: 4"
                className="h-10 rounded-xl bg-background text-left"
                dir="ltr"
              />
            </Field>
            <Field label="طريقة إدخال المساحة">
              <select
                value={areaMode}
                onChange={event => setAreaMode(event.target.value as AreaMode)}
                className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="tile">مساحة البلاطة الواحدة (م²)</option>
                <option value="carton">مساحة الكرتونة (م²)</option>
              </select>
            </Field>
            {areaMode === "tile" ? (
              <Field
                label="مساحة البلاطة الواحدة (م²)"
                hint="مثال: بلاطة 60 × 60 سم = 0.36 م²."
              >
                <Input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  inputMode="decimal"
                  value={areaPerTile}
                  onChange={event => setAreaPerTile(event.target.value)}
                  placeholder="مثال: 0.36"
                  className="h-10 rounded-xl bg-background text-left"
                  dir="ltr"
                />
              </Field>
            ) : (
              <Field
                label="مساحة الكرتونة (م²)"
                hint="يلزم إدخال عدد البلاطات في الكرتونة للتحويل."
              >
                <Input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  inputMode="decimal"
                  value={areaPerCarton}
                  onChange={event => setAreaPerCarton(event.target.value)}
                  placeholder="مثال: 1.44"
                  className="h-10 rounded-xl bg-background text-left"
                  dir="ltr"
                />
              </Field>
            )}
            <Field
              label="نسبة الهالك (%)"
              hint="تُقرّب البلاطات الإضافية لأعلى حتى تكون كمية صحيحة."
            >
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                inputMode="decimal"
                value={ceramicWastage}
                onChange={event => setCeramicWastage(event.target.value)}
                className="h-10 rounded-xl bg-background text-left"
                dir="ltr"
              />
            </Field>
          </div>

          {ceramic ? (
            <div className="space-y-2 rounded-2xl border border-border p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-foreground">النتيجة</h4>
                <span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[10px] font-bold text-teal-700 dark:text-teal-300">
                  {ceramicName.trim() || "سيراميك"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <ResultMetric
                  label="البلاطات المطلوبة قبل الهالك"
                  value={`${showNumber(ceramic.requestedTileCount)} بلاطة`}
                />
                <ResultMetric
                  label="الهالك المضاف"
                  value={`${showNumber(ceramic.wastageTileCount)} بلاطة`}
                />
                <ResultMetric
                  label="الكمية المطلوبة بعد الهالك"
                  value={`${showNumber(ceramic.targetTileCount)} بلاطة`}
                  emphasis
                />
                <ResultMetric
                  label="الكراتين المطلوبة"
                  value={
                    ceramic.cartonsRequired == null
                      ? "أدخل البلاطات/كرتونة"
                      : `${showNumber(ceramic.cartonsRequired)} كرتونة`
                  }
                />
                <ResultMetric
                  label="المساحة قبل الهالك"
                  value={`${showNumber(ceramic.baseAreaSquareMeters)} م²`}
                />
                <ResultMetric
                  label="مساحة الهالك"
                  value={`${showNumber(ceramic.wastageAreaSquareMeters)} م²`}
                />
                <ResultMetric
                  label="المساحة بعد الهالك"
                  value={`${showNumber(ceramic.targetAreaSquareMeters)} م²`}
                  emphasis
                />
                {ceramic.cartonsRequired != null && (
                  <ResultMetric
                    label="الكمية الفعلية من الكراتين"
                    value={`${showNumber(ceramic.suppliedTileCount)} بلاطة · ${showNumber(ceramic.suppliedAreaSquareMeters)} م²`}
                  />
                )}
                {ceramic.tilesFromCartonRounding > 0 && (
                  <ResultMetric
                    label="زيادة تقريب الكراتين"
                    value={`${showNumber(ceramic.tilesFromCartonRounding)} بلاطة · ${showNumber(ceramic.cartonRoundingAreaSquareMeters)} م²`}
                  />
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs leading-5 text-muted-foreground">
              أدخل عدد البلاطات ومساحة البلاطة، أو مساحة الكرتونة مع عدد
              البلاطات فيها، لعرض الحساب.
            </p>
          )}
        </TabsContent>

        <TabsContent value="rebar" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="اسم الصنف أو الوصف">
              <Input
                value={rebarName}
                onChange={event => setRebarName(event.target.value)}
                placeholder="مثال: حديد تسليح"
                className="h-10 rounded-xl bg-background"
              />
            </Field>
            <Field
              label="قطر السيخ (مم)"
              hint="الأقطار الشائعة: 8، 10، 12، 16، 22 مم."
            >
              <div className="flex gap-2">
                <select
                  value={diameter}
                  onChange={event => setDiameter(event.target.value)}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {["8", "10", "12", "16", "22"].map(value => (
                    <option key={value} value={value}>
                      {value} مم
                    </option>
                  ))}
                  <option value="custom">قطر آخر</option>
                </select>
                {diameter === "custom" && (
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={customDiameter}
                    onChange={event => setCustomDiameter(event.target.value)}
                    placeholder="مم"
                    className="h-10 w-24 rounded-xl bg-background text-left"
                    dir="ltr"
                  />
                )}
              </div>
            </Field>
            <Field label="عدد الأسياخ">
              <Input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={barCount}
                onChange={event => setBarCount(event.target.value)}
                placeholder="مثال: 20"
                className="h-10 rounded-xl bg-background text-left"
                dir="ltr"
              />
            </Field>
            <Field label="طول السيخ (متر)">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={barLength}
                onChange={event => setBarLength(event.target.value)}
                placeholder="مثال: 12"
                className="h-10 rounded-xl bg-background text-left"
                dir="ltr"
              />
            </Field>
            <Field
              label="الوزن النظري للمتر (كجم) — اختياري"
              hint="إذا تركته فارغًا يُحسب تلقائيًا بالمعادلة: القطر² ÷ 162."
            >
              <Input
                type="number"
                min="0.0001"
                step="0.001"
                inputMode="decimal"
                value={weightPerMeter}
                onChange={event => setWeightPerMeter(event.target.value)}
                placeholder="يُحسب من القطر"
                className="h-10 rounded-xl bg-background text-left"
                dir="ltr"
              />
            </Field>
            <Field
              label="نسبة الهالك (%)"
              hint="تُحسب الزيادة بأسياخ كاملة بالتقريب لأعلى."
            >
              <Input
                type="number"
                min="0"
                max="100"
                step="0.5"
                inputMode="decimal"
                value={rebarWastage}
                onChange={event => setRebarWastage(event.target.value)}
                className="h-10 rounded-xl bg-background text-left"
                dir="ltr"
              />
            </Field>
          </div>

          {rebar ? (
            <div className="space-y-2 rounded-2xl border border-border p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-black text-foreground">النتيجة</h4>
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  <Weight className="h-3 w-3" />
                  وزن محسوب
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <ResultMetric
                  label="عدد الأسياخ قبل الهالك"
                  value={`${showNumber(rebar.requestedBarCount)} سيخ`}
                />
                <ResultMetric
                  label="أسياخ الهالك"
                  value={`${showNumber(rebar.extraBarCount)} سيخ`}
                />
                <ResultMetric
                  label="إجمالي الأسياخ المطلوبة"
                  value={`${showNumber(rebar.totalBarCount)} سيخ`}
                  emphasis
                />
                <ResultMetric
                  label="الأطوال قبل الهالك"
                  value={`${showNumber(rebar.requestedLengthMeters)} م`}
                />
                <ResultMetric
                  label="زيادة طول الهالك"
                  value={`${showNumber(rebar.wastageLengthMeters)} م`}
                />
                <ResultMetric
                  label="إجمالي الأطوال"
                  value={`${showNumber(rebar.totalLengthMeters)} م`}
                  emphasis
                />
                <ResultMetric
                  label="وزن المتر المستخدم"
                  value={`${showNumber(rebar.weightPerMeterKg)} كجم/م`}
                />
                <ResultMetric
                  label="الوزن قبل الهالك"
                  value={`${showNumber(rebar.requestedWeightKg)} كجم`}
                />
                <ResultMetric
                  label="وزن الهالك"
                  value={`${showNumber(rebar.wastageWeightKg)} كجم`}
                />
                <ResultMetric
                  label="الوزن الإجمالي النظري"
                  value={`${showNumber(rebar.totalWeightKg)} كجم · ${showNumber(rebar.totalWeightTons)} طن`}
                  emphasis
                />
              </div>
              <p className="text-[10px] leading-5 text-muted-foreground">
                {weightPerMeter
                  ? "تم استخدام وزن المتر الذي أدخلته. الوزن الفعلي يُراجع بمواصفات المورد والميزان."
                  : "الوزن النظري محسوب من القطر بالمعادلة (القطر² ÷ 162)، وقد يختلف الوزن الفعلي حسب المصنع والميزان."}
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs leading-5 text-muted-foreground">
              أدخل عدد الأسياخ وقطرها وطولها لعرض الأطوال والوزن النظري.
            </p>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          type="button"
          size="sm"
          onClick={copyResult}
          disabled={!activeLines.length}
          className="h-9 rounded-xl bg-teal-700 px-3 font-bold text-white hover:bg-teal-800"
        >
          <Copy className="ml-1.5 h-3.5 w-3.5" />
          نسخ النتيجة
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={printResult}
          disabled={!activeLines.length}
          className="h-9 rounded-xl px-3 font-bold"
        >
          <Printer className="ml-1.5 h-3.5 w-3.5" />
          طباعة الحساب
        </Button>
        <span
          className="text-[10px] leading-5 text-muted-foreground"
          aria-live="polite"
        >
          {actionMessage}
        </span>
      </div>
    </div>
  );
}
