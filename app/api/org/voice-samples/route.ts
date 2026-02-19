// app/api/org/voice-samples/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

function cleanString(v: unknown, maxLen = 2000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

export async function GET() {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { data, error } = await supabase
      .from("org_voice_samples")
      .select("id,sample_text,created_at,updated_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: true })
      .limit(50);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, samples: data ?? [] }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to load voice samples" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const body = await req.json().catch(() => ({}));

    // Back-compat: allow either "action" style OR simple REST create
    const action = cleanString((body as any)?.action, 32);
    const sampleText = cleanString((body as any)?.sample_text, 2000);
    const sampleId = cleanString((body as any)?.id, 80);

    // ----- CREATE (preferred): { sample_text }
    // Also supports legacy: { action: "create", sample_text }
    if (!action || action === "create") {
      if (!sampleText) {
        return NextResponse.json({ ok: false, error: "sample_text is required" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("org_voice_samples")
        .insert({ organization_id: organizationId, sample_text: sampleText })
        .select("id,sample_text,created_at,updated_at")
        .single();

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, sample: data }, { status: 200 });
    }

    // ----- UPDATE (legacy-supported): { action: "update", id, sample_text }
    if (action === "update") {
      if (!sampleId) {
        return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
      }
      if (!sampleText) {
        return NextResponse.json({ ok: false, error: "sample_text is required" }, { status: 400 });
      }

      const { data, error } = await supabase
        .from("org_voice_samples")
        .update({ sample_text: sampleText, updated_at: new Date().toISOString() })
        .eq("id", sampleId)
        .eq("organization_id", organizationId)
        .select("id,sample_text,created_at,updated_at")
        .single();

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, sample: data }, { status: 200 });
    }

    // ----- DELETE (legacy-supported via POST): { action: "delete", id }
    if (action === "delete") {
      if (!sampleId) {
        return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
      }

      const { error } = await supabase
        .from("org_voice_samples")
        .delete()
        .eq("id", sampleId)
        .eq("organization_id", organizationId);

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to save voice samples" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const url = new URL(req.url);
    const id = cleanString(url.searchParams.get("id"), 80);

    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }

    const { error } = await supabase
      .from("org_voice_samples")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Failed to delete voice sample" },
      { status: 500 }
    );
  }
}
