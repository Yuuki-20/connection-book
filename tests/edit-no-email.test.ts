import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("メールアドレスがない名刺の編集", () => {
  it("編集の保存でもメール欄の空欄を受け付け、空欄はnullで保存する", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/app/route.ts"), "utf8");
    const page = readFileSync(join(process.cwd(), "src/app/contacts/[id]/page.tsx"), "utf8");
    expect(route).toMatch(/update_contact"\), id: z\.string\(\)\.uuid\(\).*email: z\.union\(\[z\.literal\(""\)/);
    expect(route).toContain("email: input.email || null");
    expect(page).toContain('email:form.email??""');
  });
});
