import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ createDraft: vi.fn(), requireMember: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ assertSameOrigin: vi.fn(), requireMember: mocks.requireMember, asAccessRole: (role: string) => role }));
vi.mock("@/lib/google", () => ({ createGmailDraft: mocks.createDraft }));
vi.mock("@/lib/google-token-crypto", () => ({ decryptGoogleToken: vi.fn() }));
vi.mock("@/lib/recipient", () => ({ isAllowedRecipient: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/membership", () => ({ canViewContactDetails: vi.fn().mockReturnValue(true) }));
import { POST } from "../src/app/api/gmail/draft/route";

const contactId = "4b83d4a9-f7d3-43ad-ae39-7735f8de7549";
function request(quickMode: boolean) {
  return new Request("https://app.example.jp/api/gmail/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contactId, recipientEmail: "person@example.jp", subject: "御礼", body: "本文", quickMode }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  const contact = { id: contactId, classification: "important", gmail_draft_id: "existing-draft" };
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ eq: () => ({ single: async () => ({ data: contact }) }) }) }) }));
  mocks.requireMember.mockResolvedValue({ member: { id: "member", club_id: "club" }, supabase: { from } });
});
describe("クイック登録の下書き防止", () => {
  it("既存の重要人物への併合でもクイックの下書き要求を拒否する", async () => {
    const response = await POST(request(true));
    expect(response.status).toBe(400);
    expect(mocks.createDraft).not.toHaveBeenCalled();
  });
  it("通常の重要登録は既存の下書きを再利用できる", async () => {
    const response = await POST(request(false));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reused: true });
  });
});
