// app/api/reviews/draft-reply/route.ts
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

function safeTrimReply(s: string, maxLen = 900) {
  const t = (s ?? "").trim();
  if (!t) return "";
  return t.slice(0, maxLen);
}

function stripEmojis(text: string) {
  // Broad emoji/pictograph ranges; safe for EN/ES/PT/FR/IT/DE
  return text.replace(
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu,
    ""
  );
}

function removeQuotations(text: string) {
  return text.replace(/["“”‘’]/g, "");
}

function collapseWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
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

function languageInstruction(languageTag: string) {
  const tag = (languageTag || "en").toLowerCase();

  switch (tag) {
    case "en":
      return "Write in English. Natural, human, non-corporate.";
    case "es":
      return "Write in Spanish. Natural Spanish, not a literal translation.";
    case "pt":
    case "pt-br":
      return "Write in Portuguese. Natural Portuguese, not a literal translation.";
    case "fr":
      return "Write in French. Natural French, not a literal translation.";
    case "it":
      return "Write in Italian. Natural Italian, not a literal translation.";
    case "de":
      return "Write in German. Natural German, not a literal translation.";
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
    // Corporate / template-y
    "Thank you for your feedback",
    "We appreciate your feedback",
    "We appreciate your thoughts",
    "We appreciate your comments",
    "Thank you for taking the time",
    "Thank you for sharing",
    "We strive",
    "We will look into this",
    "We take this seriously",
    "Please accept our apologies",
    "valued customer",
    "valued guest",
    "expectations",
    "did not meet expectations",
    "didn't meet expectations",
    "fell short",
    "acknowledge",
    "we understand",
    "we hear your",
    "we recognize",
    "it's disappointing to hear",
    "it's concerning to hear",
    "we'll keep that in mind",
    "refine our",
    "enhance our",

    // Mission-statement vibe
    "our goal is to",
    "we aim to",
    "we work hard to",

    // Stiff opener that reads robotic
    "We regret",
    "we regret",
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
      owner_language: cleanLanguage((data as any).owner_language),
      reply_tone: cleanString((data as any).reply_tone, 40) || "warm",
      reply_signature: cleanString((data as any).reply_signature, 80) || null,
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

/**
 * Load voice samples (org_voice_samples) as style reference only.
 */
type VoiceSampleRow = {
  id: string;
  sample_text: string;
  created_at?: string;
};

function truncateForPrompt(s: string, maxLen: number) {
  const t = (s ?? "").trim();
  if (!t) return "";
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1).trimEnd() + "…";
}

async function loadVoiceSamplesForOrg(opts?: {
  maxItems?: number;
  maxCharsEach?: number;
  maxTotalChars?: number;
}): Promise<string[]> {
  const maxItems = opts?.maxItems ?? 7;
  const maxCharsEach = opts?.maxCharsEach ?? 420;
  const maxTotalChars = opts?.maxTotalChars ?? 2400;

  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { data, error } = await supabase
      .from("org_voice_samples")
      .select("id,sample_text,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(maxItems, 12)));

    if (error) return [];

    const rows = (data ?? []) as VoiceSampleRow[];
    const cleaned: string[] = [];

    let total = 0;
    for (const r of rows) {
      const text = truncateForPrompt(cleanString(r.sample_text, 5000), maxCharsEach);
      const normalized = collapseWhitespace(removeQuotations(stripEmojis(text)));
      if (!normalized) continue;

      const nextLen = normalized.length + 10;
      if (total + nextLen > maxTotalChars) break;

      cleaned.push(normalized);
      total += nextLen;
    }

    return cleaned;
  } catch {
    return [];
  }
}

function normalizeVoice(v?: VoiceProfile | null) {
  const vv = v ?? {};
  return {
    ...DEFAULT_VOICE,
    ...vv,
    things_to_avoid: Array.isArray(vv.things_to_avoid)
      ? vv.things_to_avoid.map((x) => String(x)).filter(Boolean)
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
  if (t === "professional") return "neutral";
  return "warm";
}

/**
 * Tone coming from client UI
 */
function parseClientTone(v: unknown): VoiceProfile["tone"] | null {
  const t = cleanString(v, 24).toLowerCase().trim();
  if (!t) return null;
  if (t === "warm" || t === "neutral" || t === "direct" || t === "playful") return t;
  return null;
}

function parseClientRules(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => cleanString(x, 180))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12);
}

function clampToneForRating(tone: VoiceProfile["tone"], rating: number): VoiceProfile["tone"] {
  if (!tone) return tone;
  if (rating <= 2 && tone === "playful") return "neutral";
  return tone;
}

function sentencePolicyForRating(rating: number) {
  if (rating >= 5) return 4;
  if (rating === 4) return 3;
  return 3; // 1–3 keep tight
}

/**
 * Updated to align with research:
 * - 1–2★: empathy/apology is allowed and often helpful, but keep it short + human.
 * - 3★: balanced, solution-oriented.
 * - 4–5★: appreciative + specific.
 */
function mustDoForRating(rating: number) {
  const base = [
    "Write 2–4 short sentences max (follow sentence limit below).",
    "Sentence 1 MUST reference exactly one concrete detail from the review (dish, staff moment, timing, vibe, service detail).",
    "Sound like a real owner writing quickly on Google (not a brand statement).",
    "Use plain language. No PR tone. No templates.",
    "Do NOT invent details. Only reference what the reviewer actually wrote.",
    "Do NOT quote the review text.",
    "No emojis.",
    "Never include placeholders like [email/phone].",
  ];

  if (rating >= 5) {
    return [
      ...base,
      "Be short and sincere.",
      "Close with a simple welcome back (not salesy).",
    ];
  }

  if (rating === 4) {
    return [
      ...base,
      "If there’s a small critique, acknowledge it plainly in one short clause.",
      "Close with a simple welcome back.",
    ];
  }

  if (rating === 3) {
    return [
      ...base,
      "Match the mixed experience: one line of appreciation + one line acknowledging the miss.",
      "If inviting follow-up, keep it one short human line (no corporate framing).",
    ];
  }

  // 1–2★
  return [
    ...base,
    "Open with a brief, human acknowledgement/apology (short clause, not a paragraph).",
    "Stay calm and direct. No defensiveness. No arguing.",
    "If inviting follow-up, keep it one short line (e.g., 'Reach out to us directly so we can talk it through.').",
  ];
}

function mustNotForRating(rating: number) {
  const base = [
    "Do NOT mention AI, automation, internal processes, investigations, or policies.",
    "Do NOT offer refunds/discounts/compensation.",
    "Do NOT admit legal fault.",
    "Do NOT use corporate filler or templated PR language.",
    "Do NOT use exclamation points unless explicitly allowed (rule below).",
    "Do NOT include placeholders like [email/phone].",
  ];

  if (rating <= 2) {
    return [...base, "Do NOT be playful or joking.", "Do NOT argue with the reviewer.", "Do NOT blame the customer."];
  }

  return base;
}

function styleLines(params: {
  voice: ReturnType<typeof normalizeVoice>;
  org_reply_tone_raw: string;
  reply_signature: string | null;
  clientTone?: VoiceProfile["tone"] | null;
  rating: number;
}) {
  const { voice, org_reply_tone_raw, reply_signature, clientTone, rating } = params;

  const who =
    voice.reply_as === "owner"
      ? 'Reply as the owner using "I".'
      : voice.reply_as === "manager"
        ? 'Reply as the manager using "I".'
        : 'Reply as the business using "we".';

  const orgTone = (org_reply_tone_raw || "").toLowerCase().trim();
  const effectiveFormality = orgTone === "professional" ? "professional" : voice.formality;

  const toneLine =
    voice.tone === "warm"
      ? "Default tone: warm, real, calm."
      : voice.tone === "neutral"
        ? "Default tone: steady, human, not overly emotional."
        : voice.tone === "direct"
          ? "Default tone: direct, respectful, concise."
          : "Default tone: lightly playful but still respectful.";

  const clientToneLine =
    clientTone === "warm"
      ? "User tone override: warm, human, not salesy."
      : clientTone === "neutral"
        ? "User tone override: neutral, calm, straightforward."
        : clientTone === "direct"
          ? "User tone override: direct, concise, respectful."
          : clientTone === "playful"
            ? "User tone override: lightly playful (ONLY if appropriate)."
            : "";

  const brevityLine = voice.brevity === "short" ? "Brevity: short." : "Brevity: medium-short.";

  const formalityLine =
    effectiveFormality === "casual"
      ? "Formality: casual (still respectful)."
      : "Formality: professional (not stiff).";

  const signatureLine = reply_signature ? `Signature: end with “— ${reply_signature}”.` : "Signature: none.";

  const exclamationLine = voice.allow_exclamation
    ? rating >= 5
      ? "Exclamation points allowed sparingly (max 1), only if it feels natural."
      : "Exclamation points allowed sparingly (max 1) if it feels natural."
    : "No exclamation points.";

  return [who, toneLine, clientToneLine, brevityLine, formalityLine, signatureLine, exclamationLine]
    .filter(Boolean)
    .join("\n- ");
}

/**
 * Rating-aware banned list:
 * - For 1–2★, allow short apology language ("sorry") BUT keep banning PR-y phrases.
 * - Always ban stiff "We regret" opener.
 */
function buildAvoidListLinesForRating(voice: ReturnType<typeof normalizeVoice>, rating: number) {
  const avoid = Array.isArray(voice.things_to_avoid) ? voice.things_to_avoid : [];

  // For low stars, we *allow* brief apology language, so we should NOT ban "sorry" variants here.
  const allowApologyForLowStars = rating <= 2;

  const cleaned = avoid
    .map((s) => cleanString(s, 140).trim())
    .filter(Boolean)
    .filter((s) => {
      if (!allowApologyForLowStars) return true;
      const t = s.toLowerCase();
      // allow "sorry" openers on 1–2★, but still block corporate ones
      if (t.includes("we're sorry to hear")) return false;
      if (t.includes("we are sorry to hear")) return false;
      return true;
    })
    .slice(0, 70);

  // Also hard-block placeholder artifacts
  cleaned.push("[email/phone]");
  cleaned.push("[email]");
  cleaned.push("[phone]");

  return Array.from(new Set(cleaned));
}

function buildVoiceSamplesBlock(samples: string[]) {
  if (!samples || samples.length === 0) return "";

  const lines = samples.map((s, i) => `SAMPLE ${i + 1}: ${s}`);
  return `
VOICE SAMPLES (STYLE REFERENCE ONLY):
- These are examples of how the owner writes. Use them to match cadence, word choice, and vibe.
- Do NOT copy any sentence verbatim. Do NOT reuse unique phrases. Use as inspiration only.
${lines.map((l) => `- ${l}`).join("\n")}
`.trim();
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
  voice_samples?: string[];
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
    voice_samples,
  } = params;

  const maxSentences = sentencePolicyForRating(rating);
  const mustDo = mustDoForRating(rating);
  const mustNot = mustNotForRating(rating);

  const avoidLines = buildAvoidListLinesForRating(voice, rating);
  const voiceProfile = styleLines({
    voice,
    org_reply_tone_raw,
    reply_signature,
    clientTone: client_tone ?? null,
    rating,
  });

  const userRules =
    client_rules && client_rules.length
      ? ["USER RULES (highest priority):", ...client_rules.map((r) => `- ${r}`)].join("\n")
      : "";

  const voiceSamplesBlock = buildVoiceSamplesBlock(voice_samples ?? []);

  const ratingStrategy =
    rating <= 2
      ? [
          "RATING STRATEGY (1–2★):",
          "- Start with a brief, human apology/acknowledgement (short clause).",
          "- Mention exactly one concrete detail from the review.",
          "- One short line inviting them to reach out (no placeholders, no corporate framing).",
          "- Do NOT argue. Do NOT make big promises.",
        ].join("\n")
      : rating === 3
        ? [
            "RATING STRATEGY (3★):",
            "- One short appreciation line + one short acknowledgement of what missed.",
            "- Invite more detail in one short line if helpful.",
            "- Stay non-salesy and non-defensive.",
          ].join("\n")
        : rating === 4
          ? [
              "RATING STRATEGY (4★):",
              "- Appreciative and forward-looking.",
              "- If a small critique exists, acknowledge it briefly.",
              "- Close with a simple welcome back.",
            ].join("\n")
          : [
              "RATING STRATEGY (5★):",
              "- Short, sincere, specific.",
              "- Close with a simple welcome back.",
            ].join("\n");

  return `
You are writing a public reply to a Google review.

VOICE PROFILE:
- ${voiceProfile}

HARD CONSTRAINTS (follow exactly):
- Max sentences: ${maxSentences}
- No emojis
- No quotes from the review
- Do not invent details
- Output ONLY the reply text (no labels, no bullet points)
- Never include placeholders like [email/phone]
- Do NOT start with "We regret" (it reads corporate/stiff)

${ratingStrategy}

MUST DO:
${mustDo.map((x) => `- ${x}`).join("\n")}

MUST NOT DO:
${mustNot.map((x) => `- ${x}`).join("\n")}

BANNED PHRASES / AI-TELLS (do not use any of these, even partially):
${avoidLines.length ? avoidLines.map((l) => `- ${l}`).join("\n") : "- (none)"}

${voiceSamplesBlock ? `${voiceSamplesBlock}\n` : ""}

${userRules ? `${userRules}\n` : ""}

LANGUAGE:
- ${languageInstruction(owner_language)}
- Draft in the OWNER language.

BUSINESS: ${business_name}
RATING: ${rating}/5

REVIEW:
"""
${review_text}
"""

Return ONLY the reply text.
`.trim();
}

function appendSignatureIfMissing(reply: string, signature: string | null) {
  const sig = cleanString(signature, 80);
  if (!sig) return reply;

  const normalized = reply.toLowerCase();
  const marker = `— ${sig}`.toLowerCase();
  if (normalized.includes(marker)) return reply;

  return `${reply.trim()}\n— ${sig}`.trim();
}

/**
 * Rating-aware post-clean:
 * - For 1–2★: do NOT strip short apology openers (they’re useful).
 * - For 3–5★: strip corporate openers if they slip in.
 */
function stripTemplatedOpeners(text: string, rating: number) {
  let t = text.trim();

  // Always remove stiff "We regret..." opener if it happens
  t = t.replace(/^\s*we\s+regret\b[^a-z0-9]+/i, "");
  t = t.replace(/^\s*we\s+regret\b/i, "");

  // For 3–5★, strip common template-y openers
  if (rating >= 3) {
    const patterns: RegExp[] = [
      /^\s*(thank you( so much)?( for (your|the) (review|feedback|kind words))?)[,!.]\s*/i,
      /^\s*(we (really )?appreciate( you| your)?( taking the time)?)[,!.]\s*/i,
      /^\s*(we take (your )?(concerns|feedback) very seriously)[,!.]\s*/i,
      /^\s*(we strive to|we aim to)[^.!?]*[.!?]\s*/i,
    ];
    for (const re of patterns) t = t.replace(re, "");
  }

  // Never allow bracket placeholders
  t = t.replace(/\[(email\/phone|email|phone)\]/gi, "");
  return t.trim();
}

/**
 * If the model still starts with "We regret...", rewrite the opener into something human.
 * Keep it minimal and preserve the rest of the content.
 */
function rewriteLeadingWeRegret(reply: string, rating: number) {
  const t = reply.trim();
  if (!/^we\s+regret\b/i.test(t)) return reply;

  // Remove the "We regret ..." clause up to first punctuation, if present
  const stripped = t.replace(/^we\s+regret\b[^.!?]*[.!?]\s*/i, "");

  // Replace with a more natural opener. Keep it calm.
  const opener = rating <= 2 ? "Sorry about that — " : "Appreciate you flagging this — ";
  return (opener + stripped).trim();
}

/**
 * Prevent placeholder-y contact language and overly corporate "make it right" claims.
 */
function sanitizePlaceholdersAndClaims(reply: string) {
  let t = reply;

  // Remove bracket placeholders
  t = t.replace(/\[(email\/phone|email|phone)\]/gi, "");

  // Replace "make it right" with softer, safer phrasing
  t = t.replace(/\bmake it right\b/gi, "talk it through");

  // Avoid grand promises like "we'll improve based on your feedback" (swap to lighter)
  t = t.replace(/\bwe('?| a)ll improve based on your feedback\b/gi, "we’ll take your note on board");

  return t.trim();
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

    const review_text = cleanString((body as any)?.review_text, 5000);
    const business_name = cleanString((body as any)?.business_name, 200);
    const reviewer_language = cleanLanguage((body as any)?.language); // kept for meta
    const rating = parseRating((body as any)?.rating);

    if (!review_text) {
      return NextResponse.json({ ok: false, error: "review_text is required" }, { status: 400 });
    }
    if (!business_name) {
      return NextResponse.json({ ok: false, error: "business_name is required" }, { status: 400 });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ ok: false, error: "rating must be 1–5" }, { status: 400 });
    }

    const clientToneRaw = parseClientTone((body as any)?.tone);
    const clientTone = clientToneRaw ? clampToneForRating(clientToneRaw, rating) : null;
    const clientRules = parseClientRules((body as any)?.rules);

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

    const voiceSamples = await loadVoiceSamplesForOrg({
      maxItems: 7,
      maxCharsEach: 420,
      maxTotalChars: 2400,
    });

    const orgVoice = await loadVoiceProfile();
    const merged = { ...orgVoice, ...(((body as any)?.voice ?? {}) as any) };

    const toneFromOrg = normalizeToneFromOrg(org_reply_tone_raw);

    const voice = normalizeVoice({
      ...merged,
      tone: (merged as any)?.tone ? (merged as any).tone : toneFromOrg,
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
      voice_samples: voiceSamples,
    });

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: rating <= 2 ? 0.2 : rating === 3 ? 0.22 : 0.25,
        frequency_penalty: 0.2,
        presence_penalty: 0.1,
        messages: [
          {
            role: "system",
            content:
              "You write short, human-sounding public review replies for local businesses. Follow constraints exactly. Output only the reply text.",
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
    content = collapseWhitespace(content);

    // Rating-aware opener cleanup
    content = stripTemplatedOpeners(content, rating);

    // Rewrite stiff "We regret..." opener if it slips through
    content = rewriteLeadingWeRegret(content, rating);

    // Prevent placeholders + soften risky claims
    content = sanitizePlaceholdersAndClaims(content);

    // Sentence enforcement
    content = limitSentences(content, sentencePolicyForRating(rating));

    // Exclamation enforcement (also removes Spanish inverted ¡)
    if (!voice.allow_exclamation) {
      content = content.replace(/[!¡]/g, ".");
      content = content.replace(/\.\.+/g, ".").trim();
    } else {
      const exCount = (content.match(/[!¡]/g) ?? []).length;
      if (exCount > 1) {
        let seen = 0;
        content = content.replace(/[!¡]/g, (m) => {
          seen += 1;
          return seen === 1 ? m : ".";
        });
        content = content.replace(/\.\.+/g, ".").trim();
      }
    }

    // Signature enforcement
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
          voice_samples_used: voiceSamples.length,
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
