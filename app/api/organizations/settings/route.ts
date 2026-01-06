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
      .select("id, owner_language, reply_tone, reply_signature")
      .eq("id", organizationId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Could not load organization settings (no row returned). This usually means org id mismatch or RLS/policy issue.",
          organizationId,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      organizationId,
      settings: {
        owner_language: data.owner_language ?? "en",
        reply_tone: data.reply_tone ?? "warm",
        reply_signature: data.reply_signature ?? null,
      } satisfies Settings,
    });
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

    // IMPORTANT: select("id") ensures we know whether a row was actually updated.
    const { data: updatedRows, error: updateError } = await supabase
      .from("organizations")
      .update({
        owner_language: next.owner_language,
        reply_tone: next.reply_tone,
        reply_signature: next.reply_signature,
      })
      .eq("id", organizationId)
      .select("id");

    if (updateError) {
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    if (!updatedRows || updatedRows.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Save failed because no organization row was updated. This usually means the org id did not match a row you can update (wrong org, wrong Supabase env, or RLS policy).",
          organizationId,
        },
        { status: 404 }
      );
    }

    // Read back the updated values
    const { data, error: readError } = await supabase
      .from("organizations")
      .select("id, owner_language, reply_tone, reply_signature")
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
            "Saved, but could not read back settings (no row returned). This usually means RLS/policy issue.",
          organizationId,
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      organizationId,
      settings: {
        owner_language: data.owner_language ?? next.owner_language,
        reply_tone: data.reply_tone ?? next.reply_tone,
        reply_signature: data.reply_signature ?? next.reply_signature,
      } satisfies Settings,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unauthorized" },
      { status: 401 }
    );
  }
}
