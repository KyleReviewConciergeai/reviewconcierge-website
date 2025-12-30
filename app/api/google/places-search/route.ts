export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrgContext } from "@/lib/orgServer";

type PlaceCandidate = {
  place_id: string;
  name: string;
  formatted_address?: string;
};

export async function GET(req: Request) {
  try {
    // org check (prevents random public scraping)
    await requireOrgContext();

    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing GOOGLE_PLACES_API_KEY" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();

    // Demo UX: don’t hard-fail on empty/short query; just return no candidates
    if (q.length < 3) {
      return NextResponse.json({ ok: true, candidates: [] });
    }

    // Places API (New) Text Search
    const url = "https://places.googleapis.com/v1/places:searchText";

    const body = {
      textQuery: q,
      languageCode: "en",
      maxResultCount: 8,
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // limit fields so responses are small + cheaper
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const json = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "Places search failed",
          status: res.status,
          details: json,
        },
        { status: res.status } // preserve upstream status for debugging
      );
    }

    const places = Array.isArray(json?.places) ? json.places : [];

    const candidates: PlaceCandidate[] = places
      .map((p: any) => ({
        place_id: p?.id,
        name: p?.displayName?.text,
        formatted_address: p?.formattedAddress,
      }))
      .filter((p: PlaceCandidate) => !!p.place_id && !!p.name);

    return NextResponse.json({ ok: true, candidates });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
