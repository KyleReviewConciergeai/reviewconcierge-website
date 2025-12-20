import { NextResponse } from "next/server";

export const runtime = "nodejs"; // ensure Node runtime (good for env + fetch reliability)

function cleanString(v: unknown, maxLen = 4000) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const review_text = cleanString(body?.review_text, 5000);
    const business_name = cleanString(body?.business_name, 200);
    const language = cleanString(body?.language, 10) || "en";
    const rating =
      typeof body?.rating === "number"
        ? body.rating
        : Number(String(body?.rating ?? "").replace(/[^\d]/g, ""));

    if (!review_text) {
      return NextResponse.json({ error: "review_text is required" }, { status: 400 });
    }
    if (!business_name) {
      return NextResponse.json({ error: "business_name is required" }, { status: 400 });
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "rating must be 1–5" }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY in server env (.env.local). Restart dev server." },
        { status: 500 }
      );
    }

    // Use a very standard endpoint that works broadly:
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // If this model name errors, you’ll SEE it clearly in the upstream error returned below.
        model: "gpt-4o-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are a review-reply assistant for hospitality businesses. Write replies that are warm, concise, and professional.",
          },
          {
            role: "user",
            content: [
              `Business: ${business_name}`,
              `Language: ${language}`,
              `Rating: ${rating}/5`,
              `Review: ${review_text}`,
              "",
              "Write a reply in the specified language. Keep it 2–4 sentences. Do not mention policies or AI.",
            ].join("\n"),
          },
        ],
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
      // ✅ THIS IS THE KEY: show the real OpenAI error to unblock you instantly
      return NextResponse.json(
        {
          error: "OpenAI upstream error",
          upstreamStatus: upstream.status,
          upstreamBody: upstreamJson ?? rawText,
        },
        { status: 502 }
      );
    }

    const content =
      upstreamJson?.choices?.[0]?.message?.content?.trim?.() ?? "";

    if (!content) {
      return NextResponse.json(
        { error: "No reply content returned from OpenAI", upstreamBody: upstreamJson },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        reply: content,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("DRAFT-REPLY ERROR:", err);
    return NextResponse.json(
      { error: "Server error generating draft reply" },
      { status: 500 }
    );
  }
}
