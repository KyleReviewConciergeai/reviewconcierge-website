export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

type Settings = {
  owner_language: string;
  reply_tone: string;
  reply_signature: string | null;
};

function normalizeSettings(body: any): Settings {
  const owner_language =
    typeof body?.owner_language === "string" && body.owner_language.trim()
      ? body.owner_language.trim()
      : "en";

  const reply_tone =
    typeof body?.reply_tone === "string" && body.reply_tone.trim()
      ? body.reply_tone.trim()
      : "warm";

  const reply_signature =
    typeof body?.reply_signature === "string"
      ? body.reply_signature.trim() || null
      : null;

  return { owner_language, reply_tone, reply_signature };
}

export async function GET() {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { data, error } = await supabase
      .from("organizations")
      .select("owner_language, reply_tone, reply_signature")
      .eq("id", organizationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      // Usually means RLS is blocking read, or org row missing
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not load organization settings (no row returned). This is usually an RLS/policy issue.",
        },
        { status: 403 }
      );
    }

    const settings: Settings = {
      owner_language: data.owner_language ?? "en",
      reply_tone: data.reply_tone ?? "warm",
      reply_signature: data.reply_signature ?? null,
    };

    return NextResponse.json({ ok: true, settings });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unauthorized" },
      { status: 401 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const next = normalizeSettings(body);

    // 1) Update WITHOUT .select().single() to avoid PostgREST "coerce" errors
    const { error: updateError } = await supabase
      .from("organizations")
      .update({
        owner_language: next.owner_language,
        reply_tone: next.reply_tone,
        reply_signature: next.reply_signature,
      })
      .eq("id", organizationId);

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    // 2) Read back with maybeSingle (returns null instead of throwing)
    const { data, error: readError } = await supabase
      .from("organizations")
      .select("owner_language, reply_tone, reply_signature")
      .eq("id", organizationId)
      .maybeSingle();

    if (readError) {
      return NextResponse.json({ ok: false, error: readError.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Saved, but could not read back settings (no row returned). This is usually an RLS/policy issue.",
        },
        { status: 403 }
      );
    }

    const settings: Settings = {
      owner_language: data.owner_language ?? next.owner_language,
      reply_tone: data.reply_tone ?? next.reply_tone,
      reply_signature: data.reply_signature ?? next.reply_signature,
    };

    return NextResponse.json({ ok: true, settings });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unauthorized" },
      { status: 401 }
    );
  }
}
