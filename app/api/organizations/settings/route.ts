export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

type Settings = {
  owner_language: string;
  reply_tone: string;
  reply_signature: string | null;
};

export async function GET() {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { data, error } = await supabase
      .from("organizations")
      .select("owner_language, reply_tone, reply_signature")
      .eq("id", organizationId)
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const settings: Settings = {
      owner_language: data?.owner_language ?? "en",
      reply_tone: data?.reply_tone ?? "warm",
      reply_signature: data?.reply_signature ?? null,
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

    let body: Partial<Settings> = {};
    try {
      body = (await req.json()) as Partial<Settings>;
    } catch {
      body = {};
    }

    const owner_language =
      typeof body.owner_language === "string" && body.owner_language.trim()
        ? body.owner_language.trim()
        : "en";

    const reply_tone =
      typeof body.reply_tone === "string" && body.reply_tone.trim()
        ? body.reply_tone.trim()
        : "warm";

    const reply_signature =
      typeof body.reply_signature === "string"
        ? body.reply_signature.trim() || null
        : null;

    const { data, error } = await supabase
      .from("organizations")
      .update({
        owner_language,
        reply_tone,
        reply_signature,
      })
      .eq("id", organizationId)
      .select("owner_language, reply_tone, reply_signature")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      settings: {
        owner_language: data?.owner_language ?? owner_language,
        reply_tone: data?.reply_tone ?? reply_tone,
        reply_signature: data?.reply_signature ?? reply_signature,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unauthorized" },
      { status: 401 }
    );
  }
}
