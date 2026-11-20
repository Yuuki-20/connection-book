import "server-only";
import { googleCalendar } from "@/lib/google";
import { decryptGoogleToken } from "@/lib/google-token-crypto";
import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * オーナー個人のGoogleカレンダーとの両方向同期。
 * - アプリ → 個人カレンダー：イベントを作る・直す・消すと、オーナー個人カレンダーにも同じ予定を作る・直す・消す。
 *   どの予定がつながり帳のものかは、Googleの予定の「非公開の追加情報」に tsunagariEventId を入れて見分ける（DBの変更は不要）。
 * - 個人カレンダー → アプリ：オーナー本人がイベント画面を開いたときだけ、個人カレンダーの予定を灰色で表示する（他の部員には見せない）。
 * 個人カレンダーの接続は、設定画面の「個人Googleアカウント」から行う（オーナーはカレンダー権限も一緒に許可する）。
 */

export const OWNER_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events.owned";
const TAG = "tsunagariEventId";

type Db = ReturnType<typeof createAdminClient>;
type Connection = { memberId: string; refreshToken: string };
export type AppEvent = { id: string; name: string; description: string; location: string; startsAt: string; endsAt: string | null; allDay?: boolean };
export type PersonalEvent = { googleEventId: string; name: string; startsAt: string; endsAt: string | null; location: string; allDay: boolean; htmlLink: string | null };

/** カレンダー権限つきで個人Googleアカウントをつないでいる、その部のオーナーたち。 */
export async function ownerCalendarConnections(supabase: Db, clubId: string, onlyMemberId?: string): Promise<Connection[]> {
  let owners = supabase.from("members").select("id").eq("club_id", clubId).eq("access_role", "owner");
  if (onlyMemberId) owners = owners.eq("id", onlyMemberId);
  const ownerResult = await owners;
  if (ownerResult.error) throw ownerResult.error;
  const ids = (ownerResult.data ?? []).map((row: { id: string }) => row.id);
  if (!ids.length) return [];
  const result = await supabase.from("user_google_connections").select("member_id,encrypted_refresh_token,status,scopes").eq("club_id", clubId).in("member_id", ids);
  if (result.error) throw result.error;
  return (result.data ?? [])
    .filter((row: { status: string; scopes: string[] | null }) => row.status === "active" && (row.scopes ?? []).includes(OWNER_CALENDAR_SCOPE))
    .map((row: { member_id: string; encrypted_refresh_token: string }) => ({ memberId: row.member_id, refreshToken: decryptGoogleToken(row.encrypted_refresh_token) }));
}

/** Googleカレンダーに渡す開始・終了。終了がないときは1時間後にする。 */
export function toGoogleTimes(event: Pick<AppEvent, "startsAt" | "endsAt" | "allDay">) {
  const end = event.endsAt ?? new Date(new Date(event.startsAt).getTime() + 60 * 60 * 1000).toISOString();
  if (event.allDay) return { start: { date: event.startsAt.slice(0, 10) }, end: { date: end.slice(0, 10) } };
  return { start: { dateTime: event.startsAt, timeZone: "Asia/Tokyo" }, end: { dateTime: end, timeZone: "Asia/Tokyo" } };
}

async function findTagged(calendar: ReturnType<typeof googleCalendar>, eventId: string) {
  const found = await calendar.events.list({ calendarId: "primary", privateExtendedProperty: [`${TAG}=${eventId}`], maxResults: 5, showDeleted: false });
  return (found.data.items ?? []).filter((item) => item.id && item.status !== "cancelled");
}

/**
 * アプリのイベントを、オーナー個人カレンダーへ反映する。
 * 失敗してもアプリ側の保存は止めない（結果だけ返す）。
 */
export async function pushEventToOwnerCalendars(supabase: Db, clubId: string, event: AppEvent | { id: string }, op: "upsert" | "delete") {
  let connections: Connection[] = [];
  try { connections = await ownerCalendarConnections(supabase, clubId); }
  catch (error) { console.error("owner calendar connections failed", error); return { synced: 0, failed: 1 }; }
  let synced = 0, failed = 0;
  for (const connection of connections) {
    try {
      const calendar = googleCalendar(connection.refreshToken);
      const existing = await findTagged(calendar, event.id);
      if (op === "delete") {
        for (const item of existing) await calendar.events.delete({ calendarId: "primary", eventId: item.id!, sendUpdates: "none" });
      } else {
        const full = event as AppEvent;
        const body = {
          summary: full.name,
          description: `${full.description}${full.description ? "\n\n" : ""}1st Penguin（起業部アプリ）から登録`,
          location: full.location,
          ...toGoogleTimes(full),
          extendedProperties: { private: { [TAG]: full.id } },
        };
        if (existing[0]?.id) await calendar.events.patch({ calendarId: "primary", eventId: existing[0].id, sendUpdates: "none", requestBody: body });
        else await calendar.events.insert({ calendarId: "primary", sendUpdates: "none", requestBody: body });
      }
      synced++;
    } catch (error) {
      failed++;
      console.error("owner calendar sync failed", error);
    }
  }
  return { synced, failed };
}

/** オーナー本人の個人カレンダーの予定（つながり帳から入れた予定は二重に出ないよう除く）。 */
export async function listOwnerPersonalEvents(supabase: Db, member: { id: string; club_id: string; access_role: string }, timeMin: string, timeMax: string): Promise<{ events: PersonalEvent[]; connected: boolean; error?: string }> {
  if (member.access_role !== "owner") return { events: [], connected: false };
  const [connection] = await ownerCalendarConnections(supabase, member.club_id, member.id);
  if (!connection) return { events: [], connected: false };
  try {
    const result = await googleCalendar(connection.refreshToken).events.list({ calendarId: "primary", timeMin, timeMax, singleEvents: true, orderBy: "startTime", maxResults: 250 });
    const events = (result.data.items ?? [])
      .filter((item) => item.id && item.status !== "cancelled" && !item.extendedProperties?.private?.[TAG])
      .map((item) => ({ googleEventId: item.id!, name: item.summary ?? "（タイトルなし）", startsAt: item.start?.dateTime ?? item.start?.date ?? "", endsAt: item.end?.dateTime ?? item.end?.date ?? null, location: item.location ?? "", allDay: Boolean(item.start?.date), htmlLink: item.htmlLink ?? null }))
      .filter((item) => item.startsAt);
    return { events, connected: true };
  } catch (error) {
    return { events: [], connected: true, error: error instanceof Error ? error.message : "個人カレンダーを取得できませんでした。" };
  }
}
