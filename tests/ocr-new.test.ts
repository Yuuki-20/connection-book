import { describe, expect, it } from "vitest";
import { chooseValidValue, decodeCtc, mergeOcrResults } from "@/lib/ocr-new";
import { parseBusinessCardText } from "@/lib/ocr";

describe("試験OCR", () => {
  it("CTCの重複と空白を正しい順で除く", () => {
    const indices = [1, 1, 0, 1, 2, 2, 0];
    const logits = indices.flatMap(index => [0, 1, 2].map(c => c === index ? 1 : 0));
    expect(decodeCtc(logits, indices.length, 3, "あい")).toBe("ああい");
  });
  it.each([
    ["email", "bad", "user@example.com"],
    ["phone", "123", "03-1234-5678"],
    ["website", "wrong", "https://example.com"],
  ] as const)("%s は正しい従来値に戻す", (kind, bad, good) => {
    expect(chooseValidValue(bad, good, kind)).toBe(good);
    expect(chooseValidValue(good, bad, kind)).toBe(good);
    expect(chooseValidValue(bad, "", kind)).toBe(bad);
  });
  it("メール候補と電話を従来結果から補う", () => {
    const preferred = parseBusinessCardText("山田 太郎");
    const fallback = parseBusinessCardText("user@example.com\n03-1234-5678");
    const merged = mergeOcrResults(preferred, fallback);
    expect(merged.emailCandidates[0].value).toBe("user@example.com");
    expect(merged.fields.phone).toBe("03-1234-5678");
    expect(merged.fields.name).toBe(preferred.fields.name);
  });
});
