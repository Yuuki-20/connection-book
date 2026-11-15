import { extractEmailCandidates, type BusinessCardOcrResult } from "@/lib/ocr";

export const geminiFields = ["company", "department", "title", "name", "nameKana", "phone", "mobile", "fax", "email", "website", "postalCode", "address"] as const;
export type GeminiFields = Record<(typeof geminiFields)[number], string>;

export function parseGeminiFields(value: unknown): GeminiFields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid response");
  const record = value as Record<string, unknown>;
  if (geminiFields.some((key) => typeof record[key] !== "string")) throw new Error("Invalid response");
  return Object.fromEntries(geminiFields.map((key) => [key, record[key]])) as GeminiFields;
}

export function geminiToOcrResult(value: GeminiFields): BusinessCardOcrResult {
  const notes = [["フリガナ", value.nameKana], ["携帯", value.mobile], ["FAX", value.fax]].filter(([, text]) => text).map(([label, text]) => `${label}: ${text}`).join("\n");
  return {
    rawText: "", normalizedText: "",
    fields: { name: value.name, company: value.company, role: [value.department, value.title].filter(Boolean).join(" "), phone: value.phone || value.mobile, address: [value.postalCode, value.address].filter(Boolean).join(" "), website: value.website, notes },
    emailCandidates: extractEmailCandidates(value.email),
  };
}
