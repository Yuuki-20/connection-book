import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ requireMember: vi.fn(), assertSameOrigin: vi.fn() }));
vi.mock("@/lib/server-auth", () => auth);
import { POST } from "../src/app/api/ocr/gemini/route";
import { geminiFields, geminiToOcrResult, parseGeminiFields } from "@/lib/gemini-ocr";

const fields = Object.fromEntries(geminiFields.map((key) => [key, ""]));
function request(files: Blob[] = [new Blob(["image"], { type: "image/jpeg" })]) {
  const form = new FormData(); for (const file of files) form.append("image", file, "card.jpg");
  return new Request("https://example.com/api/ocr/gemini", { method: "POST", body: form });
}
beforeEach(() => { vi.resetAllMocks(); auth.requireMember.mockResolvedValue({ member: { id: crypto.randomUUID() } }); delete process.env.GEMINI_API_KEY; });
afterEach(() => { vi.unstubAllGlobals(); delete process.env.GEMINI_API_KEY; });
describe("Gemini OCR", () => {
  it("rejects missing, multiple, unsupported and oversized images", async () => {
    for (const images of [[], [new Blob(["x"], { type: "image/gif" })], [new Blob(["x"], { type: "image/png" }), new Blob(["y"], { type: "image/png" })], [new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: "image/png" })]]) {
      expect((await POST(request(images))).status).toBe(400);
    }
  });
  it("returns 503 when the key is missing", async () => { const response = await POST(request()); expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "not_configured" }); });
  it("converts a mocked Gemini response into confirmation fields", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const values = { ...fields, name: "山田 太郎", company: "会社", department: "営業部", title: "部長", email: "taro@example.com", mobile: "090-1234-5678" };
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify(values) }] } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(request());
    expect(response.status).toBe(200);
    const result = geminiToOcrResult(parseGeminiFields(await response.json()));
    expect(result.fields).toMatchObject({ name: "山田 太郎", role: "営業部 部長", phone: "090-1234-5678" });
    expect(result.emailCandidates[0].value).toBe("taro@example.com");
    expect(fetchMock.mock.calls[0][1].headers["x-goog-api-key"]).toBe("test-key");
  });
  it("returns 502 for invalid Gemini responses", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ candidates: [] })));
    const response = await POST(request()); expect(response.status).toBe(502); expect(await response.json()).toEqual({ error: "gemini_failed" });
  });
  it("limits each member to ten requests per minute", async () => {
    auth.requireMember.mockResolvedValue({ member: { id: crypto.randomUUID() } });
    for (let i = 0; i < 10; i++) expect((await POST(request())).status).toBe(503);
    expect((await POST(request())).status).toBe(429);
  });
});
