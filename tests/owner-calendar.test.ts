import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
const insert = vi.fn(async () => ({ data: {} })), patch = vi.fn(async () => ({ data: {} })), del = vi.fn(async () => ({ data: {} }));
let tagged: Array<{ id: string; status?: string; extendedProperties?: unknown; summary?: string; start?: unknown; end?: unknown }> = [];
vi.mock("@/lib/google", () => ({ googleCalendar: () => ({ events: { list: vi.fn(async () => ({ data: { items: tagged } })), insert, patch, delete: del } }) }));
vi.mock("@/lib/google-token-crypto", () => ({ decryptGoogleToken: (v: string) => v }));
import { listOwnerPersonalEvents, OWNER_CALENDAR_SCOPE, pushEventToOwnerCalendars, toGoogleTimes } from "@/lib/owner-calendar";

/** members と user_google_connections だけ返す偽Supabase。 */
function fakeDb(scopes: string[]) {
  return {
    from(table: string) {
      const rows = table === "members" ? [{ id: "owner1" }] : [{ member_id: "owner1", encrypted_refresh_token: "tok", status: "active", scopes }];
      const q: Record<string, unknown> = {};
      for (const k of ["select", "eq", "in"]) q[k] = () => q;
      q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error: null });
      return q;
    },
  } as never;
}
const event = { id: "e1", name: "定例会", description: "", location: "部室", startsAt: "2026-12-01T09:00:00.000Z", endsAt: "2026-12-01T10:00:00.000Z" };

describe("オーナー個人カレンダー同期", () => {
  it("カレンダー権限がないと何もしない", async () => {
    insert.mockClear(); tagged = [];
    expect(await pushEventToOwnerCalendars(fakeDb([]), "c1", event, "upsert")).toEqual({ synced: 0, failed: 0 });
    expect(insert).not.toHaveBeenCalled();
  });
  it("新しいイベントは個人カレンダーに作り、印（tsunagariEventId）を付ける", async () => {
    insert.mockClear(); tagged = [];
    expect(await pushEventToOwnerCalendars(fakeDb([OWNER_CALENDAR_SCOPE]), "c1", event, "upsert")).toEqual({ synced: 1, failed: 0 });
    expect(JSON.stringify(insert.mock.calls[0])).toContain("tsunagariEventId");
  });
  it("既にある予定は直し、削除なら消す", async () => {
    patch.mockClear(); del.mockClear(); tagged = [{ id: "g1" }];
    await pushEventToOwnerCalendars(fakeDb([OWNER_CALENDAR_SCOPE]), "c1", event, "upsert");
    expect(patch).toHaveBeenCalledTimes(1);
    await pushEventToOwnerCalendars(fakeDb([OWNER_CALENDAR_SCOPE]), "c1", { id: "e1" }, "delete");
    expect(del).toHaveBeenCalledTimes(1);
  });
  it("個人カレンダーの予定はオーナーだけに返し、つながり帳から入れた予定は除く", async () => {
    tagged = [{ id: "p1", summary: "バイト", start: { dateTime: "2026-12-02T09:00:00+09:00" }, end: { dateTime: "2026-12-02T12:00:00+09:00" } }, { id: "p2", summary: "定例会", extendedProperties: { private: { tsunagariEventId: "e1" } }, start: { dateTime: "2026-12-01T18:00:00+09:00" } }];
    const result = await listOwnerPersonalEvents(fakeDb([OWNER_CALENDAR_SCOPE]), { id: "owner1", club_id: "c1", access_role: "owner" }, "2026-11-01T00:00:00Z", "2026-12-31T00:00:00Z");
    expect(result.events.map((e) => e.googleEventId)).toEqual(["p1"]);
    expect((await listOwnerPersonalEvents(fakeDb([OWNER_CALENDAR_SCOPE]), { id: "m2", club_id: "c1", access_role: "member" }, "a", "b")).events).toEqual([]);
  });
  it("終了がないときは1時間後にする", () => {
    expect(toGoogleTimes({ startsAt: "2026-12-01T09:00:00.000Z", endsAt: null }).end).toEqual({ dateTime: "2026-12-01T10:00:00.000Z", timeZone: "Asia/Tokyo" });
  });
});
