export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/subscriptionServer";
import { requireOrgContext } from "@/lib/orgServer";

/**
 * Doctrine-aligned draft API (Owner Voice First)
 * - Suggests a reply written in the owner's voice (human stays in control)
 * - Strict precedence:
 *   1) Owner voice inputs
 *   2) Review text itself
 *   3) Hospitality context (minimal, only to avoid wrong assumptions)
 *   4) Language translation layer
 *   5) Platform norms
 */

function cleanString(v: unknown, maxLen = 4000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function cleanLanguage(v: unknown) {
  const raw = cleanString(v, 20) || "en";
  return raw.slice(0, 12);
}

function parseRating(v: unknown) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return n;
}

function safeTrimReply(s: string, maxLen = 800) {
  const t = (s ?? "").trim();
  if (!t) return "";
  return t.slice(0, maxLen);
}

function stripEmojis(text: string) {
  // broad emoji unicode ranges; good enough for MVP
  return text.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu,
    ""
  );
}

function limitSentences(text: string, maxSentences: number) {
  const t = text.trim();
  if (!t) return t;
  const parts = t
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length <= maxSentences) return t;
  return parts.slice(0, maxSentences).join(" ");
}

function removeQuotations(text: string) {
  // Avoid quoting the review verbatim; remove obvious quote marks.
  return text.replace(/["“”‘’]/g, "");
}

function languageInstruction(languageTag: string) {
  const tag = (languageTag || "en").toLowerCase();

  // Keep simple. If you want richer mapping later, expand this.
  switch (tag) {
    case "es":
      return "Write in Spanish (natural Spanish, not a literal translation).";
    case "pt":
    case "pt-br":
      return "Write in Portuguese (natural Portuguese, not a literal translation).";
    case "fr":
      return "Write in French (natural French, not a literal translation).";
    case "it":
      return "Write in Italian (natural Italian, not a literal translation).";
    case "de":
      return "Write in German (natural German, not a literal translation).";
    default:
      return `Write in the reviewer's language (${languageTag}).`;
  }
}

type VoiceProfile = {
  reply_as?: "owner" | "manager" | "we";
  tone?: "warm" | "neutral" | "direct" | "playful";
  brevity?: "short" | "medium";
  formality?: "casual" | "professional";
  signoff_style?: "none" | "first_name" | "team_name";
  preferred_name?: string | null;
  things_to_avoid?: string[] | null;
  allow_exclamation?: boolean | null;
};

const DEFAULT_VOICE: Required<Pick<
  VoiceProfile,
  "reply_as" | "tone" | "brevity" | "formality" | "signoff_style"
>> & {
  preferred_name: string | null;
  things_to_avoid: string[];
  allow_exclamation: boolean;
} = {
  reply_as: "we",
  tone: "warm",
  brevity: "short",
  formality: "professional",
  signoff_style: "none",
  preferred_name: null,
  things_to_avoid: [
    "Thank you for your feedback",
    "We appreciate your feedback",
    "We strive",
    "We will look into this",
    "We take this seriously",
    "Please accept our apologies",
    "delighted",
    "thrilled",
    "valued customer",
  ],
  allow_exclamation: false,
};

// Optional: load from Supabase if the table exists.
// If it doesn't exist yet, we silently fall back to defaults (MVP-friendly).
async function loadVoiceProfile(): Promise<VoiceProfile> {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { data, error } = await supabase
      .from("org_voice_profile")
      .select(
        "reply_as,tone,brevity,formality,signoff_style,preferred_name,things_to_avoid,allow_exclamation"
      )
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) {
      // If table/column missing, just fall back silently.
      return {};
    }
    return (data ?? {}) as VoiceProfile;
  } catch {
    return {};
  }
}

function normalizeVoice(v?: VoiceProfile | null) {
  const voice: typeof DEFAULT_VOICE = {
    ...DEFAULT_VOICE,
    ...(v ?? {}),
    things_to_avoid: Array.isArray(v?.things_to_avoid)
      ? (v!.things_to_avoid!.filter(Boolean) as string[])
      : DEFAULT_VOICE.things_to_avoid,
    allow_exclamation:
      typeof v?.allow_exclamation === "boolean"
        ? v.allow_exclamation
        : DEFAULT_VOICE.allow_exclamation,
    preferred_name:
      typeof v?.preferred_name === "string" ? v.preferred_name : DEFAULT_VOICE.preferred_name,
  };
  return voice;
}

function ratingGuidance(rating: number) {
  if (rating >= 5) {
    return [
      "For 5-star reviews:",
      "- Sound genuinely appreciative, not polished.",
      "- If they mention a detail, echo ONE detail in a natural way.",
      "- End with a simple, non-salesy welcome back.",
    ].join("\n");
  }
  if (rating === 4) {
    return [
      "For 4-star reviews:",
      "- Appreciate the visit; keep it light.",
      "- If a minor issue is hinted, acknowledge briefly without corporate language.",
      "- Welcome them back naturally.",
    ].join("\n");
  }
  if (rating === 3) {
    return [
      "For 3-star reviews:",
      "- Acknowledge the mixed experience calmly.",
      "- Show you heard them, without ‘we’ll investigate’ language.",
      "- Optional: one simple offline follow-up line (not legalistic).",
    ].join("\n");
  }
  return [
    "For 1–2 star reviews:",
    "- Lead with calm empathy. No defensiveness.",
    "- Brief apology is OK, but do not over-apologize.",
    "- Offer one simple offline follow-up line (email/phone), not corporate/legal.",
  ].join("\n");
}

