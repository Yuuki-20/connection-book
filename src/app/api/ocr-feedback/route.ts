import { apiError } from "@/lib/api-error";
import { feedbackSchema } from "@/lib/ocr-feedback";
import { assertSameOrigin, requireMember } from "@/lib/server-auth";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { user, supabase } = await requireMember(request);
    const input = feedbackSchema.safeParse(await request.json());
    if (!input.success) return Response.json({ error: "invalid_input" }, { status: 400 });
    const { error } = await supabase.from("ocr_feedback").insert({ user_id: user.id, items: input.data.items });
    if (error) throw error;
    return Response.json({ ok: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error); }
}
