export type DraftKind = "note" | "movement";

export type DraftForm = {
  kind: DraftKind;
  title: string;
  body: string;
  movementType: string;
  itemCode: string;
  quantity: string;
  counterparty: string;
  warehouse: string;
  handwriting: string;
  image: string;
  imageName: string;
};

export type LocalDraft = DraftForm & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

export const emptyDraft: DraftForm = {
  kind: "note",
  title: "",
  body: "",
  movementType: "addition",
  itemCode: "",
  quantity: "",
  counterparty: "",
  warehouse: "",
  handwriting: "",
  image: "",
  imageName: "",
};

const storagePrefix = "viva-sterya-local-drafts";

export function getLocalDraftStorageKey(userId: number | undefined) {
  return `${storagePrefix}:${userId ?? "guest"}`;
}

export function getDefaultDraftTitle(kind: DraftKind) {
  return kind === "note" ? "ملاحظة جديدة" : "مسودة إذن مخزني";
}

export function readLocalDrafts(
  key: string,
  storage?: Pick<Storage, "getItem">
): LocalDraft[] {
  if (!storage && typeof window === "undefined") return [];
  try {
    const raw = (storage ?? window.localStorage).getItem(key);
    const parsed: unknown = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    const now = new Date().toISOString();
    return parsed
      .filter(
        (draft): draft is Partial<LocalDraft> =>
          Boolean(draft) &&
          typeof draft === "object" &&
          typeof (draft as { id?: unknown }).id === "string"
      )
      .map(draft => ({
        ...emptyDraft,
        ...draft,
        id: String(draft.id),
        createdAt: draft.createdAt ?? now,
        updatedAt: draft.updatedAt ?? draft.createdAt ?? now,
      }));
  } catch {
    return [];
  }
}

export function hasLocalDraftContent(form: DraftForm) {
  const title = form.title.trim();
  const hasCustomTitle = title && title !== getDefaultDraftTitle(form.kind);
  return Boolean(
    hasCustomTitle ||
      form.body.trim() ||
      form.itemCode.trim() ||
      form.quantity.trim() ||
      form.counterparty.trim() ||
      form.warehouse.trim() ||
      form.handwriting ||
      form.image
  );
}

export function makeLocalDraft(input: {
  form: DraftForm;
  drafts: LocalDraft[];
  editingId: string | null;
  now: string;
  newId: string;
}): LocalDraft {
  const existing = input.editingId
    ? input.drafts.find(draft => draft.id === input.editingId)
    : undefined;
  return {
    ...input.form,
    title: input.form.title.trim() || getDefaultDraftTitle(input.form.kind),
    body: input.form.body,
    id: input.editingId ?? input.newId,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
}

export function upsertLocalDraft(drafts: LocalDraft[], draft: LocalDraft) {
  const index = drafts.findIndex(item => item.id === draft.id);
  if (index === -1) return [draft, ...drafts];
  return drafts.map(item => (item.id === draft.id ? draft : item));
}

export function writeLocalDrafts(
  key: string,
  drafts: LocalDraft[],
  storage?: Pick<Storage, "setItem">
) {
  if (!storage && typeof window === "undefined") return false;
  try {
    (storage ?? window.localStorage).setItem(key, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

export function getLocalDraftSignature(
  key: string,
  draftId: string | null,
  form: DraftForm
) {
  return `${key}:${draftId ?? "new"}:${JSON.stringify(form)}`;
}
