// app/api/reviews/draft-reply/route.ts

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/subscriptionServer";
import { requireOrgContext } from "@/lib/orgServer";
import crypto from "crypto";

const PROMPT_VERSION      = "draft-reply-v6";
const BANNED_LIST_VERSION = "banned-v5";
const POST_CLEAN_VERSION  = "postclean-v8";

// ─── Research references (informational — traceable decisions) ─────────────────
//
// [R1] Ravichandran & Deng (2022) "Effects of Managerial Response to Negative
//      Reviews on Future Review Valence and Complaints" — Information Systems
//      Research. Procedural complaints → rational cues outperform emotional.
//      Interpersonal complaints → emotional acknowledgment outperforms rational.
//
// [R2] Liu et al. (2021) "To be similar or to be different? The effect of hotel
//      managers' rote response on subsequent reviews" — Tourism Management.
//      Rote/boilerplate responses decrease subsequent review volume and lower
//      future review valence. Independent hotels hurt more than chains.
//
// [R3] 2025 Vietnamese Mekong Delta study — "Satisfaction with response: The
//      impact on potential customers' perceived service quality and intent to
//      stay." Full, customized responses yield the highest satisfaction and
//      perceived service quality. Rote content significantly underperforms.
//
// [R4] Wu & Morwitz (Columbia Business School, 2025) — Integrated reviews
//      (combining emotional + rational elements) produce 5–10× higher odds of
//      recommending the business. Responses should mirror this: acknowledge
//      emotion AND address factual specifics.
//
// [R5] 2025 ScienceDirect — "This is inequity!" — Subjective reviews benefit
//      from faster, empathetic responses. Objective/factual reviews benefit from
//      more thoughtful, detail-oriented replies.
//
// [R6] Widewail SEO strategy (industry best practice, validated by Moz local
//      ranking factors) — Naturally include business name/category keywords in
//      positive review responses (Google bolds them). Avoid keywords in negative
//      review responses to prevent Google from surfacing them.
//
// [R7] Proserpio & Zervas (2017); HBR — Businesses that respond consistently
//      to reviews receive ~12% more reviews. 95% of consumers read reviews
//      before booking. 77% of travelers more likely to book when business
//      responds to positive reviews.
//
// [R8] Spiegel Research Center — Ratings between 4.2–4.5 are more likely to
//      lead to a sale than perfect 5.0 (avoids "too good to be true" effect).
//      Google filters out <4.0 from "best X near me" queries.
//
// [R9] Service recovery literature consensus — For negative reviews, invite
//      private/offline resolution. Do not litigate issues publicly. Prospective
//      customers observe how you handle conflict.
// ─────────────────────────────────────────────────────────────────────────────

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
// VERSION: postclean-v7 (universal regex engine — see postclean-v6 notes)

