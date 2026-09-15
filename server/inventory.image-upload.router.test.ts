import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { uploadItemImage } from "./itemImageUpload";

vi.mock("./itemImageUpload", () => ({ uploadItemImage: vi.fn() }));
vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getUserPermissionSettings: vi.fn().mockResolvedValue({ allowedScreens: ["inventory"], allowedReports: [], allowedWarehouseIds: [], readOnly: false }),
    getItemById: vi.fn().mockResolvedValue({ id: 7, warehouseId: 1 }),
  };
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(): TrpcContext {
  const now = new Date();
  const user: AuthenticatedUser = {
    id: 1,
    openId: "image-user",
    email: "image@example.com",
    name: "Image User",
    loginMethod: "manus",
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
  return { user, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] };
}

describe("items.uploadImage tRPC mutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("يتطلب تسجيل الدخول", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(caller.items.uploadImage({ itemId: 7, fileName: "item.png", contentType: "image/png", dataBase64: "data:image/png;base64,aW1hZ2U=" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("يربط نتيجة الرفع بسجل الصنف عبر الراوتر", async () => {
    vi.mocked(uploadItemImage).mockResolvedValue({ id: 7, imageKey: "items/7/item.png", imageUrl: "/manus-storage/items/7/item.png" } as any);
    const caller = appRouter.createCaller(createContext());
    const input = { itemId: 7, fileName: "item.png", contentType: "image/png" as const, dataBase64: "data:image/png;base64,aW1hZ2U=" };
    const result = await caller.items.uploadImage(input);
    expect(result).toEqual({ id: 7, imageKey: "items/7/item.png", imageUrl: "/manus-storage/items/7/item.png" });
    expect(uploadItemImage).toHaveBeenCalledWith(input);
  });
});
