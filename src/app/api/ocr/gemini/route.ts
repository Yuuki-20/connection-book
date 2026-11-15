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
    // 精度優先で Flash を先に使い、無料枠の上限や未提供なら Flash-Lite に切り替える。
    const models = [...new Set([process.env.GEMINI_MODEL, "gemini-flash-latest", "gemini-flash-lite-latest"].filter(Boolean) as string[])];
    const imageData = Buffer.from(await image.arrayBuffer()).toString("base64");
    const prompt = [
      "これは日本の名刺の写真です。名刺に印刷されている文字を、一文字ずつ正確に読み取って各項目に入れてください。",
      "・name: 人の氏名（いちばん大きく書かれていることが多い。姓と名の間は半角スペース1つ）。会社名や役職は入れない。",
      "・nameKana: 氏名の読み（ふりがな・ローマ字表記があればそのまま）。",
      "・company: 会社・団体・学校名。department: 部署。title: 役職。",
      "・phone: 固定電話（TEL・電話・℡・代表など）。mobile: 携帯（090/080/070 など、Mobile・携帯）。fax: FAX。番号は数字とハイフンだけにし、全角は半角にする。",
      "・email, website, postalCode（〒の後の数字）, address（都道府県から）。",
      "書かれていない項目は空文字。推測で補ったり、別の項目の文字を入れたりしない。",
    ].join("\n");
    let text: string | undefined;
    const failures: string[] = [];
    const schema = { type: "OBJECT", properties: Object.fromEntries(geminiFields.map((field) => [field, { type: "STRING" }])), required: geminiFields };
    for (const model of models) {
      // 高解像度指定に対応していないモデルもあるので、400 のときは指定なしでもう一度試す。
      for (const highRes of [true, false]) {
        const generationConfig = { temperature: 0, responseMimeType: "application/json", responseSchema: schema, ...(highRes ? { mediaResolution: "MEDIA_RESOLUTION_HIGH" } : {}) };
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, signal: AbortSignal.timeout(25_000),
          body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: image.type, data: imageData } }, { text: prompt }] }], generationConfig }),
        });
        if (!response.ok) {
          failures.push(`${model}:${response.status}`);
          if (response.status === 400 && highRes) continue;
          break;
        }
        const data = await response.json();
        text = data.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => typeof part.text === "string")?.text;
        if (!text) failures.push(`${model}:empty`);
        break;
      }
      if (text) break;
    }
    if (!text) return Response.json({ error: "gemini_failed", detail: failures.join(",") }, { status: 502 });
    return Response.json(parseGeminiFields(JSON.parse(text)));
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "gemini_failed", detail: error instanceof Error ? error.name : "unknown" }, { status: 502 });
  }
}
