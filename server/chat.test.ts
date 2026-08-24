import { describe, expect, it } from "vitest";

type Conversation = { id: number; type: "general" | "private"; memberIds: number[]; isArchived?: boolean };

function canAccessConversation(conversation: Conversation, userId: number) {
  return !conversation.isArchived && (conversation.type === "general" || conversation.memberIds.includes(userId));
}

function canModerateChat(userRole: string) {
  return userRole === "admin";
}

function normalizeParticipants(currentUserId: number, participantIds: number[]) {
  return Array.from(new Set([currentUserId, ...participantIds]));
}

function isValidChatAttachment(mime: string, size: number) {
  return ["image/jpeg", "image/png", "image/webp", "application/pdf", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"].includes(mime) && size > 0 && size <= 8 * 1024 * 1024;
}

function getReceiptIndicator(receipt: { deliveredCount: number; readCount: number }) {
  if (receipt.readCount > 0) return { icon: "✓✓", label: "تم العرض" };
  if (receipt.deliveredCount > 0) return { icon: "✓", label: "تم الاستلام" };
  return { icon: "…", label: "جاري الإرسال" };
}

function shouldCleanupChatMessage(createdAt: Date, now: Date, olderThanDays = 30) {
  const cutoff = new Date(now.getTime() - Math.max(30, olderThanDays) * 24 * 60 * 60 * 1000);
  return createdAt.getTime() <= cutoff.getTime();
}

describe("chat privacy policy", () => {
  it("allows every authenticated user into general chat but private chat members only", () => {
    const general: Conversation = { id: 1, type: "general", memberIds: [] };
    const privateChat: Conversation = { id: 2, type: "private", memberIds: [7, 9] };
    expect(canAccessConversation(general, 22)).toBe(true);
    expect(canAccessConversation(privateChat, 7)).toBe(true);
    expect(canAccessConversation(privateChat, 22)).toBe(false);
  });

  it("blocks archived conversations", () => {
    expect(canAccessConversation({ id: 1, type: "general", memberIds: [], isArchived: true }, 7)).toBe(false);
  });

  it("allows moderation only to the general admin role", () => {
    expect(canModerateChat("admin")).toBe(true);
    expect(canModerateChat("manager")).toBe(false);
    expect(canModerateChat("user")).toBe(false);
  });

  it("always includes the creator and removes duplicate participants", () => {
    expect(normalizeParticipants(7, [9, 9, 7])).toEqual([7, 9]);
  });

  it("accepts supported image and PDF attachments up to 8 MB", () => {
    expect(isValidChatAttachment("image/png", 1024)).toBe(true);
    expect(isValidChatAttachment("application/pdf", 8 * 1024 * 1024)).toBe(true);
    expect(isValidChatAttachment("audio/webm", 300_000)).toBe(true);
    expect(isValidChatAttachment("text/html", 1024)).toBe(false);
    expect(isValidChatAttachment("application/pdf", 8 * 1024 * 1024 + 1)).toBe(false);
  });

  it("prioritizes read status over delivered status for the sender indicator", () => {
    expect(getReceiptIndicator({ deliveredCount: 0, readCount: 0 })).toEqual({ icon: "…", label: "جاري الإرسال" });
    expect(getReceiptIndicator({ deliveredCount: 2, readCount: 0 })).toEqual({ icon: "✓", label: "تم الاستلام" });
    expect(getReceiptIndicator({ deliveredCount: 2, readCount: 1 })).toEqual({ icon: "✓✓", label: "تم العرض" });
  });

  it("cleans only messages at least 30 days old", () => {
    const now = new Date("2026-08-20T00:00:00.000Z");
    expect(shouldCleanupChatMessage(new Date("2026-07-20T00:00:00.000Z"), now)).toBe(true);
    expect(shouldCleanupChatMessage(new Date("2026-07-22T00:00:00.000Z"), now)).toBe(false);
    expect(shouldCleanupChatMessage(new Date("2026-08-19T00:00:00.000Z"), now, 7)).toBe(false);
  });
});

export { canAccessConversation, canModerateChat, normalizeParticipants, isValidChatAttachment, getReceiptIndicator, shouldCleanupChatMessage };
