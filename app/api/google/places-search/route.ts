export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";
import { requireActiveSubscription } from "@/lib/subscriptionServer";

type PlaceCandidate = {
  place_id: string;
  name: string;
  formatted_address?: string;
};

function cleanString(v: unknown, maxLen = 200) {
  if (typeof v !== "string") return "";
  return v.trim().slice(0, maxLen);
}

function cleanLang(v: unknown) {
  const raw = cleanString(v, 12).toLowerCase();
  // Keep permissive but safe; Google accepts BCP-47 (e.g., en, es, pt-BR)
  return raw || "en";
}

export async function GET(req: Request) {
  try {
    // 1) Org check (prevents public scraping)
    await requireOrgContext();

    // 2) Subscription gating (keep consistent with connect-google / draft endpoints)
    // If you later decide that “search + connect” should be free pre-billing,
    // remove this gate (and the one in connect-google).
    const sub = await requireActiveSubscription();
    if (!sub.ok) {
      return NextResponse.json(
        { ok: false, upgradeRequired: true, status: sub.status ?? null, candidates: [] },
        { status: 402 }
      );
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing GOOGLE_PLACES_API_KEY" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const q = cleanString(searchParams.get("q"), 120);
    const lang = cleanLang(searchParams.get("lang"));

    // UX-friendly: for empty/short queries, return empty candidates (no error)
    if (q.length < 3) {
      return NextResponse.json({ ok: true, candidates: [] }, { status: 200 });
    }

    // Places API (New) Text Search
    const url = "https://places.googleapis.com/v1/places:searchText";

    const body = {
      textQuery: q,
      languageCode: lang,
      maxResultCount: 8,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // Keep responses small (cheaper + faster)
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      // Don’t leak upstream response bodies to client (safer + cleaner demo)
      console.error("[places-search] upstream error", res.status, json);
      return NextResponse.json(
        {
          ok: false,
          error: "Places search failed. Please try again in a moment.",
        },
        { status: 502 }
      );
    }

    const places = Array.isArray((json as any)?.places) ? (json as any).places : [];

    const candidates: PlaceCandidate[] = places
      .map((p: any) => ({
        place_id: typeof p?.id === "string" ? p.id : "",
        name: typeof p?.displayName?.text === "string" ? p.displayName.text : "",
        formatted_address:
          typeof p?.formattedAddress === "string" ? p.formattedAddress : undefined,
      }))
      .filter((p: PlaceCandidate) => Boolean(p.place_id && p.name));

    return NextResponse.json({ ok: true, candidates }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
