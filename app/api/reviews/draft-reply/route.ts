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
  return text.replace(/["“”‘’]/g, "");
}

function languageInstruction(languageTag: string) {
  const tag = (languageTag || "en").toLowerCase();

  switch (tag) {
    case "en":
      return "Write in English (natural, human, not corporate).";
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
      return `Write in the owner's preferred language (${languageTag}).`;
  }
}

type VoiceProfile = {
  reply_as?: "owner" | "manager" | "we";
  tone?: "warm" | "neutral" | "direct" | "playful";
  brevity?: "short" | "medium";
  formality?: "casual" | "professional";
  things_to_avoid?: string[] | null;
  allow_exclamation?: boolean | null;
};

const DEFAULT_VOICE = {
  reply_as: "we" as const,
  tone: "warm" as const,
  brevity: "short" as const,
  formality: "professional" as const,
  things_to_avoid: [
    // Existing
    "Thank you for your feedback",
    "We appreciate your feedback",
    "We strive",
    "We will look into this",
    "We take this seriously",
    "Please accept our apologies",
    "delighted",
    "thrilled",
    "valued customer",

    // Anti-AI / anti-corporate (NEW)
    "we're sorry to hear",
    "we are sorry to hear",
    "we're glad you",
    "we are glad you",
    "thank you for sharing",
    "thank you for taking the time",
    "it sounds like",
    "we appreciate your thoughts",
    "we appreciate your comments",
    "keep your comments in mind",
    "fell short",
    "refine our",
  ],
  allow_exclamation: false,
};

type OrgReplySettings = {
  owner_language: string;
  reply_tone: string;
  reply_signature: string | null;
};

async function loadOrgReplySettings(): Promise<OrgReplySettings> {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { data, error } = await supabase
      .from("organizations")
      .select("owner_language, reply_tone, reply_signature")
      .eq("id", organizationId)
      .maybeSingle();

    if (error || !data) {
      return { owner_language: "en", reply_tone: "warm", reply_signature: null };
    }

    return {
      owner_language: cleanLanguage(data.owner_language),
      reply_tone: cleanString(data.reply_tone, 40) || "warm",
      reply_signature: cleanString(data.reply_signature, 80) || null,
    };
  } catch {
    return { owner_language: "en", reply_tone: "warm", reply_signature: null };
  }
}

// Legacy optional voice profile table (safe fallback)
async function loadVoiceProfile(): Promise<VoiceProfile> {
  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { data, error } = await supabase
      .from("org_voice_profile")
      .select("reply_as,tone,brevity,formality,things_to_avoid,allow_exclamation")
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (error) return {};
    return (data ?? {}) as VoiceProfile;
  } catch {
    return {};
  }
}

function normalizeVoice(v?: VoiceProfile | null) {
  const vv = v ?? {};
  return {
    ...DEFAULT_VOICE,
    ...vv,
    things_to_avoid: Array.isArray(vv.things_to_avoid)
      ? vv.things_to_avoid.filter(Boolean)
      : DEFAULT_VOICE.things_to_avoid,
    allow_exclamation:
      typeof vv.allow_exclamation === "boolean"
        ? vv.allow_exclamation
        : DEFAULT_VOICE.allow_exclamation,
  };
}

function normalizeToneFromOrg(tone: string): VoiceProfile["tone"] {
  const t = (tone || "").toLowerCase().trim();
  if (t === "playful") return "playful";
  if (t === "direct") return "direct";
  if (t === "neutral") return "neutral";
  if (t === "professional") return "neutral"; // professional handled via formality line
  return "warm";
}

/**
 * NEW: tone coming from client UI
 * Accepts: "warm" | "neutral" | "direct" | "playful"
 */
function parseClientTone(v: unknown): VoiceProfile["tone"] | null {
  const t = cleanString(v, 24).toLowerCase().trim();
  if (!t) return null;
  if (t === "warm" || t === "neutral" || t === "direct" || t === "playful") return t;
  return null;
}

/**
 * NEW: rules coming from client UI
 * Safely accept small list of strings.
 */
function parseClientRules(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const cleaned = v
    .map((x) => cleanString(x, 180))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12);
  return cleaned;
}

/**
 * NEW: prevent weird tone choices for negative reviews
 */
