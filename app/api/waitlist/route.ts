import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AppsScriptResponse =
  | { success: true }
  | { success: false; error?: string }
  | Record<string, unknown>;

const ALLOWED_BUSINESS_TYPES = new Set([
  "Winery",
  "Restaurant",
  "Bar",
  "Cafe",
  "Nightclub",
  "Tour Operator",
  "Other",
]);

// ============================
// Bot protection settings
// ============================
const MIN_FORM_ELAPSED_MS = 3000;
const MAX_FORM_ELAPSED_MS = 1000 * 60 * 60; // 1 hour sanity cap

function cleanString(v: unknown, maxLen = 200) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function isValidEmail(email: string) {
  // MVP-friendly validation (better than includes("@"))
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseLocationsCount(v: unknown) {
  const raw =
    typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
  const digitsOnly = raw.replace(/\D/g, "");
  const n = Number(digitsOnly);
  if (!Number.isFinite(n)) return null;
  if (n < 1) return null;
  if (n > 10000) return null;
  return n;
}

function parseFormElapsedMs(v: unknown) {
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

function jsonOk<T extends Record<string, unknown>>(payload: T, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status });
}

function jsonFail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  try {
    const webhookUrl = process.env.WAITLIST_WEBHOOK_URL;
    if (!webhookUrl) {
      return jsonFail(
        "Server misconfigured: missing WAITLIST_WEBHOOK_URL.",
        500
      );
    }

    // Parse JSON body safely
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      return jsonFail("Invalid JSON body.", 400);
    }

    // ============================
    // 1) BOT PROTECTION (server-side)
    // ============================
    const honeypot =
      cleanString(body?.hp, 200) ||
      cleanString(body?.honeypot, 200) ||
      cleanString(body?.companyWebsite, 200) ||
      cleanString(body?.website2, 200) ||
      "";

    if (honeypot) {
      // Don’t be too descriptive to bots
      return jsonFail("Spam detected. Please try again.", 400);
    }

    const formElapsedMs = parseFormElapsedMs(body?.formElapsedMs);

    if (formElapsedMs === null) {
      return jsonFail("Please refresh and try again.", 400);
    }
    if (formElapsedMs < MIN_FORM_ELAPSED_MS) {
      return jsonFail("Form submitted too quickly.", 400);
    }

    // ============================
    // 2) FIELD PARSING
    // ============================
    const name = cleanString(body?.name, 120);
    const email = cleanString(body?.email, 254).toLowerCase();
    const businessName = cleanString(body?.businessName, 200);

    const businessType = cleanString(body?.businessType, 60);
    const businessTypeOther = cleanString(body?.businessTypeOther, 80);

    const role = cleanString(body?.role, 120);
    const city = cleanString(body?.city, 120);
    const website = cleanString(body?.website, 300);

    const locationsCount = parseLocationsCount(body?.locationsCount);

    // ============================
    // 3) REQUIRED VALIDATIONS
    // ============================
    if (!businessName) {
      return jsonFail("Business name is required.", 400);
    }

    if (!email || !isValidEmail(email)) {
      return jsonFail("A valid work email is required.", 400);
    }

    if (!businessType || !ALLOWED_BUSINESS_TYPES.has(businessType)) {
      return jsonFail("Please select a valid business type.", 400);
    }

    if (businessType === "Other" && !businessTypeOther) {
      return jsonFail("Please specify your business type (Other).", 400);
    }

    if (locationsCount === null) {
      return jsonFail("Please enter a valid # of locations (1+).", 400);
    }

    // ============================
    // 4) NORMALIZE BUSINESS TYPE FOR SHEET
    // ============================
    const normalizedBusinessType =
      businessType === "Other"
        ? `Other: ${businessTypeOther}`
        : businessType;

    // ============================
    // 5) BUILD RECORD FOR GOOGLE SHEET
    // ============================
    // Add a deterministic dedupe key (best-effort idempotency)
    const dedupeKey = `${email}|${businessName}`.toLowerCase();

    const record = {
      name: name || "",
      email,
      businessName,
      businessType: normalizedBusinessType,
      businessTypeOther: businessType === "Other" ? businessTypeOther : "",
      locationsCount,
      role: role || "",
      city: city || "",
      website: website || "",
      source: "landing-page",
      timestamp: new Date().toISOString(),
      formElapsedMs,
      dedupeKey,
    };

    // ============================
    // 6) POST TO APPS SCRIPT
    // ============================
    const upstream = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      cache: "no-store",
    });

    const rawText = await upstream.text();
    let data: AppsScriptResponse = {};
    try {
      data = JSON.parse(rawText);
    } catch {
      data = { raw: rawText };
    }

    if (!upstream.ok) {
      // Log internally, return generic message externally
      console.error("[waitlist] Apps Script HTTP error", {
        status: upstream.status,
        body: data,
      });
      return jsonFail("Upstream error submitting waitlist. Please try again.", 502);
    }

    if ((data as any)?.success !== true) {
      console.error("[waitlist] Apps Script did not confirm success", { body: data });
      return jsonFail("Could not submit waitlist. Please try again.", 502);
    }

    return jsonOk({}, 200);
  } catch (err: any) {
    console.error("[waitlist] WAITLIST ERROR:", err?.message || String(err));
    return jsonFail("Something went wrong. Please try again.", 500);
  }
}