function fixApostrophes(text: string): string {
  let t = text;
  t = t.replace(/\byoud\b/gi, "you'd");

  // ── Negative contractions (unambiguous — no real-word conflicts) ───────────
  t = t.replace(/\bcant\b(?!o|al|ed|ing)/gi, "can't");
  t = t.replace(/\bwont\b(?!ed|s\b)/gi, "won't");
  t = t.replace(/\bdont\b/gi, "don't");
  t = t.replace(/\bdidnt\b/gi, "didn't");
  t = t.replace(/\bdoesnt\b/gi, "doesn't");
  t = t.replace(/\bwasnt\b/gi, "wasn't");
  t = t.replace(/\bwerent\b/gi, "weren't");
  t = t.replace(/\bwouldnt\b/gi, "wouldn't");
  t = t.replace(/\bcouldnt\b/gi, "couldn't");
  t = t.replace(/\bshouldnt\b/gi, "shouldn't");
  t = t.replace(/\bisnt\b/gi, "isn't");
  t = t.replace(/\barent\b/gi, "aren't");
  t = t.replace(/\bhasnt\b/gi, "hasn't");
  t = t.replace(/\bhavent\b/gi, "haven't");
  t = t.replace(/\bhadnt\b/gi, "hadn't");
  t = t.replace(/\bmusnt\b/gi, "mustn't");
  t = t.replace(/\bneednt\b/gi, "needn't");

  // ── "were" → "we're" ─────────────────────────────────────────────────────
  t = t.replace(
    /(?<!they |you |he |she |it |guests |staff |people |team |customers |visitors )\bwere ([a-z]+ing)\b/gi,
    (_m, verb) => `we're ${verb}`
  );
  t = t.replace(
    /(?<!they |you |he |she |it |guests |staff |people |team )\bwere about\b/gi,
    "we're about"
  );
  t = t.replace(
    /(?<!they |you |he |she |it |guests |staff |people |team )\bwere (sorry|glad|happy|thrilled|delighted|committed|aware|able|ready|pleased|excited|grateful|wrong|right|mistaken|confused|disappointed|surprised|certain|sure|devastated|embarrassed)\b/gi,
    (_m, adj) => `we're ${adj}`
  );

  // ── "wed" → "we'd" ───────────────────────────────────────────────────────
  t = t.replace(
    /\bwed (like|love|appreciate|be|rather|prefer|suggest|recommend|hope|welcome|hate|expect|want|need|genuinely|really|truly|absolutely|certainly|never|hate to)\b/gi,
    (_m, w) => `we'd ${w}`
  );

  // ── "well" → "we'll" ─────────────────────────────────────────────────────
  t = t.replace(
    /\bwell (be|have|make|take|get|do|look|reach|follow|check|send|ensure|try|work|fix|address|handle|see|find|speak|talk|connect|pass|do better|reach out|make sure|look into|pass this along)\b/gi,
    (_m, w) => `we'll ${w}`
  );

  // ── "its" → "it's" (predicate only, not possessive) ─────────────────────
  t = t.replace(
    /\bits (a|an|the|not|been|clear|important|something|worth|hard|difficult|fair|unfair|obvious|true|also|just|never|always|on us|our fault)\b/gi,
    (_m, w) => `it's ${w}`
  );

  // ── Simple unambiguous swaps ─────────────────────────────────────────────
  t = t.replace(/\bthats\b/gi, "that's");
  t = t.replace(/\bwhats\b/gi, "what's");
  t = t.replace(/\btheres\b/gi, "there's");
  t = t.replace(/\bheres\b/gi, "here's");
  t = t.replace(/\byoure\b/gi, "you're");
  t = t.replace(/\btheyre\b/gi, "they're");
  t = t.replace(/\bweve\b/gi, "we've");
  t = t.replace(/\byouve\b/gi, "you've");
  t = t.replace(/\btheyve\b/gi, "they've");
  t = t.replace(/\byoull\b/gi, "you'll");
  t = t.replace(/\btheyll\b/gi, "they'll");
  t = t.replace(/\bIm\b/g, "I'm");
  t = t.replace(/\bIve\b/g, "I've");
  t = t.replace(
    /\bId (like|love|appreciate|be|rather|prefer|suggest|recommend|hope|want|need|welcome|genuinely|really|truly)\b/g,
    (_m, w) => `I'd ${w}`
  );
  t = t.replace(
    /\bIll (be|have|make|take|get|do|look|check|send|ensure|try|work|fix|address|see|find|speak|talk|connect|do better|reach out|make sure|look into|pass this)\b/g,
    (_m, w) => `I'll ${w}`
  );

  return t;
}

