export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/subscriptionServer";
import { requireOrgContext } from "@/lib/orgServer";

function cleanString(v: unknown, maxLen = 4000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function cleanLanguage(v: unknown) {
  const raw = cleanString(v, 20) || "en";
  return raw.slice(0, 12);
}

function languageLabel(tag: string) {
  const t = (tag || "en").toLowerCase();
  switch (t) {
    case "en":
      return "English";
    case "es":
      return "Spanish";
    case "pt":
    case "pt-br":
      return "Portuguese";
    case "fr":
      return "French";
    case "it":
      return "Italian";
    case "de":
      return "German";
    default:
      return `language (${tag})`;
  }
}

async function loadOrgSignature(): Promise<string | null> {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const { data } = await supabase
      .from("organizations")
      .select("reply_signature")
      .eq("id", organizationId)
      .maybeSingle();

    const s = cleanString(data?.reply_signature, 80);
    return s ? s : null;
  } catch {
    return null;
  }
}

function ensureSignatureAtEnd(text: string, signature: string | null) {
  const sig = cleanString(signature, 80);
  if (!sig) return text.trim();

  const marker = `— ${sig}`.toLowerCase();
  const t = text.trim();

  if (t.toLowerCase().includes(marker)) return t;

  return `${t}\n— ${sig}`.trim();
}

export async function POST(req: Request) {
  try {
    const sub = await requireActiveSubscription();
    if (!sub.ok) {
      return NextResponse.json(
        { ok: false, upgradeRequired: true, status: sub.status, error: "Active plan required." },
        { status: 402 }
      );
    }

    const body = await req.json().catch(() => null);
    const text = cleanString(body?.text, 5000);
    const target_language = cleanLanguage(body?.target_language);

    if (!text) {
      return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
    }
    if (!target_language) {
      return NextResponse.json(
        { ok: false, error: "target_language is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing ANTHROPIC_API_KEY in server env." },
        { status: 500 }
      );
    }

    // pull org signature (so translated output keeps it)
    const signature = await loadOrgSignature();

    const targetLabel = languageLabel(target_language);

    const prompt = `
Translate the reply below into ${targetLabel}.

Rules:
- Preserve meaning and tone (human, calm, not corporate).
- Keep it short (same length, 2–3 sentences).
- Do not add new details.
- Do not mention translation.
- Preserve names and places.
- Keep the signature line exactly as "— ${signature ?? ""}" if present.
- If the text already contains a signature line, keep it as the last line.

Reply only with the translated text (no labels).

TEXT:
"""
${text}
"""
`.trim();

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        temperature: 0.1,
        max_tokens: 350,
        system: "You are a precise translation engine.",
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });

    const rawText = await upstream.text();
    let upstreamJson: any = null;
    try {
      upstreamJson = JSON.parse(rawText);
    } catch {}

    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Anthropic upstream error",
          upstreamStatus: upstream.status,
          upstreamBody: upstreamJson ?? rawText,
        },
        { status: 502 }
      );
    }

    const contentRaw = upstreamJson?.content?.[0]?.text ?? "";
    let translated = cleanString(contentRaw, 5000);

    // normalize whitespace
    translated = translated.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    // enforce signature (if org has one)
    translated = ensureSignatureAtEnd(translated, signature);

    if (!translated) {
      return NextResponse.json({ ok: false, error: "No translated content returned" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, translated }, { status: 200 });
  } catch (err: any) {
    console.error("TRANSLATE-REPLY ERROR:", err);
    const message = err instanceof Error ? err.message : "Server error translating reply";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}