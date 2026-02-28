// app/api/reviews/draft-reply/route.ts

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/subscriptionServer";
import { requireOrgContext } from "@/lib/orgServer";
import crypto from "crypto";

const PROMPT_VERSION = "draft-reply-v1";
const BANNED_LIST_VERSION = "banned-v1";
const POST_CLEAN_VERSION = "postclean-v2"; // ✅ B4

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input ?? "", "utf8").digest("hex");
}

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
  const t = (text ?? "").trim();
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
    "it sounds like",
    "it seems like",
    "we aim to",
    "we aim for",
    "we strive to",
    "our goal is to",
    "we work hard to",
    "we regret",
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
 * Voice samples (A4 selection already present in this file)
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
  const L = (text || "").length;
  if (!L) return 0;

  const min = 80;
  const idealLo = 110;
  const idealHi = 420;
  const hardMax = 700;

  if (L < min) return clamp01(L / min) * 0.4;
  if (L >= idealLo && L <= idealHi) return 1.0;
  if (L > hardMax) return 0.2;

  const decay = 1 - (L - idealHi) / (hardMax - idealHi);
  return clamp01(decay);
}

function scoreSpecificity(text: string) {
  const raw = text || "";
  const tokens = tokenize(raw);
  if (tokens.length === 0) return 0;

  const unique = new Set(tokens);
  const uniqRatio = unique.size / tokens.length;

  const hasDigit = /\d/.test(raw);
  const hasCapWord = /\b[A-Z][a-z]{2,}\b/.test(raw);
  const hasDetailMarker = /\b(today|tonight|yesterday|weekend|morning|afternoon|evening)\b/i.test(
    raw
  );

  const base = clamp01((uniqRatio - 0.35) / 0.35);
  const bonus = (hasDigit ? 0.15 : 0) + (hasCapWord ? 0.12 : 0) + (hasDetailMarker ? 0.08 : 0);

  return clamp01(base + bonus);
}

function scoreAntiTemplate(text: string, avoidPhrases: string[]) {
  const t = (text || "").toLowerCase();
  let penalty = 0;

  for (const p of avoidPhrases) {
    const pp = String(p || "").trim();
    if (!pp) continue;
    const re = new RegExp(`\\b${escapeRegex(pp.toLowerCase())}\\b`, "i");
    if (re.test(t)) penalty += 0.35;
  }

  if (/\b(book now|special offer|promo|discount|follow us|check out|visit our)\b/i.test(t))
    penalty += 0.35;

  if ((t.match(/[!¡]/g) ?? []).length >= 2) penalty += 0.15;

  if (/\b(we hope to see you again|hope to see you soon|come back soon)\b/i.test(t))
    penalty += 0.08;

  if (/\b(valued (customer|guest)|your satisfaction|our commitment)\b/i.test(t))
    penalty += 0.25;

  return clamp01(1 - penalty);
}

function scoreSample(cleanedText: string, avoidPhrases: string[]) {
  const L = scoreLength(cleanedText);
  const S = scoreSpecificity(cleanedText);
  const A = scoreAntiTemplate(cleanedText, avoidPhrases);

  const sent = splitSentences(cleanedText).length;
  const sentScore = sent >= 1 && sent <= 3 ? 1 : sent === 4 ? 0.7 : 0.45;

  return 0.48 * A + 0.26 * L + 0.18 * S + 0.08 * sentScore;
}

