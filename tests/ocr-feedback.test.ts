import { describe, expect, it } from "vitest";
import { buildOcrFeedback, feedbackSchema } from "../src/lib/ocr-feedback";

describe("OCR feedback", () => {
  it("文字を含めず種類・文字数・編集距離を記録する", () => {
    const [item] = buildOcrFeedback({ name: "山田 太郎" }, { name: "山田 花子" });
    expect(item).toEqual({ field: "name", engine: "gemini", changed: true, edit_distance: 2, len_before: 5, len_after: 5, char_classes_before: "漢2空1漢2", char_classes_after: "漢2空1漢2" });
    expect(JSON.stringify(item)).not.toContain("山田");
  });
  it("任意の文字列や余分な項目を拒否する", () => {
    const items = buildOcrFeedback({ name: "A" }, { name: "B" });
    expect(feedbackSchema.safeParse({ items }).success).toBe(true);
    expect(feedbackSchema.safeParse({ items: [{ ...items[0], raw: "個人情報" }] }).success).toBe(false);
    expect(feedbackSchema.safeParse({ items: [{ ...items[0], char_classes_before: "個人情報" }] }).success).toBe(false);
    expect(feedbackSchema.safeParse({ items, rawText: "個人情報" }).success).toBe(false);
  });
});
