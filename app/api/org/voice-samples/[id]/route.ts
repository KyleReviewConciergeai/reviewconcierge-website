// app/api/org/voice-samples/[id]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

function cleanString(v: unknown, maxLen = 2000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/org/voice-samples/:id
 * Body: { sample_text: string }
 */
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { id: rawId } = await ctx.params;
    const id = cleanString(rawId, 80);
    if (!id) return jsonError("id is required", 400);

    const body = await req.json().catch(() => ({}));
    const sampleText = cleanString((body as any)?.sample_text, 2000);
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
 * DELETE /api/org/voice-samples/:id
 */
export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { id: rawId } = await ctx.params;
    const id = cleanString(rawId, 80);
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