function clampToneForRating(tone: VoiceProfile["tone"], rating: number): VoiceProfile["tone"] {
  if (!tone) return tone;
  if (rating <= 2 && tone === "playful") return "neutral";
  return tone;
}

/**
 * Step 2: Make rating guidance push the model away from templated/corporate phrasing.
 * These strings are directly injected into the prompt; keep them crisp and human-biased.
 */
function ratingGuidance(rating: number) {
  if (rating >= 5) {
    return [
      "For 5-star reviews:",
      "- Write like a person, not a brand statement.",
      "- Echo 1–2 real details they mentioned (food, staff, vibe) using natural words.",
      "- A simple line like “Hope to see you again” is enough (no sales pitch).",
      "- 2–4 short sentences are OK when their praise is long.",
    ].join("\n");
  }
  if (rating === 4) {
    return [
      "For 4-star reviews:",
      "- Keep it friendly and brief.",
      "- If they hinted at something to improve, acknowledge it in plain language (no corporate phrasing).",
      "- Mention one detail if available, then a simple welcome back.",
    ].join("\n");
  }
  if (rating === 3) {
    return [
      "For 3-star reviews:",
      "- Reflect the mixed experience in your own words.",
      "- Mention one specific detail they brought up (a dish, wait time, noise, etc.).",
      "- Offer a simple offline follow-up line only if it feels appropriate (no “we’ll investigate”).",
    ].join("\n");
  }
  return [
    "For 1–2 star reviews:",
    "- Acknowledge it plainly, like a human would speak.",
    "- If you apologize, keep it one short line (no formal ‘regret/expectations’ language).",
    "- If you offer follow-up, make it simple: “Email/call us so we can make it right.”",
  ].join("\n");
}

