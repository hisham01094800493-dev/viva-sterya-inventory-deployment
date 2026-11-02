import { describe, expect, it } from "vitest";
import {
  emptyDraft,
  getLocalDraftStorageKey,
  hasLocalDraftContent,
  makeLocalDraft,
  readLocalDrafts,
  upsertLocalDraft,
  writeLocalDrafts,
  type LocalDraft,
} from "./localDrafts";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    values,
  };
}

const savedDraft: LocalDraft = {
  ...emptyDraft,
  title: "ملاحظة محفوظة",
  body: "المحتوى القديم",
  id: "draft-1",
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

describe("local note drafts", () => {
  it("keeps each user's drafts under a separate local storage key", () => {
    expect(getLocalDraftStorageKey(7)).not.toBe(getLocalDraftStorageKey(8));
    expect(getLocalDraftStorageKey(undefined)).toContain(":guest");
  });

  it("treats a blank default form as not yet worth saving", () => {
    expect(hasLocalDraftContent(emptyDraft)).toBe(false);
    expect(hasLocalDraftContent({ ...emptyDraft, body: "نص جديد" })).toBe(true);
    expect(
      hasLocalDraftContent({
        ...emptyDraft,
        handwriting: "data:image/png;base64,pen",
      })
    ).toBe(true);
    expect(
      hasLocalDraftContent({
        ...emptyDraft,
        image: "data:image/jpeg;base64,image",
      })
    ).toBe(true);
  });

  it("updates an existing draft without changing its identity or creation date", () => {
    const next = makeLocalDraft({
      form: { ...emptyDraft, title: "ملاحظة محفوظة", body: "تعديل" },
      drafts: [savedDraft],
      editingId: savedDraft.id,
      now: "2026-11-02T10:00:00.000Z",
      newId: "should-not-be-used",
    });
    expect(next.id).toBe(savedDraft.id);
    expect(next.createdAt).toBe(savedDraft.createdAt);
    expect(next.updatedAt).toBe("2026-11-02T10:00:00.000Z");
    expect(upsertLocalDraft([savedDraft], next)).toEqual([next]);
  });

  it("recovers saved drafts after reloading from the same browser storage", () => {
    const storage = createStorage();
    expect(writeLocalDrafts("notes:user-7", [savedDraft], storage)).toBe(true);
    expect(readLocalDrafts("notes:user-7", storage)).toEqual([savedDraft]);
  });

  it("preserves handwriting and image attachments when autosaving an edit", () => {
    const next = makeLocalDraft({
      form: {
        ...savedDraft,
        handwriting: "data:image/png;base64,pen",
        image: "data:image/jpeg;base64,image",
        imageName: "صورة الموقع.jpg",
      },
      drafts: [savedDraft],
      editingId: savedDraft.id,
      now: "2026-11-02T11:00:00.000Z",
      newId: "should-not-be-used",
    });
    const storage = createStorage();
    const nextDrafts = upsertLocalDraft([savedDraft], next);
    expect(writeLocalDrafts("notes:user-7", nextDrafts, storage)).toBe(true);
    expect(readLocalDrafts("notes:user-7", storage)[0]).toMatchObject({
      id: savedDraft.id,
      handwriting: "data:image/png;base64,pen",
      image: "data:image/jpeg;base64,image",
      imageName: "صورة الموقع.jpg",
    });
  });

  it("does not report a failed local write as successful", () => {
    const storage = {
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(writeLocalDrafts("notes:user-7", [savedDraft], storage)).toBe(false);
  });

  it("returns an empty list for malformed saved JSON instead of crashing the page", () => {
    const storage = { getItem: () => "not-json" };
    expect(readLocalDrafts("notes:user-7", storage)).toEqual([]);
  });
});