// ─── Sentence capitalisation repair ──────────────────────────────────────────
function fixSentenceCapitalisation(text: string): string {
  if (!text) return text;
  let t = text.charAt(0).toUpperCase() + text.slice(1);
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

// ─── Failure-type classifier ──────────────────────────────────────────────────
// Research basis: [R1] Ravichandran & Deng (2022, ISR) — procedural complaints
// benefit from rational cues; interpersonal complaints benefit from emotional
// acknowledgment. This classifier drives the strategy split in 1–2 star prompts.

type FailureType = "procedural" | "interpersonal" | "mixed";

function classifyFailureType(reviewText: string): FailureType {
  const t = (reviewText || "").toLowerCase();

  const proceduralSignals = [
    /\b(wait(ed|ing)?|took (too )?long|slow service|never (came|arrived|showed))\b/,
    /\b(wrong (order|item|dish|table)|missing (item|order|dish))\b/,
    /\b(reservation|booking|cancelled|no show|double.?booked)\b/,
    /\b(charged|overcharged|billing|invoice|price|expensive|cost)\b/,
    /\b(promised|told us|said (they|it) would|never delivered)\b/,
    /\b(cold (food|dish|meal)|reheated|undercooked|overcooked|raw)\b/,
    /\b(incomplete|wrong item|wrong order)\b/,
  ];

  const interpersonalSignals = [
    /\b(rude|condescending|dismissive|disrespectful|unprofessional)\b/,
    /\b(ignored|ignored us|no one (came|helped|acknowledged))\b/,
    /\b(attitude|eye roll|rolled (their )?eyes|snapped|snappy)\b/,
    /\b(made (us|me) feel|felt (unwelcome|ignored|dismissed|judged|embarrassed))\b/,
    /\b(didn.t (apologize|acknowledge|care))\b/,
    /\b(talked (down|to us)|spoke (rudely|harshly))\b/,
  ];

  const proceduralHits = proceduralSignals.filter((re) => re.test(t)).length;
  const interpersonalHits = interpersonalSignals.filter((re) => re.test(t)).length;

  if (proceduralHits === 0 && interpersonalHits === 0) return "mixed";
  if (proceduralHits > 0 && interpersonalHits === 0) return "procedural";
  if (interpersonalHits > 0 && proceduralHits === 0) return "interpersonal";
  return "mixed";
}

// ─── Review style classifier (NEW) ───────────────────────────────────────────
// Research basis: [R5] 2025 ScienceDirect — subjective/emotional reviews benefit
// from empathetic replies; objective/factual reviews benefit from thoughtful,
// detail-oriented replies. [R4] Columbia (Wu & Morwitz) — integrated responses
// (emotional + rational) outperform either alone by 5–10×.
//
// Returns "subjective" | "objective" | "integrated" to inform strategy.

type ReviewStyle = "subjective" | "objective" | "integrated";

function classifyReviewStyle(reviewText: string): ReviewStyle {
  const t = (reviewText || "").toLowerCase();

  const subjectiveSignals = [
    /\b(felt|feeling|feel|angry|frustrated|upset|disappointed|disgusted|horrible|awful|terrible|worst|loved|amazing|incredible|fantastic|wonderful|best|beautiful)\b/,
    /[!]{2,}/,
    /\b(never again|last time|ruined|destroyed|heartbroken|devastated)\b/,
    /\b(can't believe|couldn't believe|unbelievable|unacceptable|ridiculous)\b/,
  ];

  const objectiveSignals = [
    /\b(\d+ (minutes|hours|mins|hrs|days))\b/,
    /\$\d+|\d+\s*(dollars|euros|pesos)/,
    /\b(ordered|received|arrived|checked in|checked out|booked|reserved)\b/,
    /\b(specifically|exactly|precisely|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
    /\b(table|room|floor|server|waiter|waitress|host|hostess|manager)\b/,
  ];

  const subjectiveHits = subjectiveSignals.filter((re) => re.test(t)).length;
  const objectiveHits = objectiveSignals.filter((re) => re.test(t)).length;

  if (subjectiveHits > 0 && objectiveHits > 0) return "integrated";
  if (subjectiveHits > objectiveHits) return "subjective";
  if (objectiveHits > subjectiveHits) return "objective";
  return "integrated";
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
  business_category?: string | null;
};

// ─── Supabase loaders ─────────────────────────────────────────────────────────

async function loadOrgReplySettings(): Promise<OrgReplySettings> {
  try {
    const { supabase, organizationId } = await requireOrgContext();
    const { data, error } = await supabase
      .from("organizations")
      .select("owner_language, reply_tone, reply_signature, business_category")
      .eq("id", organizationId)
      .maybeSingle();

    if (error || !data) {
      return { owner_language: "en", reply_tone: "warm", reply_signature: null, business_category: null };
    }

    return {
      owner_language: cleanLanguage((data as any).owner_language),
      reply_tone: cleanString((data as any).reply_tone, 40) || "warm",
      reply_signature: cleanString((data as any).reply_signature, 80) || null,
      business_category: cleanString((data as any).business_category, 80) || null,
    };
  } catch {
    return { owner_language: "en", reply_tone: "warm", reply_signature: null, business_category: null };
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

// ─── SEO keyword helper (NEW) ────────────────────────────────────────────────
// Research basis: [R6] Widewail — Include business name + category keywords
// naturally in positive (4–5 star) responses. Google bolds matched keywords
// in review responses, improving local search visibility. For negative (1–2
// star) responses, AVOID keywords to prevent Google from surfacing them.

function buildSeoInstruction(params: {
  rating: number;
  business_name: string;
  business_category?: string | null;
}): string {
  const { rating, business_name, business_category } = params;

  if (rating >= 4) {
    const categoryHint = business_category
      ? ` and the type of experience ("${business_category}")`
      : "";
    return `SEO NOTE (for search visibility): Naturally mention the business name "${business_name}"${categoryHint} once in the reply. Do NOT force it — weave it in where it reads naturally. Example: "That's exactly what we aim for at ${business_name}." This helps Google surface the reply for local searches.`;
  }

  if (rating <= 2) {
    return `SEO NOTE: Do NOT mention the business name, location, or category in this reply. Keep the response free of searchable keywords — you do not want Google to surface negative review responses in search results.`;
  }

  // 3-star: neutral — no special SEO instruction
  return "";
}

// ─── Review style instruction (NEW) ──────────────────────────────────────────
// Research basis: [R5] Subjective reviews → empathetic reply first; objective
// reviews → detail-oriented reply. [R4] Integrated approach always wins.

function buildStyleInstruction(reviewStyle: ReviewStyle, failureType: FailureType, rating: number): string {
  if (rating >= 4) return ""; // style classification mainly matters for negative/mixed

  if (reviewStyle === "subjective") {
    return `REVIEW STYLE: This review is emotionally driven. Lead with genuine emotional acknowledgment before addressing any specifics. The reviewer needs to feel heard first.`;
  }

  if (reviewStyle === "objective") {
    if (failureType === "procedural") {
      return `REVIEW STYLE: This review is fact-based and specific. Match their precision — acknowledge the exact facts they cited, then take clear ownership. Rational cues outperform emotional ones for procedural complaints (ISR 2022).`;
    }
    return `REVIEW STYLE: This review is fact-based. Address their specific points directly and concretely. Show you read the details.`;
  }

  // integrated
  return `REVIEW STYLE: This review mixes emotion and facts. Mirror that: acknowledge how they felt AND address the specific issue. Integrated responses (emotional + rational) are the most effective at rebuilding trust.`;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

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
  failure_type?: FailureType;
  review_style?: ReviewStyle;
  business_category?: string | null;
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
    failure_type = "mixed",
    review_style = "integrated",
    business_category = null,
  } = params;

  const who =
    voice.reply_as === "owner" || voice.reply_as === "manager"
      ? 'Write in first-person singular ("I") as the owner.'
      : 'Write in first-person plural ("we") as the business.';

  const langInstruction = languageInstruction(owner_language);

  const universalBanned = [
    "thank you for your feedback","we appreciate your feedback","we appreciate your thoughts",
    "we appreciate your comments","thank you for taking the time","thank you for sharing",
    "we strive","we will look into this","we take this seriously","please accept our apologies",
    "valued customer","valued guest","did not meet expectations","fell short of",
    "we understand your frustration","we hear you","we recognize","it's disappointing to hear",
    "it's concerning to hear","we'll keep that in mind","we aim to","we strive to",
    "our goal is to","we work hard to","we regret","we were busy","short-staffed","understaffed",
    "i'd like to hear more about what happened","tell us more about your experience",
    "please share more details","we'd love to learn more about what went wrong",
    "gracias por tu comentario","gracias por tu opinión","agradecemos tu comentario",
    "agradecemos tu opinión","agradecemos tu feedback","lamentamos profundamente",
    "nos disculpamos sinceramente","nos disculpamos profundamente","entendemos tu frustración",
    "entendemos tu decepción","entiendo tu frustración","entiendo la frustración",
    "comprendo tu frustración","comprendo la frustración","tomamos esto muy en serio",
    "tomaremos en cuenta","trabajamos para mejorar","nos esforzamos","nuestro objetivo es",
    "esperamos verte pronto","esperamos que nos des otra oportunidad",
    "agradecemos o seu comentário","agradecemos o seu feedback","lamentamos profundamente",
    "pedimos desculpas sinceramente","entendemos a sua frustração","nos esforçamos",
    "merci pour votre commentaire","nous vous remercions","nous nous excusons sincèrement",
    "nous comprenons votre frustration","nous nous efforçons",
    "grazie per il tuo feedback","ci scusiamo sinceramente","ci impegniamo",
    "danke für ihr feedback","wir entschuldigen uns aufrichtig","wir bemühen uns",
    "that's on us","thats on us","that is on us","it's on us","its on us",
  ].join(" | ");

  const exclamationRule = voice.allow_exclamation
    ? "Maximum 1 exclamation point, only if it is completely natural."
    : "No exclamation points. Replace any with a period.";

  const signatureRule = reply_signature ? `Close with: — ${reply_signature}` : "";

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

  // ── SEO instruction [R6] ──────────────────────────────────────────────────
  const seoInstruction = buildSeoInstruction({ rating, business_name, business_category });

  // ── Review style instruction [R4, R5] ─────────────────────────────────────
  const styleInstruction = buildStyleInstruction(review_style, failure_type, rating);

  // ── Anti-rote diversity instruction [R2] ──────────────────────────────────
  const antiRoteBlock = `ANTI-REPETITION (critical for perceived authenticity):
- Do NOT start with "Thank you" or any greeting formula.
- Vary your opening: start with a specific detail, an acknowledgment, a reflection, or
  jump straight into the substance. Every reply must feel like a one-off, not a template.
- Research proves that rote/boilerplate responses DECREASE future review volume and LOWER
  future ratings. Prospective customers can detect templated language instantly.`;

  // ── Dual-audience instruction [R3, R7] ─────────────────────────────────────
  const dualAudienceBlock = `AUDIENCE AWARENESS (critical):
This reply is public. It will be read by:
1. The reviewer — who wants to feel heard and respected.
2. Prospective customers — who are deciding whether to visit based on how you handle feedback.
Write for BOTH audiences simultaneously. Prospective customers care most about:
- Whether you sound like a real person (not a brand).
- Whether you take accountability (for negatives) or show genuine warmth (for positives).
- Whether this feels like a place run by people who care.`;

  let ratingStrategy = "";
  if (rating >= 5) {
    // [R4] Integrated: acknowledge the feeling AND mirror the specific detail.
    // [R6] SEO: naturally include business name.
    // [R7] Return invitation drives repeat visits.
    ratingStrategy = `5-STAR STRATEGY — Specific mirroring + warmth + natural return invite
- Lead by mirroring something SPECIFIC they mentioned: a dish, a moment, a staff name, a detail.
- Combine warmth (emotional) with the specific fact (rational) — integrated responses
  are 5–10× more effective at driving recommendations than either alone.
- Close with a natural, low-pressure invitation to return. Make it specific if possible:
  "next time you're in the neighborhood" or reference a season/event — not a generic
  "hope to see you again."
- Do NOT be effusive or over-the-top. Genuine beats enthusiastic.`;
  } else if (rating === 4) {
    // [R3] Full, customized response yields highest satisfaction.
    // [R4] Integrated: acknowledge what worked AND the gap.
    ratingStrategy = `4-STAR STRATEGY — Appreciation + gentle gap acknowledgment + specific warmth
- Lead with genuine appreciation — but make it SPECIFIC to what they enjoyed.
- If the review hints at something imperfect, acknowledge it briefly and naturally.
  Do not ignore it — prospective customers notice when owners dodge the gap.
- Close simply and warmly with a specific detail, not a generic closer.
- Do not over-promise improvements. Calm confidence reads better than defensiveness.`;
  } else if (rating === 3) {
    // [R1] Mixed complaints need balanced rational + emotional approach.
    // [R4] Integrated style.
    // [R9] Invite private resolution for the negative parts.
    ratingStrategy = `3-STAR STRATEGY — Balanced, calm ownership + specific acknowledgment
- Acknowledge the mixed experience without defensiveness.
- Name BOTH what worked and what didn't — be specific about each. Prospective customers
  reading this want to see that you heard the nuance, not that you gave a generic response.
- Take responsibility for the gap without over-explaining or making excuses.
- If the gap is actionable, invite them to reach out directly: provide a channel
  (email or phone) so resolution happens privately.
- Close with a calm, genuine note — not a marketing close.
- VARY YOUR ACCOUNTABILITY LANGUAGE: Never use "that's on us." Rotate between
  phrasing like "we missed the mark on...", "we should have done better with...",
  "that wasn't good enough," or simply name the gap without a stock phrase.`;
  } else if (rating === 2) {
    // [R1] Procedural → rational cues. Interpersonal → emotional cues.
    // [R5] Match the review style.
    // [R9] Invite private resolution.
    // [R6] No SEO keywords in negative responses.
    ratingStrategy = `2-STAR STRATEGY — ${failure_type === "procedural" ? "Direct accountability (rational-first)" : failure_type === "interpersonal" ? "Emotional acknowledgment first, then accountability" : "Emotional acknowledgment + direct accountability"}
- If the reviewer explicitly mentions price or value, acknowledge it directly.
  "Extremely expensive" combined with food failures is a compounded grievance —
  the price makes every failure worse and must not be ignored.
- Do not invite the guest to "tell you more" or "share what happened" —
  they already did. Instead invite direct contact to resolve it:
  "Please reach out to us directly at [channel]" not "I'd like to hear more."
${failure_type === "procedural" ? `- PROCEDURAL FAILURE: Lead with the specific operational fact that went wrong.
  Name it concretely. Then one sentence of clean ownership. Rational precision
  outperforms emotional language for process failures.` : ""}${failure_type === "interpersonal" ? `- INTERPERSONAL FAILURE: Lead with genuine emotional acknowledgment —
  name how the interaction made them feel. Then one sentence of accountability.
  Emotional acknowledgment outperforms rational language for interpersonal failures.` : ""}${failure_type === "mixed" ? `- MIXED FAILURE: Acknowledge both the emotional impact AND the operational
  specifics. Lead with whichever the reviewer emphasized more.` : ""}
- ONE apology maximum. Direct and human. Not corporate.
- Invite private resolution in one short sentence.
- The reply should sound like an owner genuinely disappointed in themselves.
- VARY YOUR ACCOUNTABILITY LANGUAGE: Never use "that's on us." Rotate between
  phrasing like "we missed the mark on...", "we should have done better with...",
  "that wasn't good enough," or simply name the gap without a stock phrase.`;
  } else {
    // 1-star: [R1], [R5], [R9]
    ratingStrategy = `1-STAR STRATEGY — Direct, calm, specific accountability
- Open by naming the specific failure concretely — use the reviewer's own words.
  If you write "your experience" you have failed.
${failure_type === "procedural" ? `- PROCEDURAL FAILURE: Be precise and factual. Name the broken process or
  promise. One clear sentence of ownership. Rational cues drive better outcomes.` : ""}${failure_type === "interpersonal" ? `- INTERPERSONAL FAILURE: Name how the interaction made them feel. Show you
  understand the human impact, not just the operational failure.` : ""}${failure_type === "mixed" ? `- MIXED: Address both the emotional and operational dimensions.` : ""}
- ONE apology. Direct and human. Just "I'm sorry." Not a corporate apology.
- Do not be defensive. Do not explain why it happened. Do not promise systemic change.
- Invite private resolution: provide a way to reach you directly.
- Dignity in brevity. Short, specific, accountable replies outperform long ones.
- Remember: prospective customers reading this want to see how you handle your worst
  moments. Calm accountability is the strongest possible signal.
- VARY YOUR ACCOUNTABILITY LANGUAGE: Never use "that's on us." Rotate between
  phrasing like "we missed the mark," "we should have done better," "that wasn't
  good enough," or simply name the failure directly without a stock phrase.`;
  }

  return `You are the owner of "${business_name}" — a hospitality business — writing a public Google review reply. This reply is visible to every future reader, not just the reviewer. It represents the face and character of the business.

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

Every sentence must be grammatically complete: subject + verb + closing punctuation. No fragments.

Scan your reply word by word before outputting. Fix any broken contraction or uncapitalised sentence start.

STANDARD 2 — SPECIFICITY: PROVE YOU READ THE REVIEW.

Reference at least ONE concrete detail from the review — a specific dish, wait time, staff interaction,
promised service, or named incident. Do not summarise in categories.

  ✗ Generic: "We're sorry your experience didn't meet expectations."
  ✓ Specific: "Having to re-request every order twice isn't what we're about."

STANDARD 3 — HUMAN VOICE. NOT A PRESS RELEASE.

Write the way a thoughtful owner would — warm, direct, accountable. Not corporate. Not scripted.

STANDARD 4 — LENGTH: ${maxSentences} sentences MAXIMUM.

════════════════════════════════════════════════════
  AUDIENCE & ANTI-REPETITION
════════════════════════════════════════════════════

${dualAudienceBlock}

${antiRoteBlock}

════════════════════════════════════════════════
  BANNED PHRASES — NEVER USE. NOT EVEN PARTIALLY.
════════════════════════════════════════════════

${universalBanned}

════════════════════════════════════
  RATING STRATEGY
════════════════════════════════════
${ratingStrategy}

${styleInstruction ? `════════════════════════════════════\n  REVIEW STYLE ADAPTATION\n════════════════════════════════════\n${styleInstruction}\n` : ""}${seoInstruction ? `════════════════════════════════════\n  SEO\n════════════════════════════════════\n${seoInstruction}\n` : ""}════════════════════════════════════
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
${rating <= 2 ? "- For negative reviews: invite private/offline resolution (email or phone). Do not litigate publicly.\n- Do not ask the reviewer to \"share more\" or \"tell us what happened\" — they already did." : ""}

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
  // [R2] Strip "tell me more" / "share more" patterns — reviewer already shared.
  t = t.replace(/\b(i'd|we'd|i would|we would)\s+(like|love)\s+to\s+(hear|learn|know)\s+more\s+about\s+what\s+happened\b[.,!]?\s*/gi, "");
  t = t.replace(/\bplease\s+(share|tell)\s+(us|me)\s+more\s+(about|details)\b[.,!]?\s*/gi, "");
  // Strip repetitive accountability crutch: "that's on us" and variants
  t = t.replace(/\bthat[''\u2019]?s on us\b[.,]?\s*/gi, "");
  t = t.replace(/\bthat is on us\b[.,]?\s*/gi, "");
  t = t.replace(/\bit[''\u2019]?s on us\b[.,]?\s*/gi, "");
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

// ─── SEO keyword stripping for negative responses (NEW) [R6] ────────────────
// For 1–2 star replies, remove any accidental inclusion of the business name.
// Widewail's proven strategy: don't give Google keywords to associate with
// negative content.

function stripBusinessNameFromNegativeReply(reply: string, rating: number, businessName: string): string {
  if (rating > 2) return reply;
  if (!businessName) return reply;

  const escaped = businessName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameRe = new RegExp(`\\b${escaped}\\b`, "gi");
  let t = reply.replace(nameRe, "").trim();
  t = collapseWhitespace(t);
  // Clean up orphaned punctuation from removal
  t = t.replace(/\s+,/g, ",").replace(/\s+\./g, ".").replace(/^\s*[,.]/, "").trim();
  return t;
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
    const business_category  = orgSettings.business_category ?? null;

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

    // ── Classifiers ──────────────────────────────────────────────────────────
    const failureType = classifyFailureType(review_text);
    const reviewStyle = classifyReviewStyle(review_text);

    const temperature = rating <= 2 ? 0.15 : 0.25;
    const model       = "claude-haiku-4-5-20251001";

    const prompt = buildPrompt({
      business_name,
      rating,
      owner_language,
      review_text,
      voice,
      reply_signature,
      client_tone:       clientTone,
      client_rules:      clientRules,
      voice_samples:     voiceSamples,
      failure_type:      failureType,
      review_style:      reviewStyle,
      business_category: business_category,
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
          "5. NEVER start with 'Thank you' or any greeting formula. Start with substance.",
          "6. This reply is read by prospective customers deciding whether to visit. Write accordingly.",
          "7. Never use the phrase 'that's on us' or 'it's on us' — vary accountability language every time.",
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
    content = fixApostrophes(content);                // universal apostrophe repair
    content = fixSentenceCapitalisation(content);     // capitalisation repair — first pass
    content = removeExcuseSentencesIfInvented({ reply: content, rating, review_text });
    content = removeDuplicateApology(content, rating);

    const closerStrip = stripRepetitiveClosers(content, rating);
    content = closerStrip.text;

    // [R6] Strip business name from negative replies for SEO protection
    content = stripBusinessNameFromNegativeReply(content, rating, business_name);

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
        failure_type:        failureType,
        review_style:        reviewStyle,
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
          failure_type:       failureType,
          review_style:       reviewStyle,
          ...(debug
            ? {
                enforcement: {
                  post_clean_version: POST_CLEAN_VERSION,
                  closer_stripped:    closerStrip.stripped,
                  business_category:  business_category,
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