export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireActiveSubscription } from "@/lib/subscriptionServer";

/**
 * Doctrine-aligned draft API
 * - Output is a *suggested* reply, meant to be edited by the owner
 * - No automation language, no “brand concierge”, no “premium winery” specificity
 * - Voice-first: natural, human, believable
 * - Safety: calm + respectful, but not legalistic / corporate
 */

function cleanString(v: unknown, maxLen = 4000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function cleanLanguage(v: unknown) {
  // Expected: reviewer language (reply should be drafted in this language)
  const raw = cleanString(v, 20) || "en";
  // Keep it simple: allow short tags like "en", "es", "pt", "fr", etc.
  return raw.slice(0, 12);
}

function parseRating(v: unknown) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return n;
}

function safeTrimReply(s: string, maxLen = 800) {
  // Keep it short and clean for a public reply
  const t = (s ?? "").trim();
  if (!t) return "";
  // Avoid giant responses if the model goes off
  return t.slice(0, maxLen);
}

const SYSTEM_PROMPT = `
You write short, human-sounding public replies to online guest reviews for a hospitality business.

Core doctrine:
- The reply is a *suggestion* written in the owner/manager’s voice.
- The human stays in control: the output should be easy to edit and post manually.
- Authenticity > efficiency. Believability > polish.
- Do not sound like corporate PR or automated templates.

Hard rules:
- Write in the reviewer’s language.
- 2–4 short sentences.
- No emojis.
- Do not quote the review verbatim.
- Do not mention policies, investigations, “our team will look into it”, or anything internal.
- Do not admit legal fault or responsibility.
- Do not offer refunds/discounts/compensation.
- Do not mention AI, prompts, or that this is a draft.
- Avoid generic, repeated openings like “Thank you for your feedback.” Vary the opening naturally.
- Keep it warm, calm, and specific to the review when possible.
`.trim();

function buildUserPrompt(params: {
  business_name: string;
  rating: number;
  language: string;
  review_text: string;
}) {
  const { business_name, rating, language, review_text } = params;

  const ratingGuidance =
    rating >= 5
      ? `
For 5-star reviews:
- Be genuinely warm and appreciative.
- Mention 1 specific detail or theme (service, atmosphere, food, etc.) if present.
- Invite them back in a natural way (not salesy).
`.trim()
      : rating === 4
        ? `
For 4-star reviews:
- Thank them, acknowledge what went well.
- If there's a minor issue hinted, acknowledge lightly and appreciate the note.
- Invite them back.
`.trim()
        : rating === 3
          ? `
For 3-star reviews:
- Thank them and acknowledge the mixed experience.
- Show you care and you’re listening (without sounding corporate).
- Invite them to return and, if appropriate, offer a simple offline follow-up line.
`.trim()
          : `
For 1–2 star reviews:
- Lead with empathy and calm.
- Acknowledge their experience without arguing or being defensive.
- Offer a brief offline follow-up line (email/phone) without sounding legalistic.
- Do not over-apologize; keep it steady and respectful.
`.trim();

  return `
Context:
Business name: ${business_name}
Star rating: ${rating} out of 5
Reviewer language: ${language}

Review text:
"""
${review_text}
"""

Guidance:
${ratingGuidance}

Output requirements:
- 2–4 short sentences
- Write in ${language}
- Natural, human, owner/manager voice
- No emojis
- Do not quote the review
- Do not be generic or overly formal
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

    const userPrompt = buildUserPrompt({ business_name, rating, language, review_text });

    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
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
    const content = safeTrimReply(String(contentRaw));

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
