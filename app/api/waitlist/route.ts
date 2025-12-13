import { NextResponse } from "next/server";

const ALLOWED_BUSINESS_TYPES = new Set([
  "Winery",
  "Restaurant",
  "Bar",
  "Cafe",
  "Nightclub",
  "Tour Operator",
]);

function cleanString(v: unknown, maxLen = 200) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function parseLocationsCount(v: unknown) {
  // Frontend sends string; accept string/number and convert safely
  const raw =
    typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
  const digitsOnly = raw.replace(/\D/g, "");
  const n = Number(digitsOnly);
  if (!Number.isFinite(n)) return null;
  if (n < 1) return null;
  if (n > 10000) return null; // sanity cap
  return n;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = cleanString(body?.name, 120);
    const email = cleanString(body?.email, 254).toLowerCase();
    const businessName = cleanString(body?.businessName, 200);
    const businessType = cleanString(body?.businessType, 60);
    const role = cleanString(body?.role, 120);
    const city = cleanString(body?.city, 120);
    const website = cleanString(body?.website, 300);

    const locationsCount = parseLocationsCount(body?.locationsCount);

    // ---- Required validations ----
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

    // ---- Build the record you want to store ----
    // Use empty strings (instead of null) to keep Apps Script appendRow simple.
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
    };

    // ---- Read webhook URL from env ----
    // Keep your existing env var name (WAITLIST_WEBHOOK_URL) since you already set it.
    const webhookUrl = process.env.WAITLIST_WEBHOOK_URL;

    console.log("WAITLIST_WEBHOOK_URL exists?", Boolean(webhookUrl));

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "Missing WAITLIST_WEBHOOK_URL env var (server not configured)." },
        { status: 500 }
      );
    }

    // ---- Send to Google Apps Script Web App ----
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

    console.log("Apps Script status:", upstream.status, "response:", data);

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Apps Script HTTP error", details: data },
        { status: 502 }
      );
    }

    // ✅ Require an explicit success confirmation from Apps Script
    // Your Apps Script should return: { "success": true }
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
