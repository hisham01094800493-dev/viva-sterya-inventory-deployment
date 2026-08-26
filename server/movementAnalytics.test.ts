import { buildMovementAnalytics } from "./db";
import { getMovementSeriesTotals } from "../client/src/pages/Home";
import { describe, expect, it } from "vitest";

describe("حركة المخزون عبر الزمن", () => {
  it("يبني الوارد من أذونات الإضافة فقط ويجمع الأذونات ذات التاريخ نفسه", () => {
    const analytics = buildMovementAnalytics(
      {
        additions: [
          { date: "2026-08-20", quantity: "2.500" },
          { date: "2026/08/20", quantity: 1 },
          { date: "2026-08-21", quantity: "4" },
        ],
        disbursements: [{ date: "2026-08-20", quantity: "0.750" }],
        transfers: [{ date: "2026-08-21", quantity: 3 }],
      },
      [],
      20,
    );

    expect(analytics.series).toEqual([
      { date: "2026-08-20", additions: 3.5, disbursements: 0.75, transfers: 0 },
      { date: "2026-08-21", additions: 4, disbursements: 0, transfers: 3 },
    ]);
    expect(analytics.totals).toEqual({ additions: 7.5, disbursements: 0.75, transfers: 3 });
  });

  it("يجعل إجمالي الوارد المعروض مساوياً لمجموع نقاط الرسم المختارة", () => {
    const analytics = buildMovementAnalytics(
      {
        additions: [{ date: "2026-08-19", quantity: 9 }, { date: "2026-08-20", quantity: 2 }, { date: "2026-08-21", quantity: 4 }],
        disbursements: [],
        transfers: [],
      },
      [],
      20,
    );
    expect(getMovementSeriesTotals(analytics.series.slice(-2))).toEqual({ additions: 6, disbursements: 0, transfers: 0 });
  });

  it("يحسب سلسلة مخزن محدد من حركاته الممررة فقط دون خلط مخزن آخر", () => {
    const analytics = buildMovementAnalytics(
      {
        additions: [{ date: "2026-08-20", quantity: 5 }],
        disbursements: [{ date: "2026-08-20", quantity: 2 }],
        transfers: [{ date: "2026-08-21", quantity: 1 }],
      },
      [],
      20,
    );
    expect(analytics.totals).toEqual({ additions: 5, disbursements: 2, transfers: 1 });
    expect(analytics.series).toEqual([
      { date: "2026-08-20", additions: 5, disbursements: 2, transfers: 0 },
      { date: "2026-08-21", additions: 0, disbursements: 0, transfers: 1 },
    ]);
  });
});
