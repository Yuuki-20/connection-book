import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
import { ownerNeeds2FA, trustedDeviceKey, trustTokenFromRequest } from "@/lib/server-auth";

const TOKEN = "a".repeat(43);
const owner = { id: "m1", club_id: "c1", access_role: "owner" };

/** テスト用の偽Supabase。owner_2fa_verifications の検索で、auth_session_id ごとに見つかるかを決める。 */
function fakeDb(found: { device?: boolean; session?: boolean; registered?: boolean }) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const q = {
        select: () => q, eq: (k: string, v: unknown) => { filters[k] = v; return q; },
        not: () => q, gt: () => q, gte: () => q, limit: () => q,
        maybeSingle: async () => {
          if (table === "owner_2fa_emails") return { data: found.registered === false ? null : { id: "e" }, error: null };
          const key = String(filters.auth_session_id ?? "");
          const hit = key.startsWith("device:") ? found.device : found.session;
          return { data: hit ? { id: "v" } : null, error: null };
        },
      };
      return q;
    },
  } as never;
}
const req = (cookie?: string) => new Request("https://x.test", { headers: cookie ? { cookie } : {} });

describe("オーナー端末の記憶（180日）", () => {
  it("cookieからトークンを取り出し、形がおかしいものは無視する", () => {
    expect(trustTokenFromRequest(req(`foo=1; cb_owner_trust=${TOKEN}`))).toBe(TOKEN);
    expect(trustTokenFromRequest(req("cb_owner_trust=short"))).toBeNull();
    expect(trustTokenFromRequest(req())).toBeNull();
    expect(trustedDeviceKey(TOKEN)).toMatch(/^device:[0-9a-f]{64}$/);
  });
  it("記憶済みの端末ならコードは要らない", async () => {
    expect(await ownerNeeds2FA(fakeDb({ device: true }), owner, "s1", req(`cb_owner_trust=${TOKEN}`))).toBe(false);
  });
  it("記憶が期限切れ・取り消し済みで、今のログインも未確認ならコードが要る", async () => {
    expect(await ownerNeeds2FA(fakeDb({ device: false, session: false }), owner, "s1", req(`cb_owner_trust=${TOKEN}`))).toBe(true);
  });
  it("cookieがなくても、今のログインで確認済みなら従来どおり通す", async () => {
    expect(await ownerNeeds2FA(fakeDb({ session: true }), owner, "s1", req())).toBe(false);
    expect(await ownerNeeds2FA(fakeDb({ session: false }), owner, "s1", req())).toBe(true);
  });
  it("オーナー以外・個人メール未登録は対象外", async () => {
    expect(await ownerNeeds2FA(fakeDb({}), { ...owner, access_role: "member" }, "s1", req())).toBe(false);
    expect(await ownerNeeds2FA(fakeDb({ registered: false }), owner, "s1", req())).toBe(false);
  });
});
