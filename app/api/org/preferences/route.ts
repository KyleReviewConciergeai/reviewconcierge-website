export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

export async function GET() {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { data, error } = await supabase
      .from("org_preferences")
      .select("*")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // If row doesn't exist for some reason, create it (self-heal)
    if (!data) {
      const { data: created, error: createErr } = await supabase
        .from("org_preferences")
        .insert({ organization_id: organizationId })
        .select("*")
        .single();

      if (createErr) {
        return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, preferences: created });
    }

    return NextResponse.json({ ok: true, preferences: data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to load preferences" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const body = await req.json().catch(() => ({}));

    // Allow only the fields we expect (avoid accidental writes)
    const patch = {
      owner_language: typeof body.owner_language === "string" ? body.owner_language : undefined,
      reply_language_mode:
        body.reply_language_mode === "match_review" || body.reply_language_mode === "always"
          ? body.reply_language_mode
          : undefined,
      reply_language_fixed:
        typeof body.reply_language_fixed === "string" ? body.reply_language_fixed : undefined,

      reply_as: body.reply_as,
      tone: body.tone,
      brevity: body.brevity,
      formality: body.formality,
      signoff_style: body.signoff_style,

      preferred_name: typeof body.preferred_name === "string" ? body.preferred_name : undefined,
      allow_exclamation: typeof body.allow_exclamation === "boolean" ? body.allow_exclamation : undefined,
      things_to_avoid: Array.isArray(body.things_to_avoid) ? body.things_to_avoid : undefined,

      owner_examples: typeof body.owner_examples === "string" ? body.owner_examples : undefined,
    };

    const { data, error } = await supabase
      .from("org_preferences")
      .upsert({ organization_id: organizationId, ...patch }, { onConflict: "organization_id" })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, preferences: data });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Failed to save preferences" },
      { status: 500 }
    );
  }
}
