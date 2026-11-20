import { z } from "zod";
import type { ContactInput } from "./domain";

const fields = ["name", "company", "role", "email", "phone", "address", "website"] as const;
const classes = /^(?:(?:漢|ひ|カ|英|数|空|記|他)[1-9][0-9]{0,3})*$/u;
const count = z.number().int().min(0).max(4000);
const itemSchema = z.strictObject({
  field: z.enum(fields), engine: z.enum(["tesseract","gemini"]), changed: z.boolean(),
  edit_distance: count, len_before: count, len_after: count,
  char_classes_before: z.string().max(8000).regex(classes), char_classes_after: z.string().max(8000).regex(classes),
}).refine((item) => {
  const length = (s: string) => [...s.matchAll(/[0-9]+/g)].reduce((sum, m) => sum + Number(m[0]), 0);
  return length(item.char_classes_before) === item.len_before && length(item.char_classes_after) === item.len_after &&
    item.edit_distance >= Math.abs(item.len_before - item.len_after) && item.edit_distance <= Math.max(item.len_before, item.len_after) &&
    item.changed === (item.edit_distance > 0);
});
export const feedbackSchema = z.strictObject({ items: z.array(itemSchema).min(1).max(fields.length) }).refine(({ items }) => new Set(items.map(x => x.field)).size === items.length);

function characterClass(char: string) {
  if (/\p{Script=Han}/u.test(char)) return "漢";
  if (/\p{Script=Hiragana}/u.test(char)) return "ひ";
  if (/\p{Script=Katakana}/u.test(char)) return "カ";
  if (/[a-zA-Z]/.test(char)) return "英";
  if (/\p{N}/u.test(char)) return "数";
  if (/\s/u.test(char)) return "空";
  if (/[\p{P}\p{S}]/u.test(char)) return "記";
  return "他";
}
function signature(chars: string[]) {
  const runs: { kind: string; length: number }[] = [];
  for (const char of chars) {
    const kind = characterClass(char), last = runs.at(-1);
    if (last?.kind === kind) last.length++; else runs.push({ kind, length: 1 });
  }
  return runs.map(x => `${x.kind}${x.length}`).join("");
}
function distance(a: string[], b: string[]) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = row;
  }
  return prev[b.length];
}
export function buildOcrFeedback(before: Partial<ContactInput>, after: Partial<ContactInput>) {
  return fields.map(field => {
    const a = Array.from(before[field] ?? ""), b = Array.from(after[field] ?? "");
    return { field, engine: "gemini" as const, changed: (before[field] ?? "") !== (after[field] ?? ""), edit_distance: distance(a, b), len_before: a.length, len_after: b.length, char_classes_before: signature(a), char_classes_after: signature(b) };
  });
}
