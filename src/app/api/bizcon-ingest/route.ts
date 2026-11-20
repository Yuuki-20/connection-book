import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * イベント自動収集ボット（Gemini）から、ビジコン情報・支援情報を受け取って登録する。
 * - 認証: Authorization: Bearer <BIZCON_INGEST_TOKEN>（Vercelの環境変数）。未設定なら常に断る。
 * - 登録先のクラブ: BIZCON_CLUB_ID（未設定ならクラブが1つだけのときそのクラブ）。
 * - 投稿者: そのクラブのオーナー。
 * - 同じクラブ・同じ種類で同じURLが既にあれば登録しない（毎週送っても重複しない）。
 */
export const dynamic = "force-dynamic";

const httpUrl = z.string().trim().max(2000).url().regex(/^https?:\/\//i);
const item = z.object({
  kind: z.enum(["contest", "support"]),
  title: z.string().trim().min(1).max(200),
  organizer: z.string().trim().max(200).default(""),
  body: z.string().trim().max(5000).default(""),
  url: httpUrl,
  eventDate: z.string().datetime({ offset: true }).nullable().default(null),
  deadline: z.string().datetime({ offset: true }).nullable().default(null),
  location: z.string().trim().max(300).default(""),
});
const payload = z.object({ items: z.array(item).max(40) });

function authorized(request: Request) {
  const secret = process.env.BIZCON_INGEST_TOKEN ?? "";
  if (secret.length < 32) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  const parsed = payload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_input", details: parsed.error.flatten() }, { status: 400 });

  const supabase = createAdminClient();
  let clubId = process.env.BIZCON_CLUB_ID ?? "";
  if (!clubId) {
    const clubs = await supabase.from("clubs").select("id").limit(2);
    if (clubs.error) return Response.json({ error: "server_error" }, { status: 500 });
    if ((clubs.data ?? []).length !== 1) return Response.json({ error: "set_BIZCON_CLUB_ID" }, { status: 500 });
    clubId = clubs.data![0].id;
  }
  const owner = await supabase.from("members").select("id").eq("club_id", clubId).eq("access_role", "owner").eq("is_active", true).maybeSingle();
  if (owner.error || !owner.data) return Response.json({ error: "owner_not_found" }, { status: 500 });

  const urls = parsed.data.items.map(i => i.url);
  const existing = await supabase.from("business_contests").select("kind,url").eq("club_id", clubId).in("url", urls.length ? urls : [""]);
  if (existing.error) return Response.json({ error: "server_error" }, { status: 500 });
  const seen = new Set((existing.data ?? []).map(r => `${r.kind}|${r.url}`));

  const rows = [];
  for (const i of parsed.data.items) {
    const key = `${i.kind}|${i.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ club_id: clubId, author_member_id: owner.data.id, kind: i.kind, source: "gemini", title: i.title, organizer: i.organizer, body: i.body, url: i.url, event_date: i.eventDate, deadline: i.deadline, location: i.location });
  }
  if (rows.length) {
    const inserted = await supabase.from("business_contests").insert(rows).select("id");
    if (inserted.error) return Response.json({ error: "server_error" }, { status: 500 });
    await supabase.from("audit_logs").insert({ club_id: clubId, actor_member_id: owner.data.id, action: "business_contest_ingested", entity_type: "business_contest", entity_id: null, metadata: { count: rows.length } });
  }
  return Response.json({ ok: true, inserted: rows.length, skipped: parsed.data.items.length - rows.length }, { headers: { "Cache-Control": "no-store" } });
}
