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
  const raw = typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
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
      return NextResponse.json({ error: "Business name is required." }, { status: 400 });
    }

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "A valid work email is required." }, { status: 400 });
    }

    if (!businessType || !ALLOWED_BUSINESS_TYPES.has(businessType)) {
      return NextResponse.json({ error: "Please select a valid business type." }, { status: 400 });
    }

    if (locationsCount === null) {
      return NextResponse.json(
        { error: "Please enter a valid # of locations (1+)." },
        { status: 400 }
      );
    }

    // ---- Build the record you want to store ----
    const record = {
      name: name || null,
      email,
      businessName,
      businessType,
      locationsCount, // number
      role: role || null,
      city: city || null,
      website: website || null,
      createdAt: new Date().toISOString(),
      source: "landing-page",
    };

    // =========================================================
    // TODO: SAVE YOUR RECORD HERE
    //
    // Examples:
    // - Insert into DB (Supabase / Postgres / Prisma)
    // - Create Airtable row
    // - Append to Google Sheet
    // - Send yourself an email notification
    //
    // For now, this is a safe placeholder:
    console.log("WAITLIST SIGNUP:", record);
    // =========================================================

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    console.error("WAITLIST ERROR:", err);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