function buildPrompt(params: {
  business_name: string;
  rating: number;
  language: string;
  review_text: string;
  voice: ReturnType<typeof normalizeVoice>;
}) {
  const { business_name, rating, language, review_text, voice } = params;

  const who =
    voice.reply_as === "owner"
      ? "Write as the owner using “I”."
      : voice.reply_as === "manager"
        ? "Write as the manager using “I”."
        : "Write as the business using “we”.";

  const toneLine =
    voice.tone === "warm"
      ? "Tone: warm, real, and calm."
      : voice.tone === "neutral"
        ? "Tone: neutral, steady, and human."
        : voice.tone === "direct"
          ? "Tone: direct, respectful, and concise."
          : "Tone: lightly playful but still respectful.";

  const brevityLine =
    voice.brevity === "short" ? "Length: keep it SHORT." : "Length: medium-short, still concise.";

  const formalityLine =
    voice.formality === "casual"
      ? "Style: casual human phrasing (not overly polite)."
      : "Style: professional but not stiff.";

  const exclamationRule = voice.allow_exclamation
    ? "Exclamation points allowed, but only if it feels natural."
    : "Do NOT use exclamation points.";

  const avoidList =
    voice.things_to_avoid && voice.things_to_avoid.length
      ? `Avoid these phrases/words (do not use them): ${voice.things_to_avoid.join(", ")}`
      : "";

  const signoff =
    voice.signoff_style === "first_name" && voice.preferred_name
      ? `Signoff: end with “— ${voice.preferred_name}”.`
      : voice.signoff_style === "team_name" && voice.preferred_name
        ? `Signoff: end with “— ${voice.preferred_name}”.`
        : "Signoff: none.";

  // Strict hierarchy sections
  return `
OWNER VOICE INPUTS (highest priority):
- ${who}
- ${toneLine}
- ${brevityLine}
- ${formalityLine}
- ${exclamationRule}
- No emojis.
- Do not sound like PR, templates, or policy language.
- Do not mention AI, automation, internal processes, investigations, or policies.
- Do not offer refunds/discounts/compensation.
- Do not admit legal fault.
- Do not quote the review.
- 2–3 sentences max (use 3 only if needed for negative reviews).
- ${avoidList}
- ${signoff}

REVIEW TEXT (use ONLY what they wrote; do not invent details):
Business: ${business_name}
Rating: ${rating}/5

Review:
"""
${review_text}
"""

HOSPITALITY CONTEXT (minimal):
- Only use general hospitality language. Do not assume specifics not in the review.

LANGUAGE LAYER:
- ${languageInstruction(language)}

PLATFORM NORMS:
- This is a public Google-style reply: short, calm, specific when possible.

RATING GUIDANCE:
${ratingGuidance(rating)}

Return ONLY the reply text. No bullet points. No labels.
`.trim();
}

export async function POST(req: Request) {
  try {
    // ✅ Subscription gating (MVP)
    const sub = await requireActiveSubscription();
    if (!sub.ok) {
      return NextResponse.json(
        {
          ok: false,
          upgradeRequired: true,
          status: sub.status,
          error: "Your plan isn’t active yet. Subscribe to draft replies.",
        },
        { status: 402 }
      );
    }

    const body = await req.json().catch(() => null);

    const review_text = cleanString(body?.review_text, 5000);
    const business_name = cleanString(body?.business_name, 200);
    const language = cleanLanguage(body?.language);
    const rating = parseRating(body?.rating);

    if (!review_text) {
      return NextResponse.json({ ok: false, error: "review_text is required" }, { status: 400 });
    }
    if (!business_name) {
      return NextResponse.json({ ok: false, error: "business_name is required" }, { status: 400 });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ ok: false, error: "rating must be 1–5" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY in server env. Add in Vercel and redeploy." },
        { status: 500 }
      );
    }

    // Voice profile precedence:
    // 1) body.voice (if provided by UI later)
    // 2) org voice profile from Supabase (if table exists)
    // 3) defaults
    const orgVoice = await loadVoiceProfile();
    const voice = normalizeVoice({ ...orgVoice, ...(body?.voice ?? {}) });

    const prompt = buildPrompt({ business_name, rating, language, review_text, voice });

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.25, // lower = less “creative template-y”
        messages: [
          {
            role: "system",
            content:
              "You write short, human-sounding public review replies. Follow instructions exactly. Output only the reply.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 220,
      }),
      cache: "no-store",
    });

    const rawText = await upstream.text();
    let upstreamJson: any = null;
    try {
      upstreamJson = JSON.parse(rawText);
    } catch {
      // ignore
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "OpenAI upstream error",
          upstreamStatus: upstream.status,
          upstreamBody: upstreamJson ?? rawText,
        },
        { status: 502 }
      );
    }

    const contentRaw = upstreamJson?.choices?.[0]?.message?.content ?? "";
    let content = safeTrimReply(String(contentRaw));

    // Post-guards (keep it believable and compliant)
    content = removeQuotations(content);
    content = stripEmojis(content);
    content = content.replace(/\s+/g, " ").trim();

    // Enforce sentence limit (2–3)
    const maxSentences = rating <= 2 ? 3 : 2;
    content = limitSentences(content, maxSentences);

    // Optional: enforce no exclamation if voice disallows it
    if (!voice.allow_exclamation) {
      content = content.replace(/!/g, ".");
      content = content.replace(/\.\.+/g, ".").trim();
    }

    if (!content) {
      return NextResponse.json(
        { ok: false, error: "No reply content returned from OpenAI", upstreamBody: upstreamJson },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, reply: content }, { status: 200 });
  } catch (err: any) {
    console.error("DRAFT-REPLY ERROR:", err);
    const message = err instanceof Error ? err.message : "Server error drafting reply";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
