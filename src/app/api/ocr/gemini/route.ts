import { assertSameOrigin, requireMember } from "@/lib/server-auth";
import { geminiFields, parseGeminiFields } from "@/lib/gemini-ocr";

const limit = new Map<string, number[]>();
const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { member } = await requireMember(request);
    const now = Date.now();
    for (const [id, times] of limit) if (times.every((time) => time <= now - 60_000)) limit.delete(id);
    const times = (limit.get(member.id) ?? []).filter((time) => time > now - 60_000);
    // 幹部（オーナー・管理者）は名刺登録が多いので枠を広げる。
    const isLeader = member.role === "owner" || member.role === "admin" || member.is_admin === true;
    const perMinute = isLeader ? 30 : 10;
    if (times.length >= perMinute) return Response.json({ error: "rate_limited" }, { status: 429 });
    times.push(now); limit.set(member.id, times);
    let form: FormData;
    try { form = await request.formData(); } catch { return Response.json({ error: "invalid_input" }, { status: 400 }); }
    const images = form.getAll("image");
    const image = images[0];
    if (images.length !== 1 || !(image instanceof File) || !allowed.has(image.type) || image.size === 0 || image.size > 8 * 1024 * 1024 || [...form.keys()].some((key) => key !== "image")) {
      return Response.json({ error: "invalid_input" }, { status: 400 });
    }
    const key = process.env.GEMINI_API_KEY;
    if (!key) return Response.json({ error: "not_configured" }, { status: 503 });
    const model = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({ contents: [{ parts: [{ text: "名刺の写真です。書かれている文字だけを項目に入れる。無い項目は空文字。推測で補わない。電話番号は書かれている通り。" }, { inline_data: { mime_type: image.type, data: Buffer.from(await image.arrayBuffer()).toString("base64") } }] }], generationConfig: { responseMimeType: "application/json", responseSchema: { type: "OBJECT", properties: Object.fromEntries(geminiFields.map((field) => [field, { type: "STRING" }])), required: geminiFields } } }),
    });
    if (!response.ok) throw new Error("Gemini failed");
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    return Response.json(parseGeminiFields(JSON.parse(text)));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "gemini_failed" }, { status: 502 });
  }
}
