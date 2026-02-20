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

  // Split on sentence end punctuation; works reasonably across Latin languages
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
    "enhance our", // common corp tell

    // AI-ish tells / faux empathy openers
    "we're sorry to hear",
    "we are sorry to hear",
    "it sounds like",
    "we're glad you",
    "we are glad you",
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
 * tone coming from client UI
 */
function parseClientTone(v: unknown): VoiceProfile["tone"] | null {
  const t = cleanString(v, 24).toLowerCase().trim();
  if (!t) return null;
  if (t === "warm" || t === "neutral" || t === "direct" || t === "playful") return t;
  return null;
}

/**
 * rules coming from client UI
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

function clampToneForRating(tone: VoiceProfile["tone"], rating: number): VoiceProfile["tone"] {
  if (!tone) return tone;
  if (rating <= 2 && tone === "playful") return "neutral";
  return tone;
}

function sentencePolicyForRating(rating: number) {
  if (rating >= 5) return 4;
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
    return [...base, "Close with a simple, low-pressure welcome back (not salesy)."];
  }

  if (rating <= 2) {
    return [
      ...base,
      "Acknowledge the issue calmly in one sentence (no long apology).",
      "If inviting follow-up, keep it ONE short human line (no corporate framing).",
    ];
  }

  return base;
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

  if (rating <= 2) {
    return [...base, "Do NOT be playful or joking.", "Do NOT argue with the reviewer."];
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
 * Conservative cleanup: remove common templated openers only.
 */
function stripTemplatedOpeners(text: string) {
  let t = text.trim();

  const patterns: RegExp[] = [
    /^\s*(thank you( so much)?( for (your|the) (review|feedback|kind words))?)[,!.]\s*/i,
    /^\s*(we (really )?appreciate( you| your)?( taking the time)?)[,!.]\s*/i,
    /^\s*(we('?| a)re (sorry|sorry to hear|sorry that))[,!.]\s*/i,
    /^\s*(we('?| a)re glad( you)?)[,!.]\s*/i,
  ];

  for (const re of patterns) t = t.replace(re, "");
  return t.trim();
}

/**
 * Hard enforcement: if banned phrases appear, we retry once.
 * This catches exact phrases and also partial AI-tells like "we strive" / "we appreciate".
 */
function buildBannedMatchers(voice: ReturnType<typeof normalizeVoice>): Array<{ label: string; re: RegExp }> {
  const avoid = Array.isArray(voice.things_to_avoid) ? voice.things_to_avoid : [];

  const matchers: Array<{ label: string; re: RegExp }> = [];

  // Exact-ish phrases (case-insensitive substring)
  for (const p of avoid) {
    const phrase = cleanString(p, 120);
    if (!phrase) continue;
    // Escape regex special chars for safe matching as substring
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    matchers.push({ label: phrase, re: new RegExp(escaped, "i") });
  }

  // Extra lightweight generic corp tells (these show up a lot even when phrased differently)
  matchers.push({ label: "we appreciate", re: /\bwe\s+appreciate\b/i });
  matchers.push({ label: "we strive", re: /\bwe\s+strive\b/i });
  matchers.push({ label: "enhance our", re: /\benhance\s+our\b/i });
  matchers.push({ label: "valued (customer|guest)", re: /\bvalued\s+(customer|guest)\b/i });

  return matchers;
}

function findBannedHits(text: string, matchers: Array<{ label: string; re: RegExp }>) {
  const hits: string[] = [];
  const t = text || "";
  for (const m of matchers) {
    if (m.re.test(t)) hits.push(m.label);
    if (hits.length >= 6) break;
  }
  return hits;
}

async function callOpenAI(args: {
  apiKey: string;
  prompt: string;
  rating: number;
  correction?: { hits: string[] };
}) {
  const { apiKey, prompt, rating, correction } = args;

  const baseSystem =
    "You write short, human-sounding public review replies for local businesses. Follow constraints exactly. Output only the reply text.";

  const correctionMsg = correction?.hits?.length
    ? `Your last reply violated the banned phrases list. It included: ${correction.hits
        .map((h) => `"${h}"`)
        .join(", ")}. Rewrite the reply to be compliant. Do not include any of those phrases (or close variants). Keep it natural and short. Output ONLY the reply text.`
    : null;

  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: rating <= 2 ? 0.15 : 0.22,
      frequency_penalty: 0.25,
      presence_penalty: 0.1,
      messages: [
        { role: "system", content: baseSystem },
        { role: "user", content: prompt },
        ...(correctionMsg ? [{ role: "user", content: correctionMsg }] : []),
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

  return { upstream, rawText, upstreamJson };
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

    // Voice samples
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

    const bannedMatchers = buildBannedMatchers(voice);

    // ---- Attempt 1
    let { upstream, rawText, upstreamJson } = await callOpenAI({ apiKey, prompt, rating });

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

    const contentRaw1 = upstreamJson?.choices?.[0]?.message?.content ?? "";
    let content = safeTrimReply(String(contentRaw1));

    content = removeQuotations(content);
    content = stripEmojis(content);
    content = collapseWhitespace(content);
    content = stripTemplatedOpeners(content);
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

    // ---- Validate banned phrases; if violated, retry once
    let hits = findBannedHits(content, bannedMatchers);

    if (hits.length > 0) {
      const retry = await callOpenAI({
        apiKey,
        prompt,
        rating,
        correction: { hits },
      });

      if (retry.upstream.ok) {
        const retryJson = retry.upstreamJson;
        const contentRaw2 = retryJson?.choices?.[0]?.message?.content ?? "";
        let retryContent = safeTrimReply(String(contentRaw2));

        retryContent = removeQuotations(retryContent);
        retryContent = stripEmojis(retryContent);
        retryContent = collapseWhitespace(retryContent);
        retryContent = stripTemplatedOpeners(retryContent);
        retryContent = limitSentences(retryContent, sentencePolicyForRating(rating));

        if (!voice.allow_exclamation) {
          retryContent = retryContent.replace(/[!¡]/g, ".");
          retryContent = retryContent.replace(/\.\.+/g, ".").trim();
        } else {
          const exCount = (retryContent.match(/[!¡]/g) ?? []).length;
          if (exCount > 1) {
            let seen = 0;
            retryContent = retryContent.replace(/[!¡]/g, (m) => {
              seen += 1;
              return seen === 1 ? m : ".";
            });
            retryContent = retryContent.replace(/\.\.+/g, ".").trim();
          }
        }

        retryContent = appendSignatureIfMissing(retryContent, reply_signature);

        // If retry is clean, take it. If still violates, we keep original (but this is rare).
        const retryHits = findBannedHits(retryContent, bannedMatchers);
        if (retryContent && retryHits.length === 0) {
          content = retryContent;
        }
      }
    }

    if (!content) {
      return NextResponse.json(
        { ok: false, error: "No reply content returned from OpenAI" },
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
