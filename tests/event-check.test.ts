import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/browser", () => ({ createClient: () => ({}) }));
import { isEventStale } from "@/components/capture-wizard";

describe("今のイベントの確認", () => {
  const now = new Date("2026-11-21T12:00:00+09:00");
  it("当日・前日のイベントは確認しない", () => {
    expect(isEventStale("2026-11-21T09:00:00+09:00", now)).toBe(false);
    expect(isEventStale("2026-11-20T18:00:00+09:00", now)).toBe(false);
  });
  it("日付が離れたイベントは撮る前に確認する", () => {
    expect(isEventStale("2026-11-11T18:00:00+09:00", now)).toBe(true);
    expect(isEventStale("2026-12-01T18:00:00+09:00", now)).toBe(true);
  });
  it("日付のないイベントは確認しない", () => {
    expect(isEventStale(null, now)).toBe(false);
  });
});
