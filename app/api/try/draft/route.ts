// app/api/try/draft/route.ts
//
// Public endpoint for the /try page. NO auth, NO subscription gating.
//
// Funnel logic:
//   - Drafts 1-3: free, no email required
//   - Drafts 4-8: email required (collected at draft 3 → 4 transition)
//   - Drafts 9+:  Stripe trial gate (302 to checkout)
//
// Limits enforced server-side via try_leads table (per IP hash + per email,
// whichever is hit first), so localStorage clears can't bypass.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import crypto from "crypto";

const FREE_LIMIT = 3;
const EMAIL_LIMIT = 8; // 3 free + 5 emailed = 8 total

// ─── Utilities ────────────────────────────────────────────────────────────────

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

function isValidEmail(email: string) {
  if (!email || email.length > 200) return false;
  // Permissive validation — server-side gate, not the only line of defense
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashIp(ip: string) {
  // Hash IP so we never store raw IPs in the DB (privacy-friendly)
  return crypto.createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

function getClientIp(req: Request) {
  // Vercel forwards real client IP in x-forwarded-for (first entry)
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip") ?? "unknown";
}

// ─── Count helper ─────────────────────────────────────────────────────────────

async function countDrafts(params: { ipHash: string; email: string | null }) {
  const supabase = supabaseServer();
  const { ipHash, email } = params;

  // Count by IP hash (always)
  const { count: ipCount, error: ipErr } = await supabase
    .from("try_leads")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash);

  if (ipErr) {
    console.warn("[try/draft] ip count error:", ipErr.message);
  }

  // Count by email (if provided)
  let emailCount = 0;
  if (email) {
    const { count: ec, error: emailErr } = await supabase
      .from("try_leads")
      .select("id", { count: "exact", head: true })
      .eq("email", email);

    if (emailErr) {
      console.warn("[try/draft] email count error:", emailErr.message);
    }

    emailCount = ec ?? 0;
  }

  // Use whichever is higher (prevents bypass via clearing localStorage or
  // entering different emails from same IP)
  return Math.max(ipCount ?? 0, emailCount);
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const review_text   = cleanString((body as any)?.review_text, 5000);
    const business_name = cleanString((body as any)?.business_name, 200);
    const language      = cleanLanguage((body as any)?.language);
    const rating        = parseRating((body as any)?.rating);
    const emailRaw      = cleanString((body as any)?.email, 200).toLowerCase();
    const email         = isValidEmail(emailRaw) ? emailRaw : null;

    // ── Validation ──────────────────────────────────────────────────────────
    if (!review_text) {
      return NextResponse.json(
        { ok: false, error: "Please paste a review." },
        { status: 400 }
      );
    }
    if (!business_name) {
      return NextResponse.json(
        { ok: false, error: "Please enter your business name." },
        { status: 400 }
      );
    }
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { ok: false, error: "Rating must be between 1 and 5." },
        { status: 400 }
      );
    }

    // ── Limit enforcement ────────────────────────────────────────────────────
    const ip = getClientIp(req);
    const ipHash = hashIp(ip);

    const currentCount = await countDrafts({ ipHash, email });

    // Stripe gate: drafts 9+
    if (currentCount >= EMAIL_LIMIT) {
      return NextResponse.json(
        {
          ok: false,
          gate: "stripe",
          error: "You've used all your free drafts. Start your 30-day trial to keep going.",
          drafts_used: currentCount,
          drafts_limit: EMAIL_LIMIT,
        },
        { status: 402 }
      );
    }

    // Email gate: drafts 4+ require email
    if (currentCount >= FREE_LIMIT && !email) {
      return NextResponse.json(
        {
          ok: false,
          gate: "email",
          error: "Enter your email to unlock 5 more drafts.",
          drafts_used: currentCount,
          drafts_free_limit: FREE_LIMIT,
          drafts_email_limit: EMAIL_LIMIT,
        },
        { status: 402 }
      );
    }

    // ── Anthropic API key ────────────────────────────────────────────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("[try/draft] Missing ANTHROPIC_API_KEY");
      return NextResponse.json(
        { ok: false, error: "Server configuration error. Please try again later." },
        { status: 500 }
      );
    }

    // ── Build a minimal, generic prompt (no voice samples, no org data) ─────
    // /try is anonymous — we don't have voice samples or org settings to load.
    // Use a generic warm hospitality voice that's good enough to demo.

    const reviewWordCount = review_text.trim().split(/\s+/).length;
    const maxSentences = reviewWordCount > 120 ? 4 : reviewWordCount > 60 ? 3 : 2;

    const langInstruction = (() => {
      const tag = language.toLowerCase();
      if (tag.startsWith("es")) return "Escribe en español. Español natural, no una traducción literal. Suena como una persona real, no una marca.";
      if (tag.startsWith("pt")) return "Escreva em português. Português natural, não uma tradução literal.";
      if (tag.startsWith("fr")) return "Écris en français. Français naturel, pas une traduction littérale.";
      if (tag.startsWith("it")) return "Scrivi in italiano. Italiano naturale, non una traduzione letterale.";
      if (tag.startsWith("de")) return "Schreibe auf Deutsch. Natürliches Deutsch, keine wörtliche Übersetzung.";
      return "Write in English. Natural, human, non-corporate.";
    })();

    const prompt = `You are the owner of "${business_name}" — a hospitality business — writing a public Google review reply.

Write in first-person plural ("we") as the business.

${langInstruction}

PERSPECTIVE LOCK: You are the OWNER thanking or responding to YOUR guest. You were NOT on the tour, at the table, in the room, or part of the experience they describe. NEVER narrate the guest's experience back to them in present tense, generalize about how the experience affects "people," or use marketing-style descriptions of what makes your business good. Open with an explicit acknowledgment frame: "Hearing that...", "Knowing that you noticed...", "Reading your review...", "We're so glad you...", or "It means a lot that...".

LENGTH: ${maxSentences} sentences MAXIMUM.

GRAMMAR: Every contraction must have an apostrophe. Every sentence must start with a capital letter. No fragments.

DO NOT start with "Thank you" or any greeting formula.
DO NOT use the phrase "that's on us" or "it's on us."
DO NOT promise internal changes ("we'll retrain staff") or mention AI/automation.
ONE apology only. Specific, human, accountable.

THE REVIEW (${rating}/5 stars):
${review_text}

Write the reply now. Output ONLY the reply — no labels, no preamble.`;

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        temperature: rating <= 2 ? 0.15 : 0.25,
        max_tokens: 300,
        system: "You are a professional hospitality reputation manager writing Google review replies. Write as the business owner — specific, warm, accountable, never corporate. Never narrate the guest's experience back to them. Open with an acknowledgment frame.",
        messages: [{ role: "user", content: prompt }],
      }),
      cache: "no-store",
    });

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => "");
      console.error("[try/draft] Anthropic upstream error:", upstream.status, errText);
      return NextResponse.json(
        { ok: false, error: "Drafting service is temporarily unavailable. Please try again." },
        { status: 502 }
      );
    }

    const upstreamJson = await upstream.json();
    const draftRaw = upstreamJson?.content?.[0]?.text ?? "";
    const draft = String(draftRaw).trim();

    if (!draft) {
      return NextResponse.json(
        { ok: false, error: "Couldn't generate a draft. Please try again." },
        { status: 502 }
      );
    }

    // ── Store the lead ────────────────────────────────────────────────────────
    const supabase = supabaseServer();
    const newDraftNumber = currentCount + 1;

    const { error: insertErr } = await supabase.from("try_leads").insert({
      email: email,
      ip_hash: ipHash,
      business_name,
      review_text,
      rating: Math.round(rating),
      language,
      draft_text: draft,
      draft_number: newDraftNumber,
    });

    if (insertErr) {
      // Don't fail the response if logging fails — user already paid the wait
      console.warn("[try/draft] try_leads insert failed:", insertErr.message);
    }

    // ── Response ──────────────────────────────────────────────────────────────
    const drafts_remaining_free = Math.max(0, FREE_LIMIT - newDraftNumber);
    const drafts_remaining_total = Math.max(0, EMAIL_LIMIT - newDraftNumber);

    return NextResponse.json({
      ok: true,
      draft,
      drafts_used: newDraftNumber,
      drafts_remaining_free,
      drafts_remaining_total,
      requires_email_next: newDraftNumber >= FREE_LIMIT && !email,
      requires_stripe_next: newDraftNumber >= EMAIL_LIMIT,
    });
  } catch (err: any) {
    console.error("[try/draft] error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}