async function loadVoiceSamplesForOrg(opts?: {
  maxItems?: number;
  maxCharsEach?: number;
  maxTotalChars?: number;
}): Promise<{ samples: string[]; sampleIds: string[] }> {
  const maxItems = opts?.maxItems ?? 7;
  const maxCharsEach = opts?.maxCharsEach ?? 420;
  const maxTotalChars = opts?.maxTotalChars ?? 2400;

  try {
    const { supabase, organizationId } = await requireOrgContext();

    const candidateLimit = 50;

    const { data, error } = await supabase
      .from("org_voice_samples")
      .select("id,sample_text,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(candidateLimit);

    if (error) return { samples: [], sampleIds: [] };

    const rows = (data ?? []) as VoiceSampleRow[];

    const avoidPhrases = (DEFAULT_VOICE.things_to_avoid ?? [])
      .map((x) => String(x))
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 120);

    const candidates = rows
      .map((r) => {
        const raw = cleanString(r.sample_text, 5000);
        const clipped = truncateForPrompt(raw, maxCharsEach);
        const normalized = collapseWhitespace(removeQuotations(stripEmojis(clipped)));
        const cleaned = normalized;
        if (!cleaned) return null;

        const score = scoreSample(cleaned, avoidPhrases);
        const tokenSet = new Set(tokenize(cleaned));

        return { id: r.id, cleaned, score, tokenSet, created_at: r.created_at ?? "" };
      })
      .filter(Boolean) as Array<{
      id: string;
      cleaned: string;
      score: number;
      tokenSet: Set<string>;
      created_at: string;
    }>;

    if (candidates.length === 0) return { samples: [], sampleIds: [] };

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(b.created_at).localeCompare(String(a.created_at));
    });

    const selected: Array<{ id: string; cleaned: string; tokenSet: Set<string> }> = [];
    let total = 0;

    for (const c of candidates) {
      if (selected.length >= Math.max(1, Math.min(maxItems, 12))) break;

      const nextLen = c.cleaned.length + 10;
      if (total + nextLen > maxTotalChars) continue;

      let tooSimilar = false;
      for (const s of selected) {
        if (jaccard(c.tokenSet, s.tokenSet) >= 0.78) {
          tooSimilar = true;
          break;
        }
      }
      if (tooSimilar) continue;

      selected.push({ id: c.id, cleaned: c.cleaned, tokenSet: c.tokenSet });
      total += nextLen;
    }

    if (selected.length < Math.min(maxItems, 3)) {
      for (const c of candidates) {
        if (selected.length >= Math.max(1, Math.min(maxItems, 12))) break;
        if (selected.some((s) => s.id === c.id)) continue;

        const nextLen = c.cleaned.length + 10;
        if (total + nextLen > maxTotalChars) continue;

        selected.push({ id: c.id, cleaned: c.cleaned, tokenSet: c.tokenSet });
        total += nextLen;
      }
    }

    return {
      samples: selected.map((x) => x.cleaned),
      sampleIds: selected.map((x) => x.id),
    };
  } catch {
    return { samples: [], sampleIds: [] };
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
  if (rating === 3) return 3;
  if (rating === 2) return 3;
  return 3;
}

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
      "Open with ONE short apology or acknowledgment in your first sentence only. Do NOT apologize again in any other sentence.",
      "Acknowledge disappointment calmly (no defensiveness).",
      "If inviting follow-up, keep it ONE short human line (no corporate framing).",
      "Do NOT apologize more than once. One acknowledgment total.",
    ];
  }

  return [
    ...base,
    "Open with ONE short apology or acknowledgment in your first sentence only. Do NOT apologize again in any other sentence.",
    "Be calm and direct. Avoid long apologies and PR language.",
    "If inviting follow-up, keep it ONE short line (email/phone), not legalistic.",
    "Do NOT apologize more than once. One acknowledgment total.",
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
    return [...base, "Do NOT over-apologize. Only apologize if the guest clearly had a problem."];
  }

  if (rating <= 2) {
    return [
      ...base,
      "Do NOT be playful or joking.",
      "Do NOT argue with the reviewer.",
      "Do NOT blame the customer.",
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

function stripTemplatedOpeners(text: string) {
  let t = (text ?? "").trim();
  const patterns: RegExp[] = [
    /^\s*(thank you( so much)?( for (your|the) (review|feedback|kind words))?)[,!.]\s*/i,
    /^\s*(we (really )?appreciate( you| your)?( taking the time)?)[,!.]\s*/i,
    /^\s*(it\s+(sounds|seems)\s+like)[,!.]?\s*/i,
    /^\s*(we\s+regret(\s+that)?)[,!.]?\s*/i,
  ];
  for (const re of patterns) t = t.replace(re, "");
  return t.trim();
}

function sanitizeCorporatePhrases(text: string) {
  let t = text;
  t = t.replace(/\b(it\s+(sounds|seems)\s+like)\b[, ]*/gi, "");
  t = t.replace(/\bwe\s+aim\s+to\b/gi, "we want to");
  t = t.replace(/\bwe\s+aim\s+for\b/gi, "we want");
  t = t.replace(/\bwe\s+strive\s+to\b/gi, "we try to");
  t = t.replace(/\bour\s+goal\s+is\s+to\b/gi, "we want to");
  t = t.replace(/\bwe\s+work\s+hard\s+to\b/gi, "we try to");
  t = t.replace(
    /\bwe\s+take\s+(your\s+)?(feedback|concerns|complaint|complaints|comments)\s+(very\s+)?seriously\b[, ]*/gi,
    ""
  );
  t = t.replace(/\bwe\s+regret(\s+that)?\b/gi, "sorry");
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

function reviewerMentionsCapacityExcuse(reviewText: string) {
  const r = (reviewText ?? "").toLowerCase();
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
  if (rating > 2) return t;

  if (reviewerMentionsCapacityExcuse(review_text)) return t;

  const excuseRe = /\b(busy|overwhelmed|understaffed|under-staffed|short[-\s]?staffed|slammed|swamped)\b/i;
  const parts = splitSentences(t);
  const kept = parts.filter((s) => !excuseRe.test(s));
  return kept.length === 0 ? t : kept.join(" ").trim();
}

/* =========================
   ✅ B4: First-sentence detail enforcement + closer cleanup
   ========================= */

   const STOPWORDS = new Set(
    [
      "the","and","for","with","this","that","was","were","are","is","to","of","in","on","at","it",
      "we","i","you","they","them","our","your","my","me","a","an","as","but","so","very","really",
      "just","too","not","no","yes","had","have","has","be","been","from","again","back","there",
      "here","great","good","nice","love","loved","amazing","awesome","best","worst","bad","okay",
      "food","service","such","place","overall","also","quite","little","much","more","some","than",
      "when","what","how","all","out","its","one","can","get","got","said","even","well","went",
      "like","did","dont","doesnt","wasnt","werent","isnt","about","would","could","should","their","cute","lovely","beautiful","wonderful","fantastic","excellent","perfect","clean","busy","full"
    ]
  );

const DETAIL_HINT_RE =
  /\b(server|staff|team|host|bartender|barista|chef|manager|wine|coffee|espresso|cocktail|beer|pizza|pasta|steak|sushi|taco|burger|salad|dessert|cake|ice cream|breakfast|brunch|lunch|dinner|table|patio|music|vibe|atmosphere|reservation|wait|line|checkout|price|portion|parking|bathroom|restroom|clean|location)\b/i;

function pickDetailKeyword(reviewText: string) {
  const t = (reviewText ?? "").trim();
  if (!t) return null;

  // Prefer a known “detail hint” term if present
  const m = t.match(DETAIL_HINT_RE);
  if (m && m[0]) return m[0].trim();

  // Otherwise pick a decent non-stopword token (length >= 4)
  const tokens = tokenize(t);
  const candidates = tokens
    .filter((w) => w.length >= 4)
    .filter((w) => !STOPWORDS.has(w))
    .slice(0, 80);

  if (candidates.length === 0) return null;

  // Slight preference: earlier words often are the detail
  return candidates[0];
}

function firstSentenceMentionsKeyword(reply: string, keyword: string) {
  const parts = splitSentences(reply);
  if (parts.length === 0) return false;
  const first = parts[0].toLowerCase();
  return first.includes(keyword.toLowerCase());
}

function isGenericFirstSentence(s: string) {
  const t = (s ?? "").toLowerCase();
  // Very light heuristic: first sentence that is basically gratitude with no specifics
  return (
    /\b(thank you|thanks|appreciate)\b/.test(t) &&
    !DETAIL_HINT_RE.test(t) &&
    t.length <= 120
  );
}

function buildFirstSentenceWithKeyword(params: {
  keyword: string;
  rating: number;
  owner_language: string;
  voice: ReturnType<typeof normalizeVoice>;
}) {
  const { keyword, rating, owner_language, voice } = params;
  const lang = normLang(owner_language);

  const whoWe = voice.reply_as === "we";
  const subj = whoWe ? "We" : "I";

  // Keep it safe: mention ONLY the keyword, no invented claims.
  if (lang === "es") {
    if (rating <= 2) return `Lamentamos lo de ${keyword}.`;
    return `Gracias por mencionar ${keyword}.`;
  }
  if (lang === "pt") {
    if (rating <= 2) return `Sinto muito pelo problema com ${keyword}.`;
    return `Obrigado(a) por mencionar ${keyword}.`;
  }
  if (lang === "fr") {
    if (rating <= 2) return `Désolé pour le souci avec ${keyword}.`;
    return `Merci d’avoir mentionné ${keyword}.`;
  }
  if (lang === "it") {
    if (rating <= 2) return `Mi dispiace per il problema con ${keyword}.`;
    return `Grazie per aver menzionato ${keyword}.`;
  }
  if (lang === "de") {
    if (rating <= 2) return `Es tut mir leid wegen ${keyword}.`;
    return `Danke, dass du ${keyword} erwähnt hast.`;
  }

  // default EN
  if (rating <= 2) return `${subj}’re sorry about the ${keyword}.`.replace("I’re", "I’m");
  return `Thanks for mentioning the ${keyword}.`;
}

function normLang(tag: string) {
  return (tag || "").trim().toLowerCase().split("-")[0];
}

function enforceFirstSentenceDetail(params: {
  reply: string;
  review_text: string;
  rating: number;
  owner_language: string;
  voice: ReturnType<typeof normalizeVoice>;
}) {
  const { reply, review_text, rating, owner_language, voice } = params;

  const keyword = pickDetailKeyword(review_text);
if (!keyword || !DETAIL_HINT_RE.test(keyword)) {
  return { text: reply, enforced: false, keyword: null };
}

  const parts = splitSentences(reply);
  if (parts.length === 0) return { text: reply, enforced: false, keyword };

  if (firstSentenceMentionsKeyword(reply, keyword)) {
    return { text: reply, enforced: false, keyword };
  }

  const first = parts[0];
  const replacement = buildFirstSentenceWithKeyword({ keyword, rating, owner_language, voice });

  // If the first sentence is generic, replace it. Otherwise, prepend (safer).
  let nextParts: string[] = [];
  if (isGenericFirstSentence(first)) {
    nextParts = [replacement, ...parts.slice(1)];
  } else {
    nextParts = [replacement, ...parts];
  }

// If we injected an apology, strip any duplicate apology from remaining sentences
if (rating <= 2) {
  const apologyRe = /\b(lo siento|disculp|perd[oó]n|lament|sorry|apologize|apolog)/i;
  nextParts = [nextParts[0], ...nextParts.slice(1).filter(s => !apologyRe.test(s))];
}

  const out = nextParts.join(" ").trim();
  return { text: out, enforced: true, keyword };
}

const REPETITIVE_CLOSER_RE =
  /\b(hope to see you again|hope to see you soon|see you again soon|come back soon|visit us again|we look forward to (?:seeing|welcoming) you)\b/i;

function stripRepetitiveClosers(reply: string, rating: number) {
  // Only apply for positive reviews, where closers tend to get template-y.
  if (rating < 4) return { text: reply, stripped: false };

  const parts = splitSentences(reply);
  if (parts.length <= 2) return { text: reply, stripped: false }; // already short

  const kept = parts.filter((s) => !REPETITIVE_CLOSER_RE.test(s));
  if (kept.length === parts.length) return { text: reply, stripped: false };

  const out = kept.join(" ").trim();
  return { text: out || reply, stripped: true };
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
    const reviewer_language = cleanLanguage((body as any)?.language);
    const rating = parseRating((body as any)?.rating);

    const debug = !!(body as any)?.debug;

    // Future-proof identifiers (optional)
    const review_id = cleanString((body as any)?.review_id, 80) || null;
    const google_review_id = cleanString((body as any)?.google_review_id, 140) || null;

    // ✅ C1: accept google_location_id or location_id
    const google_location_id =
      cleanString((body as any)?.google_location_id, 240) ||
      cleanString((body as any)?.location_id, 240) ||
      null;

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
      return NextResponse.json(
       { ok: false, error: "Missing ANTHROPIC_API_KEY in server env. Add in Vercel and redeploy." },
       { status: 500 }
     );
    }

    const orgSettings = await loadOrgReplySettings();
    const owner_language = orgSettings.owner_language || "en";
    const org_reply_tone_raw = orgSettings.reply_tone || "warm";
    const reply_signature = orgSettings.reply_signature ?? null;

    const { samples: voiceSamples, sampleIds: voiceSampleIds } = await loadVoiceSamplesForOrg({
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

    const temperature = rating <= 2 ? 0.15 : 0.25;
    const model = "claude-haiku-4-5-20251001";

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

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature,
        max_tokens: 260,
        system:
          "You write short, human-sounding public review replies for local businesses. Follow constraints exactly. Output only the reply text.",
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

    // ✅ B4: First sentence must reference a detail (keyword-only, no invented facts)
    const firstEnforce = enforceFirstSentenceDetail({
      reply: content,
      review_text,
      rating,
      owner_language,
      voice,
    });
    content = firstEnforce.text;

    // ✅ B4: strip repetitive closers on 4–5★ (when redundant)
    const closerStrip = stripRepetitiveClosers(content, rating);
    content = closerStrip.text;

    // Sentence enforcement
    content = limitSentences(content, sentencePolicyForRating(rating));

    // Exclamation enforcement
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
        { ok: false, error: "No reply content returned from Anthropic", upstreamBody: upstreamJson },
        { status: 502 }
      );
    }

    // ✅ B1/C1: audit log insert (best-effort)
    try {
      const { supabase, organizationId } = await requireOrgContext();

      const reviewHash = sha256Hex(review_text);
      const promptFingerprint = sha256Hex(
        [
          PROMPT_VERSION,
          BANNED_LIST_VERSION,
          POST_CLEAN_VERSION,
          model,
          String(temperature),
          voiceSampleIds.join(","),
        ].join("|")
      );

      const auditRow: any = {
        organization_id: organizationId,
        rating: Math.round(Number(rating)),
        review_hash: reviewHash,
        prompt_fingerprint: promptFingerprint,
        prompt_version: PROMPT_VERSION,
        banned_list_version: BANNED_LIST_VERSION,
        model,
        temperature,
        voice_sample_count: voiceSampleIds.length,
        voice_sample_ids: voiceSampleIds,
        review_id: review_id,
        google_review_id: google_review_id,
        google_location_id: google_location_id,
        location_id: google_location_id, // compatibility
      };

      if (
        auditRow.review_id &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          auditRow.review_id
        )
      ) {
        auditRow.review_id = null;
      }

      const { error: auditErr } = await supabase.from("draft_audit_logs").insert(auditRow);
      if (auditErr) console.warn("draft_audit_logs insert failed:", auditErr.message);
    } catch (e: any) {
      console.warn("draft_audit_logs insert exception:", e?.message ?? e);
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
          google_location_id: google_location_id ?? null,
          ...(debug
            ? {
                enforcement: {
                  post_clean_version: POST_CLEAN_VERSION,
                  keyword: firstEnforce.keyword,
                  first_sentence_enforced: firstEnforce.enforced,
                  closer_stripped: closerStrip.stripped,
                },
              }
            : {}),
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