// app/api/org/voice-samples/[id]/route.ts
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

const MIN_LEN = 60;
const MAX_LEN = 600;

function cleanText(v: unknown) {
  const s = typeof v === "string" ? v : "";
  return s.replace(/\s+/g, " ").trim();
}

function computeWarnings(sampleText: string): string[] {
  const t = sampleText.trim();
  const warnings: string[] = [];

  if (t.length < 120) warnings.push("too_short");
  if (t.length > 450) warnings.push("too_long");

  const lower = t.toLowerCase();
  const genericPhrases = [
    "thank you",
    "thanks",
    "we appreciate",
    "we appreciate your feedback",
    "great service",
    "great food",
    "come back soon",
    "hope to see you again",
    "valued guest",
    "we're thrilled",
    "we are thrilled",
  ];
  const genericHit = genericPhrases.some((p) => lower.includes(p));
  if (genericHit && t.length < 160) warnings.push("too_generic");

  const hasConcreteSignal =
    /\b(staff|server|team|host|bar|wine|coffee|dessert|dish|meal|breakfast|dinner|lunch|table|music|atmosphere|vibe|service|reservation)\b/i.test(
      t
    );
  if (!hasConcreteSignal && t.length < 200) warnings.push("low_specificity");

  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t);
  if (hasEmail) warnings.push("contains_email");

  const digits = (t.match(/\d/g) ?? []).length;
  const hasPhonePattern =
    digits >= 7 &&
    /(\+?\d[\d\s().-]{6,}\d)/.test(t) &&
    !/\b(1|2|3|4|5)\s?★\b/.test(t);
  if (hasPhonePattern) warnings.push("contains_phone");

  const hasUrl = /\bhttps?:\/\/|www\./i.test(t);
  if (hasUrl) warnings.push("contains_url");

  const hasAddressHint =
    /\b(street|st\.|avenue|ave\.|road|rd\.|suite|ste\.|apt|apartment|unit|#\d+)\b/i.test(t);
  if (hasAddressHint) warnings.push("contains_address_hint");

  return Array.from(new Set(warnings));
}

function validateOrThrow(sampleText: string) {
  if (!sampleText) throw new Error("Sample text is required.");
  if (sampleText.length < MIN_LEN)
    throw new Error(`Sample text is too short. Minimum is ${MIN_LEN} characters.`);
  if (sampleText.length > MAX_LEN)
    throw new Error(`Sample text is too long. Maximum is ${MAX_LEN} characters.`);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { id } = await ctx.params;
    const cleanId = String(id ?? "").trim();
    if (!cleanId) return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const sample_text = cleanText((body as any)?.sample_text);
    validateOrThrow(sample_text);

    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("org_voice_samples")
      .update({ sample_text, updated_at: nowIso })
      .eq("id", cleanId)
      .eq("organization_id", organizationId)
      .select("id, sample_text, created_at, updated_at")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const voice_sample = {
      ...(data as any),
      warnings: computeWarnings(String((data as any)?.sample_text ?? "")),
    };

    return NextResponse.json({ ok: true, voice_sample }, { status: 200 });
  } catch (e: any) {
    const msg = e?.message ?? "Failed to update voice sample.";
    const isValidation =
      msg.includes("required") || msg.includes("too short") || msg.includes("too long");
    return NextResponse.json({ ok: false, error: msg }, { status: isValidation ? 400 : 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { id } = await ctx.params;
    const cleanId = String(id ?? "").trim();
    if (!cleanId) return NextResponse.json({ ok: false, error: "Missing id." }, { status: 400 });

    const { error } = await supabase
      .from("org_voice_samples")
      .delete()
      .eq("id", cleanId)
      .eq("organization_id", organizationId);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to delete voice sample." },
      { status: 500 }
    );
  }
}