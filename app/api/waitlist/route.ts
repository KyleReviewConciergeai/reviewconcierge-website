import { NextResponse } from "next/server";

const ALLOWED_BUSINESS_TYPES = new Set([
  "Winery",
  "Restaurant",
  "Bar",
  "Cafe",
  "Nightclub",
  "Tour Operator",
]);

// Bot protection settings
const MIN_FORM_ELAPSED_MS = 2500; // 2.5s (tweak to 2000–5000 if desired)
const MAX_FORM_ELAPSED_MS = 1000 * 60 * 60; // 1 hour sanity cap

function cleanString(v: unknown, maxLen = 200) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function parseLocationsCount(v: unknown) {
  const raw = typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
  const digitsOnly = raw.replace(/\D/g, "");
  const n = Number(digitsOnly);
  if (!Number.isFinite(n)) return null;
  if (n < 1) return null;
  if (n > 10000) return null;
  return n;
}

function parseFormElapsedMs(v: unknown) {
  // Accept number or numeric string
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
      ? Number(v.replace(/\D/g, ""))
      : NaN;

  if (!Number.isFinite(n)) return null;
  if (n < 0) return null;
  if (n > MAX_FORM_ELAPSED_MS) return null;
  return Math.floor(n);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // ----------------------------
    // 1) BOT PROTECTION (server-side)
    // ----------------------------

    // Honeypot: support several possible field names (in case your page.tsx uses one)
    // If ANY of these are non-empty, treat as bot.
    const honeypot =
      cleanString(body?.hp, 200) ||
      cleanString(body?.honeypot, 200) ||
      cleanString(body?.companyWebsite, 200) || // you mentioned this appears in payload sometimes
      cleanString(body?.website2, 200) ||
      "";

    if (honeypot) {
      return NextResponse.json(
        { error: "Spam detected. Please try again." },
        { status: 400 }
      );
    }

    const formElapsedMs = parseFormElapsedMs(body?.formElapsedMs);

    // If you want to REQUIRE timing, keep this as a hard error.
    // If you want it optional, you could only enforce when present.
    if (formElapsedMs === null) {
      return NextResponse.json(
        { error: "Please refresh and try again." },
        { status: 400 }
      );
    }

    if (formElapsedMs < MIN_FORM_ELAPSED_MS) {
      return NextResponse.json(
        { error: "Please wait a moment and try again." },
        { status: 400 }
      );
    }

    // ----------------------------
    // 2) NORMAL FIELD PARSING
    // ----------------------------

    const name = cleanString(body?.name, 120);
    const email = cleanString(body?.email, 254).toLowerCase();
    const businessName = cleanString(body?.businessName, 200);
    const businessType = cleanString(body?.businessType, 60);
    const role = cleanString(body?.role, 120);
    const city = cleanString(body?.city, 120);
    const website = cleanString(body?.website, 300);

    const locationsCount = parseLocationsCount(body?.locationsCount);

    // ----------------------------
    // 3) REQUIRED VALIDATIONS
    // ----------------------------

    if (!businessName) {
      return NextResponse.json(
        { error: "Business name is required." },
        { status: 400 }
      );
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid work email is required." },
        { status: 400 }
      );
    }

    if (!businessType || !ALLOWED_BUSINESS_TYPES.has(businessType)) {
      return NextResponse.json(
        { error: "Please select a valid business type." },
        { status: 400 }
      );
    }

    if (locationsCount === null) {
      return NextResponse.json(
        { error: "Please enter a valid # of locations (1+)." },
        { status: 400 }
      );
    }

    // ----------------------------
    // 4) BUILD RECORD FOR GOOGLE SHEET
    // ----------------------------

    const record = {
      name: name || "",
      email,
      businessName,
      businessType,
      locationsCount, // number
      role: role || "",
      city: city || "",
      website: website || "",
      source: "landing-page",
      timestamp: new Date().toISOString(),

      // Helpful for debugging / spam analysis
      formElapsedMs,
    };

    const webhookUrl = process.env.WAITLIST_WEBHOOK_URL;

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "Missing WAITLIST_WEBHOOK_URL env var (server not configured)." },
        { status: 500 }
      );
    }

    // ----------------------------
    // 5) POST TO APPS SCRIPT
    // ----------------------------

    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      cache: "no-store",
    });

    const text = await upstream.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Apps Script HTTP error", details: data },
        { status: 502 }
      );
    }

    if (data?.success !== true) {
      return NextResponse.json(
        { error: "Apps Script did not confirm success", details: data },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("WAITLIST ERROR:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
