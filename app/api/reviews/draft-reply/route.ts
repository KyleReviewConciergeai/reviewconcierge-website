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

function splitSentences(text: string) {
  const t = (text ?? "").trim();
  if (!t) return [];
  return t
    .split(/(?<=[.!?])\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function limitSentences(text: string, maxSentences: number) {
  const t = text.trim();
  if (!t) return t;

  const parts = splitSentences(t);
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
    "keep your feedback in mind",
    "refine our",
    "enhance our",

    // AI-ish tells (keep these banned; we’ll ALSO enforce post-clean)
    "it sounds like",
    "it seems like",

    // “mission statement” phrasing
    "we aim to",
    "we aim for",
    "we strive to",
    "our goal is to",
    "we work hard to",

    // “we regret” is awkward/template-y; ban it
    "we regret",

    // Excuse-y / invented context (ban common patterns, not single words)
    "we were busy",
    "we're busy",
    "we are busy",
    "our team was busy",
    "it was a busy night",
    "it was a busy day",
    "we were overwhelmed",
    "we're overwhelmed",
    "we are overwhelmed",
    "our team was overwhelmed",
    "we were slammed",
    "we were swamped",
    "we were short-staffed",
    "we were short staffed",
    "we were understaffed",
    "short-staffed",
    "understaffed",
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
 * load voice samples (org_voice_samples)
 * We use these as style reference only (never copy verbatim).
 *
 * A4 update:
 * - Fetch a wider set
 * - Sanitize deterministically
 * - Score for usefulness (length window, specificity, anti-template)
 * - Select "best N" with diversity + token/char budget
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

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function tokenize(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúüñçàèìòùâêîôûãõäëïöüß\s]/gi, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 250);
}

function jaccard(a: Set<string>, b: Set<string>) {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function scoreLength(text: string) {
  // Ideal window: ~110–420 chars. Penalize very short / very long.
  const L = (text || "").length;
  if (!L) return 0;

  const min = 80;
  const idealLo = 110;
  const idealHi = 420;
  const hardMax = 700;

  if (L < min) return clamp01(L / min) * 0.4; // too short
  if (L >= idealLo && L <= idealHi) return 1.0; // great
  if (L > hardMax) return 0.2; // too long
  // Between idealHi and hardMax: linearly decay
  const decay = 1 - (L - idealHi) / (hardMax - idealHi);
  return clamp01(decay);
}

function scoreSpecificity(text: string) {
  // Heuristic: reward concrete-ish content without being a template.
  // - reward: presence of digits (times/dates), named items (capitalized words), or descriptive adjectives.
  // - reward: higher unique token ratio (but clamp)
  const raw = text || "";
  const tokens = tokenize(raw);
  if (tokens.length === 0) return 0;

  const unique = new Set(tokens);
  const uniqRatio = unique.size / tokens.length; // 0..1

  const hasDigit = /\d/.test(raw);
  const hasCapWord = /\b[A-Z][a-z]{2,}\b/.test(raw); // named dish/staff/spot (rough)
  const hasDetailMarker = /\b(today|tonight|yesterday|weekend|morning|afternoon|evening)\b/i.test(raw);

  const base = clamp01((uniqRatio - 0.35) / 0.35); // maps ~0.35..0.70 -> 0..1
  const bonus = (hasDigit ? 0.15 : 0) + (hasCapWord ? 0.12 : 0) + (hasDetailMarker ? 0.08 : 0);

  return clamp01(base + bonus);
}

function scoreAntiTemplate(text: string, avoidPhrases: string[]) {
  // Penalize corporate/AI tells / marketing patterns.
  const t = (text || "").toLowerCase();
  let penalty = 0;

  // strong penalties for banned phrases
  for (const p of avoidPhrases) {
    const pp = String(p || "").trim();
    if (!pp) continue;
    const re = new RegExp(`\\b${escapeRegex(pp.toLowerCase())}\\b`, "i");
    if (re.test(t)) penalty += 0.35;
  }

  // marketing / CTA / links
  if (/\b(book now|special offer|promo|discount|follow us|check out|visit our)\b/i.test(t))
    penalty += 0.35;

  // too many exclamations / emojis (even though we strip, detect intent)
  if ((t.match(/[!¡]/g) ?? []).length >= 2) penalty += 0.15;

  // overly formulaic closers
  if (/\b(we hope to see you again|hope to see you soon|come back soon)\b/i.test(t))
    penalty += 0.08;

  // generic corporate nouns
  if (/\b(valued (customer|guest)|your satisfaction|our commitment)\b/i.test(t))
    penalty += 0.25;

  return clamp01(1 - penalty);
}

function scoreSample(cleanedText: string, avoidPhrases: string[]) {
  // Weighted blend: anti-template is most important
  const L = scoreLength(cleanedText); // 0..1
  const S = scoreSpecificity(cleanedText); // 0..1
  const A = scoreAntiTemplate(cleanedText, avoidPhrases); // 0..1

  // Encourage 1–3 sentences
  const sent = splitSentences(cleanedText).length;
  const sentScore = sent >= 1 && sent <= 3 ? 1 : sent === 4 ? 0.7 : 0.45;

  return (
    0.48 * A + // anti-template
    0.26 * L + // length window
    0.18 * S + // specificity
    0.08 * sentScore // sentence count
  );
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

    // Pull a broader candidate pool for scoring
    const candidateLimit = 50;

    const { data, error } = await supabase
      .from("org_voice_samples")
      .select("id,sample_text,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(candidateLimit);

    if (error) return [];

    const rows = (data ?? []) as VoiceSampleRow[];

    // Build avoid list from DEFAULT_VOICE (deterministic; matches our banned-phrase philosophy)
    const avoidPhrases = (DEFAULT_VOICE.things_to_avoid ?? [])
      .map((x) => String(x))
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 120);

    // Sanitize + score
    const candidates = rows
      .map((r) => {
        const raw = cleanString(r.sample_text, 5000);
        const clipped = truncateForPrompt(raw, maxCharsEach);
        const normalized = collapseWhitespace(removeQuotations(stripEmojis(clipped)));
        const cleaned = normalized;
        if (!cleaned) return null;

        const score = scoreSample(cleaned, avoidPhrases);
        const tokenSet = new Set(tokenize(cleaned));

        return {
          id: r.id,
          cleaned,
          score,
          tokenSet,
          created_at: r.created_at ?? "",
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      cleaned: string;
      score: number;
      tokenSet: Set<string>;
      created_at: string;
    }>;

    if (candidates.length === 0) return [];

    // Sort by best score first, tie-break by recency
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // fallback: newer first
      return String(b.created_at).localeCompare(String(a.created_at));
    });

    // Greedy selection with diversity:
    // - prefer high score
    // - penalize high similarity to already selected
    const selected: string[] = [];
    const selectedTokenSets: Set<string>[] = [];

    let total = 0;

    for (const c of candidates) {
      if (selected.length >= Math.max(1, Math.min(maxItems, 12))) break;

      const nextLen = c.cleaned.length + 10;
      if (total + nextLen > maxTotalChars) continue;

      // Diversity gate: skip if too similar to any already selected
      let tooSimilar = false;
      for (const sset of selectedTokenSets) {
        const sim = jaccard(c.tokenSet, sset);
        if (sim >= 0.78) {
          tooSimilar = true;
          break;
        }
      }
      if (tooSimilar) continue;

      selected.push(c.cleaned);
      selectedTokenSets.push(c.tokenSet);
      total += nextLen;
    }

    // If diversity filter was too strict and we selected too few, backfill with best remaining within budget
    if (selected.length < Math.min(maxItems, 3)) {
      for (const c of candidates) {
        if (selected.length >= Math.max(1, Math.min(maxItems, 12))) break;
        if (selected.includes(c.cleaned)) continue;

        const nextLen = c.cleaned.length + 10;
        if (total + nextLen > maxTotalChars) continue;

        selected.push(c.cleaned);
        total += nextLen;
      }
    }

    return selected;
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

function parseClientTone(v: unknown): VoiceProfile["tone"] | null {
  const t = cleanString(v, 24).toLowerCase().trim();
  if (!t) return null;
  if (t === "warm" || t === "neutral" || t === "direct" || t === "playful") return t;
  return null;
}

function parseClientRules(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const cleaned = v
    .map((x) => cleanString(x, 180))
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 12);
  return cleaned;
}

function clampToneForRating(tone: VoiceProfile["tone"], rating: number): VoiceProfile["tone"] {
  if (!tone) return tone;
  if (rating <= 2 && tone === "playful") return "neutral";
  return tone;
}

function sentencePolicyForRating(rating: number) {
  if (rating >= 5) return 4;
  if (rating === 4) return 3;
  if (rating === 3) return 3;
  if (rating === 2) return 3;
  return 3;
}

/**
 * Evidence-informed guidance:
 * - 1–2★: empathy up front is OK/effective, but NEVER invent "why" it happened.
 * - 3★: balanced, invite details
 * - 4–5★: appreciative, short, avoid over-apologizing
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
  ];

  if (rating >= 5) {
    return [
      ...base,
      "Be appreciative but grounded (no hype, no marketing).",
      "Close with a simple, low-pressure welcome back (not salesy).",
    ];
  }

  if (rating === 4) {
    return [
      ...base,
      "If there’s a small issue hinted, acknowledge it briefly in plain language (no corporate phrasing).",
      "Close with a simple welcome back.",
    ];
  }

  if (rating === 3) {
    return [
      ...base,
      "Thank them plainly for the honest review (no corporate phrasing).",
      "Reflect the mixed experience in a solution-oriented way.",
      "Invite one detail if helpful (short).",
    ];
  }

  if (rating === 2) {
    return [
      ...base,
      "Open with a short, human apology or acknowledgment (OK to use “Sorry about…” / “We’re sorry to hear…”).",
      "Acknowledge disappointment calmly (no defensiveness).",
      "If inviting follow-up, keep it ONE short human line (no corporate framing).",
    ];
  }

  // 1-star
  return [
    ...base,
    "Open with a short, human apology or acknowledgment (OK to use “Sorry about…” / “We’re sorry to hear…”).",
    "Be calm and direct. Avoid long apologies and PR language.",
    "If inviting follow-up, keep it ONE short line (email/phone), not legalistic.",
  ];
}

function mustNotForRating(rating: number) {
  const base = [
    "Do NOT mention AI, automation, internal processes, investigations, or policies.",
    "Do NOT offer refunds/discounts/compensation.",
    "Do NOT promise future changes or guarantees (no 'we will make sure', 'we will improve').",
    "Do NOT admit legal fault.",
    "Do NOT use corporate filler or templated empathy.",
    "Do NOT use exclamation points unless explicitly allowed (rule below).",
  ];

  if (rating >= 4) {
    return [
      ...base,
      "Do NOT over-apologize. Only apologize if the guest clearly had a problem.",
    ];
  }

  if (rating <= 2) {
    return [
      ...base,
      "Do NOT be playful or joking.",
      "Do NOT argue with the reviewer.",
      "Do NOT blame the customer.",
      // Critical: stop invented excuses
      "Do NOT explain the cause (busy/overwhelmed/short-staffed/etc.) unless the reviewer explicitly mentioned it.",
      "Do NOT justify or excuse the issue with operational context.",
    ];
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

  const signatureLine = reply_signature
    ? `Signature: end with “— ${reply_signature}”.`
    : "Signature: none.";

  const exclamationLine = voice.allow_exclamation
    ? rating >= 5
      ? "Exclamation points allowed sparingly (max 1), only if it feels natural."
      : "Exclamation points allowed sparingly (max 1) if it feels natural."
    : "No exclamation points.";

  return [who, toneLine, clientToneLine, brevityLine, formalityLine, signatureLine, exclamationLine]
    .filter(Boolean)
    .join("\n- ");
}

function buildAvoidList(voice: ReturnType<typeof normalizeVoice>) {
  const avoid = Array.isArray(voice.things_to_avoid) ? voice.things_to_avoid : [];
  const list = avoid.map((s) => cleanString(s, 80)).filter(Boolean).slice(0, 60);
  if (!list.length) return "";
  return list.join(" | ");
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

  const avoidList = buildAvoidList(voice);
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

  // Extra hard rule for low ratings: apology OK, but NO invented reasons
  const lowStarExtra =
    rating <= 2
      ? [
          "LOW-STAR RULE (critical):",
          "- You MAY apologize up front.",
          "- You MUST NOT explain 'why it happened' (busy/overwhelmed/short-staffed/etc.) unless the reviewer explicitly said that.",
          "- Never justify with operational constraints.",
        ].join("\n")
      : "";

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

${lowStarExtra ? `${lowStarExtra}\n` : ""}

MUST DO:
${mustDo.map((x) => `- ${x}`).join("\n")}

MUST NOT DO:
${mustNot.map((x) => `- ${x}`).join("\n")}

BANNED PHRASES / AI-TELLS (do not use any of these, even partially):
${avoidList ? `- ${avoidList}` : "- (none)"}

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
 * Strip templated openers. (Start-of-reply only.)
 * We intentionally do NOT strip “we’re sorry…” because low stars benefit from it.
 */
function stripTemplatedOpeners(text: string) {
  let t = text.trim();

  const patterns: RegExp[] = [
    // Keep these (do not remove):
    // - we're sorry to hear...
    // - we apologize for...

    // Remove corporate openers / AI-ish tells
    /^\s*(thank you( so much)?( for (your|the) (review|feedback|kind words))?)[,!.]\s*/i,
    /^\s*(we (really )?appreciate( you| your)?( taking the time)?)[,!.]\s*/i,

    // Remove “it sounds like …” / “it seems like …” openers (AI tell)
    /^\s*(it\s+(sounds|seems)\s+like)[,!.]?\s*/i,

    // Remove “we regret …” opener (awkward + template-y)
    /^\s*(we\s+regret(\s+that)?)[,!.]?\s*/i,
  ];

  for (const re of patterns) {
    t = t.replace(re, "");
  }

  return t.trim();
}

/**
 * Mission-statement / corporate phrasing tends to leak mid-sentence.
 * This makes it deterministic by rewriting/stripping common patterns anywhere.
 */
function sanitizeCorporatePhrases(text: string) {
  let t = text;

  // 1) Remove/neutralize “it sounds like …” anywhere (not only opener)
  t = t.replace(/\b(it\s+(sounds|seems)\s+like)\b[, ]*/gi, "");

  // 2) Rewrite mission-statement phrasing (anywhere)
  // Keep meaning but make it human.
  t = t.replace(/\bwe\s+aim\s+to\b/gi, "we want to");
  t = t.replace(/\bwe\s+aim\s+for\b/gi, "we want");
  t = t.replace(/\bwe\s+strive\s+to\b/gi, "we try to");
  t = t.replace(/\bour\s+goal\s+is\s+to\b/gi, "we want to");
  t = t.replace(/\bwe\s+work\s+hard\s+to\b/gi, "we try to");

  // 3) Remove corporate “we take X seriously” phrasing
  // (Often reads like a template.)
  t = t.replace(
    /\bwe\s+take\s+(your\s+)?(feedback|concerns|complaint|complaints|comments)\s+(very\s+)?seriously\b[, ]*/gi,
    ""
  );

  // 4) Remove “we regret…” anywhere (not just opener).
  // Replace with a softer human clause.
  t = t.replace(/\bwe\s+regret(\s+that)?\b/gi, "sorry");

  // Cleanup punctuation spacing after removals
  t = t.replace(/\s+,/g, ",");
  t = t.replace(/\s+\./g, ".");
  t = t.replace(/\s+!/g, "!");
  t = t.replace(/\s+\?/g, "?");
  t = collapseWhitespace(t);

  return t.trim();
}

function capitalizeIfNeeded(text: string) {
  const t = (text ?? "").trim();
  if (!t) return t;
  const first = t.charAt(0);
  if (first >= "a" && first <= "z") return first.toUpperCase() + t.slice(1);
  return t;
}

/**
 * Remove “excuse” / invented operational context for low-star replies,
 * UNLESS the reviewer explicitly mentioned it.
 */
function reviewerMentionsCapacityExcuse(reviewText: string) {
  const r = (reviewText ?? "").toLowerCase();
  // Only allow if reviewer explicitly mentions these concepts.
  return /(busy|overwhelmed|understaffed|under-staffed|short[-\s]?staffed|slammed|swamped|packed|crowded)/i.test(
    r
  );
}

function removeExcuseSentencesIfInvented(params: {
  reply: string;
  rating: number;
  review_text: string;
}) {
  const { reply, rating, review_text } = params;
  const t = (reply ?? "").trim();
  if (!t) return t;

  if (rating > 2) return t; // we only enforce this hard on 1–2★

  const allow = reviewerMentionsCapacityExcuse(review_text);
  if (allow) return t;

  const excuseRe = /\b(busy|overwhelmed|understaffed|under-staffed|short[-\s]?staffed|slammed|swamped)\b/i;

  const parts = splitSentences(t);

  // Filter out any sentence that contains excuse language.
  const kept = parts.filter((s) => !excuseRe.test(s));

  // If we removed everything (unlikely), fall back to original.
  if (kept.length === 0) return t;

  return kept.join(" ").trim();
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
        temperature: rating <= 2 ? 0.15 : 0.25,
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

    // Basic cleanup
    content = removeQuotations(content);
    content = stripEmojis(content);
    content = collapseWhitespace(content);

    // Deterministic “no-template” enforcement
    content = stripTemplatedOpeners(content);
    content = sanitizeCorporatePhrases(content);
    content = capitalizeIfNeeded(content);

    // HARD: remove invented excuse sentences for 1–2★ unless reviewer said it
    content = removeExcuseSentencesIfInvented({ reply: content, rating, review_text });

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
