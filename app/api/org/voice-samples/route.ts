// app/api/org/voice-samples/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

function cleanString(v: unknown, maxLen = 2000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * GET /api/org/voice-samples
 * Returns up to 50 samples for the current org.
 */
export async function GET() {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { data, error } = await supabase
      .from("org_voice_samples")
      .select("id,sample_text,created_at,updated_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ ok: true, samples: data ?? [] }, { status: 200 });
  } catch (err: any) {
    return jsonError(err?.message ?? "Failed to load voice samples", 500);
  }
}

/**
 * POST /api/org/voice-samples
 * Body: { sample_text: string }
 * Creates a new sample for the current org.
 */
export async function POST(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const body = await req.json().catch(() => ({}));

    const sampleText = cleanString((body as any)?.sample_text, 2000);
    if (!sampleText) return jsonError("sample_text is required", 400);

    const { data, error } = await supabase
      .from("org_voice_samples")
      .insert({ organization_id: organizationId, sample_text: sampleText })
      .select("id,sample_text,created_at,updated_at")
      .single();

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ ok: true, sample: data }, { status: 200 });
  } catch (err: any) {
    return jsonError(err?.message ?? "Failed to create voice sample", 500);
  }
}

/**
 * Legacy PATCH /api/org/voice-samples
 * Body: { id: string, sample_text: string }
 * NOTE: Preferred is PATCH /api/org/voice-samples/:id (see [id]/route.ts),
 * but we keep this for backwards compatibility.
 */
export async function PATCH(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const body = await req.json().catch(() => ({}));

    const id = cleanString((body as any)?.id, 80);
    const sampleText = cleanString((body as any)?.sample_text, 2000);

    if (!id) return jsonError("id is required", 400);
    if (!sampleText) return jsonError("sample_text is required", 400);

    const { data, error } = await supabase
      .from("org_voice_samples")
      .update({ sample_text: sampleText })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select("id,sample_text,created_at,updated_at")
      .single();

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ ok: true, sample: data }, { status: 200 });
  } catch (err: any) {
    return jsonError(err?.message ?? "Failed to update voice sample", 500);
  }
}

/**
 * Legacy DELETE /api/org/voice-samples?id=<uuid>
 * NOTE: Preferred is DELETE /api/org/voice-samples/:id (see [id]/route.ts),
 * but we keep this for backwards compatibility.
 */
export async function DELETE(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const url = new URL(req.url);
    const id = cleanString(url.searchParams.get("id"), 80);

    if (!id) return jsonError("id is required", 400);

    const { error } = await supabase
      .from("org_voice_samples")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    return jsonError(err?.message ?? "Failed to delete voice sample", 500);
  }
}
