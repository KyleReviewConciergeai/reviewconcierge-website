// app/api/reviews/draft-reply/route.ts

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/subscriptionServer";
import { requireOrgContext } from "@/lib/orgServer";
import crypto from "crypto";

const PROMPT_VERSION      = "draft-reply-v4";
const BANNED_LIST_VERSION = "banned-v4";
const POST_CLEAN_VERSION  = "postclean-v5";

// ─── Basic utilities ──────────────────────────────────────────────────────────

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
  return text.replace(/["""'']/g, "");
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

// ─── Apostrophe repair ────────────────────────────────────────────────────────
// The prompt enforces this at generation time. This is the safety net that catches
// any contraction that slips through — runs as a post-processing step.
function fixApostrophes(text: string): string {
  let t = text;

  const fixes: Array<[RegExp, string]> = [
    // "we're" family
    [/\bwere sorry\b/gi,     "We're sorry"],
    [/\bwere glad\b/gi,      "We're glad"],
    [/\bwere happy\b/gi,     "We're happy"],
    [/\bwere thrilled\b/gi,  "We're thrilled"],
    [/\bwere delighted\b/gi, "We're delighted"],
    [/\bwere committed\b/gi, "We're committed"],
    [/\bwere aware\b/gi,     "We're aware"],
    [/\bwere looking\b/gi,   "We're looking"],
    [/\bwere working\b/gi,   "We're working"],
    // "we'd" family
    [/\bwed like\b/gi,       "We'd like"],
    [/\bwed love\b/gi,       "We'd love"],
    [/\bwed appreciate\b/gi, "We'd appreciate"],
    [/\bwed be\b/gi,         "We'd be"],
    // "we've" / "I'm" / "I'd" / "I'll"
    [/\bweve\b/gi,           "we've"],
    [/\bIm\b/g,              "I'm"],
    [/\bId like\b/g,         "I'd like"],
    [/\bId love\b/g,         "I'd love"],
    [/\bIll \b/g,            "I'll "],
    // Standard negative contractions
    [/\bdidnt\b/gi,          "didn't"],
    [/\bdoesnt\b/gi,         "doesn't"],
    [/\bwasnt\b/gi,          "wasn't"],
    [/\bwerent\b/gi,         "weren't"],
    [/\bwouldnt\b/gi,        "wouldn't"],
    [/\bcouldnt\b/gi,        "couldn't"],
    [/\bshouldnt\b/gi,       "shouldn't"],
    [/\bisnt\b/gi,           "isn't"],
    [/\barent\b/gi,          "aren't"],
    [/\bhasnt\b/gi,          "hasn't"],
    [/\bhavent\b/gi,         "haven't"],
    [/\bwont\b/gi,           "won't"],
    [/\bcant\b/gi,           "can't"],
    [/\bdont\b/gi,           "don't"],
    // "that's / it's / what's / there's / you're"
    [/\bthats\b/gi,          "that's"],
    [/\bwhats\b/gi,          "what's"],
    [/\btheres\b/gi,         "there's"],
    [/\bits a\b/g,           "it's a"],
    [/\bits not\b/gi,        "it's not"],
    [/\bits clear\b/gi,      "it's clear"],
    [/\bits been\b/gi,       "it's been"],
    [/\byoure\b/gi,          "you're"],
  ];

  for (const [pattern, replacement] of fixes) {
    t = t.replace(pattern, replacement);
  }

  return t;
}

// ─── Sentence capitalisation repair ──────────────────────────────────────────
// Fixes the specific bug visible in the screenshot: lowercase letter after a
// sentence-ending punctuation mark followed by a space.
// Runs TWICE in the pipeline — once mid-stream, once as the final step.
function fixSentenceCapitalisation(text: string): string {
  if (!text) return text;
  // Capitalise the first character of the whole string
  let t = text.charAt(0).toUpperCase() + text.slice(1);
  // Capitalise the first letter after ". " / "! " / "? " / ".\n" etc.
  t = t.replace(/([.!?][\s]+)([a-z])/g, (_match, punct, letter) => punct + letter.toUpperCase());
  return t;
}

// ─── Language instruction ─────────────────────────────────────────────────────
function languageInstruction(languageTag: string) {
  const tag = (languageTag || "en").toLowerCase();
  switch (tag) {
    case "en":
      return "Write in English. Natural, human, non-corporate.";
    case "es":
      return "Escribe en español. Español natural, no una traducción literal. Suena como una persona real, no una marca.";
    case "pt":
    case "pt-br":
      return "Escreva em português. Português natural, não uma tradução literal.";
    case "fr":
      return "Écris en français. Français naturel, pas une traduction littérale.";
    case "it":
      return "Scrivi in italiano. Italiano naturale, non una traduzione letterale.";
    case "de":
      return "Schreibe auf Deutsch. Natürliches Deutsch, keine wörtliche Übersetzung.";
    default:
      return `Write in the owner's preferred language (${languageTag}).`;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

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
  things_to_avoid: [] as string[],
  allow_exclamation: false,
};

type OrgReplySettings = {
  owner_language: string;
  reply_tone: string;
  reply_signature: string | null;
};

// ─── Supabase loaders ─────────────────────────────────────────────────────────

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

// ─── Voice sample scoring / selection ────────────────────────────────────────

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
  const hasDetailMarker = /\b(today|tonight|yesterday|weekend|morning|afternoon|evening)\b/i.test(raw);
  const base = clamp01((uniqRatio - 0.35) / 0.35);
  const bonus = (hasDigit ? 0.15 : 0) + (hasCapWord ? 0.12 : 0) + (hasDetailMarker ? 0.08 : 0);
  return clamp01(base + bonus);
}

function scoreAntiTemplate(text: string) {
  const t = (text || "").toLowerCase();
  let penalty = 0;

  const templatePhrases = [
    "thank you for your feedback",
    "we appreciate your feedback",
    "we appreciate your thoughts",
    "we appreciate your comments",
    "thank you for taking the time",
    "thank you for sharing",
    "we strive",
    "we will look into this",
    "we take this seriously",
    "please accept our apologies",
    "valued customer",
    "valued guest",
    "did not meet expectations",
    "fell short of",
    "we understand your frustration",
    "entendemos tu frustración",
    "lamentamos profundamente",
    "nos disculpamos sinceramente",
    "agradecemos tu comentario",
    "agradecemos tu opinión",
    "tomaremos en cuenta",
    "trabajamos para mejorar",
    "agradecemos o seu comentário",
    "agradecemos o seu feedback",
    "agradecemos sua opinião",
    "pedimos desculpas sinceramente",
    "entendemos a sua frustração",
    "entendemos sua frustração",
    "levamos isso muito a sério",
    "trabalharemos para melhorar",
    "nos esforçamos",
    "esperamos vê-lo em breve",
    "esperamos recebê-lo novamente",
  ];

  for (const p of templatePhrases) {
    if (t.includes(p)) penalty += 0.35;
  }

  if (/\b(book now|special offer|promo|discount|follow us|check out|visit our)\b/i.test(t)) penalty += 0.35;
  if ((t.match(/[!¡]/g) ?? []).length >= 2) penalty += 0.15;

  return clamp01(1 - penalty);
}

function scoreSample(cleanedText: string) {
  const L = scoreLength(cleanedText);
  const S = scoreSpecificity(cleanedText);
  const A = scoreAntiTemplate(cleanedText);
  const sent = splitSentences(cleanedText).length;
  const sentScore = sent >= 1 && sent <= 3 ? 1 : sent === 4 ? 0.7 : 0.45;
  return 0.48 * A + 0.26 * L + 0.18 * S + 0.08 * sentScore;
}

async function loadVoiceSamplesForOrg(opts?: {
  maxItems?: number;
  maxCharsEach?: number;
  maxTotalChars?: number;
}): Promise<{ samples: string[]; sampleIds: string[] }> {
  const maxItems = opts?.maxItems ?? 5;
  const maxCharsEach = opts?.maxCharsEach ?? 420;
  const maxTotalChars = opts?.maxTotalChars ?? 1800;

  try {
    const { supabase, organizationId } = await requireOrgContext();

    const { data, error } = await supabase
      .from("org_voice_samples")
      .select("id,sample_text,created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return { samples: [], sampleIds: [] };

    const rows = (data ?? []) as VoiceSampleRow[];

    const candidates = rows
      .map((r) => {
        const raw = cleanString(r.sample_text, 5000);
        const clipped = truncateForPrompt(raw, maxCharsEach);
        const normalized = collapseWhitespace(removeQuotations(stripEmojis(clipped)));
        if (!normalized) return null;
        const score = scoreSample(normalized);
        const tokenSet = new Set(tokenize(normalized));
        return { id: r.id, cleaned: normalized, score, tokenSet, created_at: r.created_at ?? "" };
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
        if (jaccard(c.tokenSet, s.tokenSet) >= 0.78) { tooSimilar = true; break; }
      }
      if (tooSimilar) continue;
      selected.push({ id: c.id, cleaned: c.cleaned, tokenSet: c.tokenSet });
      total += nextLen;
    }

    return {
      samples: selected.map((x) => x.cleaned),
      sampleIds: selected.map((x) => x.id),
    };
  } catch {
    return { samples: [], sampleIds: [] };
  }
}

// ─── Voice helpers ────────────────────────────────────────────────────────────

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

function sentencePolicyForRating(rating: number, reviewWordCount?: number) {
  const words = reviewWordCount ?? 0;
  if (words > 120) return 4;
  if (words > 60) return 3;
  return 2;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────
//
// Research foundation underpinning this prompt:
//
// • Columbia Business School (Wu & Morwitz, 2025): Responses addressing BOTH the
//   emotional AND factual specifics of a complaint produce the highest re-visit
//   intention. Generic category summaries ("your experience") address neither.
//
// • Journal of Marketing Research: A single unanswered negative review on page one
//   reduces purchase likelihood by 42%. A specific, human owner reply directly
//   mitigates this effect.
//
// • Frontiers of Business Research in China (2020): Sincere, non-promotional
//   responses strongly correlate with relationship quality and repurchase intention.
//   Promotional content in replies does the opposite.
//
// • Service Recovery Paradox (McCollough & Bharadwaj; Coyle Hospitality 11,000-point
//   study): A guest whose complaint is exceptionally handled becomes MORE loyal than
//   a guest who never had a problem. Key variables: speed, empathy, specificity,
//   perceived fairness. Empathy must come BEFORE explanation.
//
// • ScienceDirect (2025): Calm, accountable responses to negative reviews increase
//   third-party purchase intent. Aggressive or defensive callouts reduce it.
//
// • Marriott LEARN / Broadmoor HEART / Starbucks LATTE frameworks all share the
//   same sequence: Acknowledge emotionally first → then respond factually.
//
function buildPrompt(params: {
  business_name: string;
  rating: number;
  owner_language: string;
  review_text: string;
  voice: ReturnType<typeof normalizeVoice>;
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
    reply_signature,
    client_rules,
    voice_samples,
  } = params;

  const who =
    voice.reply_as === "owner" || voice.reply_as === "manager"
      ? 'Write in first-person singular ("I") as the owner.'
      : 'Write in first-person plural ("we") as the business.';

  const langInstruction = languageInstruction(owner_language);

  // ── Banned phrases (EN / ES / PT / FR / IT / DE) ──────────────────────────
  const universalBanned = [
    // EN
    "thank you for your feedback",
    "we appreciate your feedback",
    "we appreciate your thoughts",
    "we appreciate your comments",
    "thank you for taking the time",
    "thank you for sharing",
    "we strive",
    "we will look into this",
    "we take this seriously",
    "please accept our apologies",
    "valued customer",
    "valued guest",
    "did not meet expectations",
    "fell short of",
    "we understand your frustration",
    "we hear you",
    "we recognize",
    "it's disappointing to hear",
    "it's concerning to hear",
    "we'll keep that in mind",
    "we aim to",
    "we strive to",
    "our goal is to",
    "we work hard to",
    "we regret",
    "we were busy",
    "short-staffed",
    "understaffed",
    // ES
    "gracias por tu comentario",
    "gracias por tu opinión",
    "agradecemos tu comentario",
    "agradecemos tu opinión",
    "agradecemos tu feedback",
    "lamentamos profundamente",
    "nos disculpamos sinceramente",
    "nos disculpamos profundamente",
    "entendemos tu frustración",
    "entendemos tu decepción",
    "entiendo tu frustración",
    "entiendo la frustración",
    "comprendo tu frustración",
    "comprendo la frustración",
    "tomamos esto muy en serio",
    "tomaremos en cuenta",
    "trabajamos para mejorar",
    "nos esforzamos",
    "nuestro objetivo es",
    "esperamos verte pronto",
    "esperamos que nos des otra oportunidad",
    // PT
    "agradecemos o seu comentário",
    "agradecemos o seu feedback",
    "lamentamos profundamente",
    "pedimos desculpas sinceramente",
    "entendemos a sua frustração",
    "nos esforçamos",
    // FR
    "merci pour votre commentaire",
    "nous vous remercions",
    "nous nous excusons sincèrement",
    "nous comprenons votre frustration",
    "nous nous efforçons",
    // IT / DE
    "grazie per il tuo feedback",
    "ci scusiamo sinceramente",
    "ci impegniamo",
    "danke für ihr feedback",
    "wir entschuldigen uns aufrichtig",
    "wir bemühen uns",
  ].join(" | ");

  const exclamationRule = voice.allow_exclamation
    ? "Maximum 1 exclamation point, only if it is completely natural."
    : "No exclamation points. Replace any with a period.";

  const signatureRule = reply_signature
    ? `Close with: — ${reply_signature}`
    : "";

  const voiceSamplesBlock =
    voice_samples && voice_samples.length > 0
      ? `VOICE REFERENCE — match this writing style only, do not copy content:\n${voice_samples.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
      : "";

  const userRulesBlock =
    client_rules && client_rules.length > 0
      ? `OWNER-SPECIFIC RULES:\n${client_rules.map((r) => `- ${r}`).join("\n")}`
      : "";

  const reviewWordCount = review_text.trim().split(/\s+/).length;
  const maxSentences = reviewWordCount > 120 ? 4 : reviewWordCount > 60 ? 3 : 2;

  // ── Rating-calibrated response strategy ────────────────────────────────────
  // Grounded in the Service Recovery Paradox and Columbia Business School research:
  // emotional acknowledgment must precede factual response for maximum re-visit intent.
  let ratingStrategy = "";
  if (rating >= 5) {
    ratingStrategy = `
5-STAR STRATEGY — Warmth + specific mirroring + low-pressure return invite
- Lead with warmth that mirrors something SPECIFIC they mentioned: a dish, a moment, a staff member by name.
- Do not be effusive, over-the-top, or use marketing language. Genuine beats enthusiastic.
- Close with a natural, low-pressure invitation to return.
- Research basis: Reinforcing specific positive memories increases revisit likelihood (peak-end rule).`;
  } else if (rating === 4) {
    ratingStrategy = `
4-STAR STRATEGY — Appreciation + gentle gap acknowledgment
- Lead with genuine appreciation for the visit.
- If the review hints at something imperfect, acknowledge it briefly and naturally — do not ignore it.
- Close simply and warmly. Do not over-promise.`;
  } else if (rating === 3) {
    ratingStrategy = `
3-STAR STRATEGY — Balanced, calm ownership
- Acknowledge the mixed experience without defensiveness.
- Take responsibility for the gap without over-explaining or making excuses.
- Show you heard both what worked and what didn't — be specific about both.
- Close with a calm, genuine note.`;
  } else if (rating === 2) {
    ratingStrategy = `
2-STAR STRATEGY — Emotional acknowledgment first, then accountability
- Research basis (Columbia Business School, Wu & Morwitz 2025): Responses that address BOTH
  the emotional AND factual dimensions of a complaint produce the highest re-visit intention.
  Emotional acknowledgment must come FIRST.
- STEP 1 — Name what went wrong specifically. Not "your experience" — name the actual thing:
  "the tour that was promised and never came," "being ignored when you asked for help,"
  "the wine program not matching what we'd described." Mirror their exact words back.
- STEP 2 — One clean sentence of accountability. No operational justifications.
  No "we were busy." No "we were understaffed." Just ownership.
- STEP 3 — Invite private resolution in one short sentence. Research shows moving to private
  channels produces better outcomes than public exchanges (Morwitz, 2025).
- ONE apology maximum. Repeating apologies signals guilt without rebuilding trust.
- The reply should sound like an owner who is genuinely disappointed in themselves —
  not defensive, not corporate, not over-apologetic.`;
  } else {
    ratingStrategy = `
1-STAR STRATEGY — Direct, calm, specific accountability
- Open by naming the specific failure concretely — not vaguely.
  Use the reviewer's own words where possible: "the wine quality," "the promised tour that
  never arrived," "waiting over an hour." If you write "your experience" you have failed.
- ONE apology. Direct and human. Not "please accept our sincerest apologies" — just "I'm sorry."
- Do not be defensive. Do not explain why it happened. Do not promise systemic change.
- If appropriate, invite them to reach out directly — one sentence only, not a plea.
- Dignity in brevity. Short, specific, accountable replies outperform long ones.
- Research basis (ScienceDirect, 2025): Calm, accountable responses increase third-party
  purchase intent. Aggressive or defensive replies reduce it.`;
  }

  return `You are the owner of "${business_name}" — a hospitality business — writing a public Google review reply. This reply is visible to every future reader, not just the reviewer. It represents the face and character of the business.

ReviewConcierge is a white-glove reputation management platform. The quality standard here is enterprise-level.

${who}

${langInstruction}

════════════════════════════════════════════════════
  MANDATORY QUALITY STANDARDS — EVERY ONE MUST BE MET
════════════════════════════════════════════════════

STANDARD 1 — GRAMMAR: NON-NEGOTIABLE. ZERO TOLERANCE.

Every contraction MUST have an apostrophe. Read your output before submitting.

  ✓ CORRECT: we're / we'd / didn't / that's / you're / wasn't / it's / I'd / I'll / we've / can't / won't
  ✗ BROKEN:  were  / wed  / didnt  / thats  / youre  / wasnt  / its  / Id  / Ill  / weve  / cant  / wont

Every sentence MUST start with a capital letter. After every period, "!", or "?" followed by a space,
the NEXT word must be capitalised.

  ✓ CORRECT: "I'm sorry that happened. You're right that the tour was promised and never arrived."
  ✗ BROKEN:  "I'm sorry that happened. you're right that the tour was promised and never arrived."

Every sentence must be grammatically complete: subject + verb + closing punctuation. No fragments.

Scan your reply word by word before outputting. Fix any broken contraction or uncapitalised sentence start.

STANDARD 2 — SPECIFICITY: PROVE YOU READ THE REVIEW.

Reference at least ONE concrete detail from the review — a specific time, dish, staff interaction,
promised service, or named incident. Do not summarise in categories.

  ✗ Generic (WRONG):  "We're sorry your experience didn't meet expectations."
  ✓ Specific (RIGHT): "A wine tour that was promised and never arrived — that's on us."

Research basis: Responses that address both emotional AND factual specifics produce the highest
guest re-visit intention (Columbia Business School, Wu & Morwitz, 2025).

STANDARD 3 — HUMAN VOICE. NOT A PRESS RELEASE.

Write the way a thoughtful owner would text a trusted friend about what happened — warm, direct,
accountable. Not corporate. Not scripted. Not hollow.

Complete sentences. But human ones.

STANDARD 4 — LENGTH: FEWER SENTENCES, MORE WEIGHT.

${maxSentences} sentences MAXIMUM. A short, specific, human reply outperforms a long generic one.

════════════════════════════════════════════════
  BANNED PHRASES — NEVER USE. NOT EVEN PARTIALLY.
════════════════════════════════════════════════

These phrases signal AI-generated corporate filler and will erode owner credibility:
${universalBanned}

════════════════════════════════════
  RATING STRATEGY
════════════════════════════════════
${ratingStrategy}

════════════════════════════════════
  HARD CONSTRAINTS
════════════════════════════════════
- ${exclamationRule}
- No emojis.
- Do not promise internal changes ("we'll retrain staff", "we've updated our procedures").
- Do not mention AI, automation, or systems.
- Do not offer refunds or compensation.
- Do not use placeholder text like [name] or [business name].
- Do not copy the reviewer's sentences — paraphrase and engage.
- One apology only, regardless of rating.

${voiceSamplesBlock ? voiceSamplesBlock + "\n\n" : ""}${userRulesBlock ? userRulesBlock + "\n\n" : ""}${signatureRule ? signatureRule + "\n\n" : ""}════════════════════════════════════
  THE REVIEW (${rating}/5 stars)
════════════════════════════════════
${review_text}

────────────────────────────────────
Write the reply now.
Complete sentences. Correct apostrophes. Every sentence capitalised. Specific. Human.
Output ONLY the reply — no labels, no preamble, no explanation.`.trim();
}

// ─── Post-processing helpers ──────────────────────────────────────────────────

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
    /^\s*(gracias por (tu|su|el|la) (comentario|opinión|feedback|reseña))[,!.]\s*/i,
    /^\s*(agradecemos (tu|su) (comentario|opinión|feedback))[,!.]\s*/i,
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
  t = t.replace(/\bwe\s+take\s+(your\s+)?(feedback|concerns|complaint|complaints|comments)\s+(very\s+)?seriously\b[, ]*/gi, "");
  t = t.replace(/\bwe\s+regret(\s+that)?\b/gi, "sorry");
  t = t.replace(/\s+,/g, ",");
  t = t.replace(/\s+\./g, ".");
  t = t.replace(/\s+!/g, "!");
  t = t.replace(/\s+\?/g, "?");
  t = collapseWhitespace(t);
  return t.trim();
}

function reviewerMentionsCapacityExcuse(reviewText: string) {
  return /(busy|overwhelmed|understaffed|under-staffed|short[-\s]?staffed|slammed|swamped|packed|crowded)/i.test(reviewText ?? "");
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

function removeDuplicateApology(reply: string, rating: number): string {
  if (rating > 3) return reply;
  const parts = splitSentences(reply);
  if (parts.length <= 1) return reply;

  const apologyRe = /\b(sorry|apologize|apolog|lo siento|disculp|perd[oó]n|lament|sinto muito|desculp|désolé|mi dispiace|es tut mir leid)\b/i;

  let apologyCount = 0;
  const kept = parts.filter((s) => {
    if (apologyRe.test(s)) {
      apologyCount++;
      return apologyCount <= 1;
    }
    return true;
  });

  return kept.join(" ").trim() || reply;
}

const REPETITIVE_CLOSER_RE =
  /\b(hope to see you again|hope to see you soon|see you again soon|come back soon|visit us again|we look forward to (?:seeing|welcoming) you|esperamos verte pronto|esperamos verte de nuevo|esperamos que (nos |)visites de nuevo)\b/i;

function stripRepetitiveClosers(reply: string, rating: number) {
  if (rating < 4) return { text: reply, stripped: false };
  const parts = splitSentences(reply);
  if (parts.length <= 2) return { text: reply, stripped: false };
  const kept = parts.filter((s) => !REPETITIVE_CLOSER_RE.test(s));
  if (kept.length === parts.length) return { text: reply, stripped: false };
  const out = kept.join(" ").trim();
  return { text: out || reply, stripped: true };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const sub = await requireActiveSubscription();
    if (!sub.ok) {
      return NextResponse.json(
        {
          ok: false,
          upgradeRequired: true,
          status: sub.status,
          error: "Your plan isn't active yet. Subscribe to draft replies.",
        },
        { status: 402 }
      );
    }

    const body = await req.json().catch(() => null);

    const review_text       = cleanString((body as any)?.review_text, 5000);
    const business_name     = cleanString((body as any)?.business_name, 200);
    const reviewer_language = cleanLanguage((body as any)?.language);
    const rating            = parseRating((body as any)?.rating);
    const debug             = !!(body as any)?.debug;

    const review_id          = cleanString((body as any)?.review_id, 80) || null;
    const google_review_id   = cleanString((body as any)?.google_review_id, 140) || null;
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
    const clientTone    = clientToneRaw ? clampToneForRating(clientToneRaw, rating) : null;
    const clientRules   = parseClientRules((body as any)?.rules);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing ANTHROPIC_API_KEY in server env. Add in Vercel and redeploy." },
        { status: 500 }
      );
    }

    const orgSettings        = await loadOrgReplySettings();
    const owner_language     = orgSettings.owner_language || "en";
    const org_reply_tone_raw = orgSettings.reply_tone || "warm";
    const reply_signature    = orgSettings.reply_signature ?? null;

    const { samples: voiceSamples, sampleIds: voiceSampleIds } = await loadVoiceSamplesForOrg({
      maxItems: 5,
      maxCharsEach: 420,
      maxTotalChars: 1800,
    });

    const orgVoice = await loadVoiceProfile();
    const merged   = { ...orgVoice, ...(((body as any)?.voice ?? {}) as any) };
    const toneFromOrg = normalizeToneFromOrg(org_reply_tone_raw);

    const voice = normalizeVoice({
      ...merged,
      tone: (merged as any)?.tone ? (merged as any).tone : toneFromOrg,
    });

    // Lower temperature = fewer grammar drift / contraction failures
    const temperature = rating <= 2 ? 0.15 : 0.25;
    const model       = "claude-haiku-4-5-20251001";

    const prompt = buildPrompt({
      business_name,
      rating,
      owner_language,
      review_text,
      voice,
      reply_signature,
      client_tone:   clientTone,
      client_rules:  clientRules,
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
        max_tokens: 300,
        system: [
          "You are a professional hospitality reputation manager writing Google review replies for a white-glove concierge service.",
          "You write as the business owner — specific, warm, accountable, and never corporate.",
          "CRITICAL GRAMMAR RULES that must never be violated:",
          "1. Every contraction must have an apostrophe: we're / didn't / that's / you're / I'd / I'll / won't / can't / we've.",
          "2. Every sentence must begin with a capital letter. After every period, '! ', or '? ', the next word is capitalised.",
          "3. Every sentence must be grammatically complete — subject, verb, end punctuation. No fragments.",
          "4. Output ONLY the reply text. No labels, no preamble, no explanation.",
        ].join(" "),
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });

    const rawText = await upstream.text();
    let upstreamJson: any = null;
    try { upstreamJson = JSON.parse(rawText); } catch {}

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

    // ── Post-processing pipeline (order matters) ──────────────────────────────
    content = removeQuotations(content);
    content = stripEmojis(content);
    content = collapseWhitespace(content);
    content = stripTemplatedOpeners(content);
    content = sanitizeCorporatePhrases(content);
    content = fixApostrophes(content);                // apostrophe repair
    content = fixSentenceCapitalisation(content);     // capitalisation repair — first pass
    content = removeExcuseSentencesIfInvented({ reply: content, rating, review_text });
    content = removeDuplicateApology(content, rating);

    const closerStrip = stripRepetitiveClosers(content, rating);
    content = closerStrip.text;

    const reviewWordCount = review_text.trim().split(/\s+/).length;
    content = limitSentences(content, sentencePolicyForRating(rating, reviewWordCount));

    // Exclamation enforcement
    if (!voice.allow_exclamation) {
      content = content.replace(/[!¡]/g, ".");
      content = content.replace(/\.\.+/g, ".").trim();
    } else {
      const exCount = (content.match(/[!¡]/g) ?? []).length;
      if (exCount > 1) {
        let seen = 0;
        content = content.replace(/[!¡]/g, (m) => { seen += 1; return seen === 1 ? m : "."; });
        content = content.replace(/\.\.+/g, ".").trim();
      }
    }

    // Final capitalisation pass — catches anything introduced by prior steps
    content = fixSentenceCapitalisation(content);

    content = appendSignatureIfMissing(content, reply_signature);

    if (!content) {
      return NextResponse.json(
        { ok: false, error: "No reply content returned from Anthropic", upstreamBody: upstreamJson },
        { status: 502 }
      );
    }

    // ── Audit log (best-effort) ───────────────────────────────────────────────
    try {
      const { supabase, organizationId } = await requireOrgContext();
      const reviewHash = sha256Hex(review_text);
      const promptFingerprint = sha256Hex(
        [PROMPT_VERSION, BANNED_LIST_VERSION, POST_CLEAN_VERSION, model, String(temperature), voiceSampleIds.join(",")].join("|")
      );

      const auditRow: any = {
        organization_id:     organizationId,
        rating:              Math.round(Number(rating)),
        review_hash:         reviewHash,
        prompt_fingerprint:  promptFingerprint,
        prompt_version:      PROMPT_VERSION,
        banned_list_version: BANNED_LIST_VERSION,
        model,
        temperature,
        voice_sample_count:  voiceSampleIds.length,
        voice_sample_ids:    voiceSampleIds,
        review_id:           review_id,
        google_review_id:    google_review_id,
        google_location_id:  google_location_id,
        location_id:         google_location_id,
      };

      if (
        auditRow.review_id &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(auditRow.review_id)
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
          reply_tone:         org_reply_tone_raw,
          reply_signature:    reply_signature ?? null,
          google_location_id: google_location_id ?? null,
          ...(debug
            ? {
                enforcement: {
                  post_clean_version: POST_CLEAN_VERSION,
                  closer_stripped:    closerStrip.stripped,
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