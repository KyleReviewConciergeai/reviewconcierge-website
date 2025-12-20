import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ensure Node runtime (good for env + fetch reliability)

function cleanString(v: unknown, maxLen = 4000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function cleanLanguage(v: unknown) {
  const raw = cleanString(v, 20) || "en";
  // Keep it simple: allow "en", "es", "pt", "en-US", etc. but cap length.
  return raw.slice(0, 12);
}

function parseRating(v: unknown) {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  return n;
}

const SYSTEM_PROMPT = `
You are a professional hospitality brand concierge writing public responses to Google reviews on behalf of premium wineries, lodges, and restaurants.

Your job is to write warm, thoughtful, brand-safe replies that:
• Sound human, calm, and polished
• Reflect high-end hospitality standards
• Protect the business legally and reputationally
• Feel appropriate for Google Reviews (public-facing)

You are not customer support.
You are not defensive.
You never argue.
You never sound automated.

The goal is to make future readers feel confident, welcomed, and cared for.
`.trim();

function buildUserPrompt(params: {
  business_name: string;
  rating: number;
  language: string;
  review_text: string;
}) {
  const { business_name, rating, language, review_text } = params;

  return `
Write a public Google review reply using the following context:

Business name: ${business_name}
Star rating: ${rating} out of 5
Review language: ${language}
Review text:
"""
${review_text}
"""

Tone and rules based on star rating:

⭐⭐⭐⭐⭐ (5 stars)
• Express genuine gratitude
• Reinforce what the guest enjoyed
• Celebrate the experience without overdoing it
• Warm, welcoming, and confident

⭐⭐⭐ (3 stars)
• Thank the guest sincerely
• Acknowledge their feedback
• Show openness to improvement
• Balanced, calm, and appreciative

⭐–⭐⭐ (1–2 stars)
• Lead with empathy and professionalism
• Acknowledge the experience without admitting fault
• Avoid excuses or defensiveness
• Encourage offline follow-up (email or phone)
• Reassuring, respectful, and composed

Global guardrails (always follow):
• Do NOT admit legal responsibility or fault
• Do NOT offer refunds, discounts, or compensation
• Do NOT mention internal issues, policies, or investigations
• Do NOT copy or quote the review verbatim
• Do NOT use emojis
• Do NOT sound robotic or overly corporate

Style guidelines:
• Length: 2–4 short sentences
• Use the business name naturally if appropriate
• End with a warm invitation to return or reconnect
• Write in the same language as the review
• Keep it human, elegant, and calm
• Avoid generic or overly formal openings (e.g., “Dear Guest,” or “Thank you for sharing”). Vary the opening naturally.
• Express gratitude once per reply; avoid repeating multiple “thank you” phrases.
`.trim();
}

export async function POST(req: Request) {
  try {
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
        temperature: 0.5,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        // Helps keep replies short; model can still exceed slightly, but usually stays tight.
        max_tokens: 220,
      }),
      cache: "no-store",
    });

    const rawText = await upstream.text();
    let upstreamJson: any = null;
    try {
      upstreamJson = JSON.parse(rawText);
    } catch {
      // leave as null; we’ll return rawText if needed
    }

    if (!upstream.ok) {
      // Return real upstream error (without leaking API key)
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

    const content = upstreamJson?.choices?.[0]?.message?.content?.trim?.() ?? "";

    if (!content) {
      return NextResponse.json(
        { ok: false, error: "No reply content returned from OpenAI", upstreamBody: upstreamJson },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, reply: content }, { status: 200 });
  } catch (err: any) {
    console.error("DRAFT-REPLY ERROR:", err);
    const message = err instanceof Error ? err.message : "Server error generating draft reply";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