function buildPrompt(params: {
  business_name: string;
  rating: number;
  owner_language: string;
  review_text: string;
  voice: ReturnType<typeof normalizeVoice>;
  org_reply_tone_raw: string;
  reply_signature: string | null;
  client_tone?: VoiceProfile["tone"] | null;
  client_rules?: string[];
}) {
  const {
    business_name,
    rating,
    owner_language,
    review_text,
    voice,
    org_reply_tone_raw,
    reply_signature,
    client_tone,
    client_rules,
  } = params;

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
        ? "Tone: steady, human, and not overly emotional."
        : voice.tone === "direct"
          ? "Tone: direct, respectful, and concise."
          : "Tone: lightly playful but still respectful.";

  const orgTone = (org_reply_tone_raw || "").toLowerCase().trim();
  const effectiveFormality = orgTone === "professional" ? "professional" : voice.formality;

  const brevityLine =
    voice.brevity === "short" ? "Length: keep it SHORT." : "Length: medium-short.";

  const formalityLine =
    effectiveFormality === "casual"
      ? "Style: casual human phrasing (not overly polite)."
      : "Style: professional but not stiff.";

  const exclamationRule = voice.allow_exclamation
    ? "Exclamation points allowed, but only if it feels natural."
    : "Do NOT use exclamation points.";

  const avoidList =
    voice.things_to_avoid && voice.things_to_avoid.length
      ? `Avoid these phrases/words (do not use them): ${voice.things_to_avoid.join(", ")}`
      : "";

  const signatureLine = reply_signature
    ? `Signature: end with “— ${reply_signature}”.`
    : "Signature: none.";

  const clientToneLine =
    client_tone === "warm"
      ? "User-selected tone override: warm, human, not salesy."
      : client_tone === "neutral"
        ? "User-selected tone override: neutral, calm, straightforward."
        : client_tone === "direct"
          ? "User-selected tone override: direct, concise, respectful."
          : client_tone === "playful"
            ? "User-selected tone override: lightly playful (only if appropriate)."
            : "";

  const clientRulesBlock =
    client_rules && client_rules.length
      ? ["User-selected rules (HIGHEST priority):", ...client_rules.map((r) => `- ${r}`)].join(
          "\n"
        )
      : "";

  // Step 2: sentence policy in the prompt (lets 5★ be a touch longer when warranted)
  const sentencePolicy =
    rating >= 5
      ? "For 5-star reviews: 2–4 short sentences are acceptable if their praise is detailed."
      : rating <= 2
        ? "For negative reviews: 2–3 sentences max (use 3 only if needed)."
        : "For all other reviews: 2–3 sentences max.";

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
- ${sentencePolicy}
- ${avoidList}
- ${signatureLine}
${clientToneLine ? `\n${clientToneLine}\n` : ""}
${clientRulesBlock ? `\n${clientRulesBlock}\n` : ""}

REVIEW TEXT (use ONLY what they wrote; do not invent details):
Business: ${business_name}
Rating: ${rating}/5

Review:
"""
${review_text}
"""

LANGUAGE LAYER (MVP Step 3a):
- ${languageInstruction(owner_language)}
- Draft in the OWNER language (not the reviewer language).

RATING GUIDANCE:
${ratingGuidance(rating)}

Return ONLY the reply text. No bullet points. No labels.
`.trim();
}

function appendSignatureIfMissing(reply: string, signature: string | null) {
  const sig = cleanString(signature, 80);
  if (!sig) return reply;

  const normalized = reply.toLowerCase();
  const marker = `— ${sig}`.toLowerCase();

  if (normalized.includes(marker)) return reply;

  // Add a clean signature on a new line
  return `${reply.trim()}\n— ${sig}`.trim();
}

export async function POST(req: Request) {
  try {
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
    const reviewer_language = cleanLanguage(body?.language); // keep for Step 3b
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

    // NEW: client overrides (safe)
    const clientToneRaw = parseClientTone(body?.tone);
    const clientTone = clientToneRaw ? clampToneForRating(clientToneRaw, rating) : null;
    const clientRules = parseClientRules(body?.rules);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing OPENAI_API_KEY in server env. Add in Vercel and redeploy." },
        { status: 500 }
      );
    }

    const orgSettings = await loadOrgReplySettings();
    const owner_language = orgSettings.owner_language || "en";
    const org_reply_tone_raw = orgSettings.reply_tone || "warm";
    const reply_signature = orgSettings.reply_signature ?? null;

    const orgVoice = await loadVoiceProfile();
    const merged = { ...orgVoice, ...(body?.voice ?? {}) };

    const toneFromOrg = normalizeToneFromOrg(org_reply_tone_raw);

    // Org settings define default voice tone.
    // clientTone is handled as a highest-priority instruction block (not blindly overwriting voice.tone).
    const voice = normalizeVoice({
      ...merged,
      tone: merged?.tone ? merged.tone : toneFromOrg,
    });

    const prompt = buildPrompt({
      business_name,
      rating,
      owner_language,
      review_text,
      voice,
      org_reply_tone_raw,
      reply_signature,
      client_tone: clientTone,
      client_rules: clientRules,
    });

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.25,
        messages: [
          {
            role: "system",
            content:
              "You write short, human-sounding public review replies. Follow instructions exactly. Output only the reply.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 260,
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
          error: "OpenAI upstream error",
          upstreamStatus: upstream.status,
          upstreamBody: upstreamJson ?? rawText,
        },
        { status: 502 }
      );
    }

    const contentRaw = upstreamJson?.choices?.[0]?.message?.content ?? "";
    let content = safeTrimReply(String(contentRaw));

    content = removeQuotations(content);
    content = stripEmojis(content);
    content = content.replace(/\s+/g, " ").trim();

    // Step 2: allow slightly longer 5★ replies (while keeping others tight)
    const maxSentences = rating <= 2 ? 3 : rating === 3 ? 2 : rating === 4 ? 2 : 4;
    content = limitSentences(content, maxSentences);

    if (!voice.allow_exclamation) {
      content = content.replace(/!/g, ".");
      content = content.replace(/\.\.+/g, ".").trim();
    }

    // ✅ Enforce signature at the end (MVP reliability)
    content = appendSignatureIfMissing(content, reply_signature);

    if (!content) {
      return NextResponse.json(
        { ok: false, error: "No reply content returned from OpenAI", upstreamBody: upstreamJson },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        reply: content,
        meta: {
          owner_language,
          reviewer_language,
          reply_tone: org_reply_tone_raw,
          reply_signature: reply_signature ?? null,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("DRAFT-REPLY ERROR:", err);
    const message = err instanceof Error ? err.message : "Server error drafting reply";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
