export const runtime = "nodejs";

import { NextResponse } from "next/server";

type GooglePlacesDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    name?: string;
    rating?: number;
  };
};

function jsonOk(payload: Record<string, unknown> = {}, status = 200) {
  return NextResponse.json({ ok: true, ...payload }, { status });
}

function jsonFail(error: string, status = 500, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

export async function GET() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = process.env.GOOGLE_TEST_PLACE_ID;

  if (!apiKey) return jsonFail("Server misconfigured", 500, { missing: "GOOGLE_PLACES_API_KEY" });
  if (!placeId) return jsonFail("Server misconfigured", 500, { missing: "GOOGLE_TEST_PLACE_ID" });

  const url =
    "https://maps.googleapis.com/maps/api/place/details/json" +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=name,rating` +
    `&key=${encodeURIComponent(apiKey)}`;

  // Keep health checks fast
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: controller.signal,
    });

    // If Google returns a non-2xx, treat as upstream issue
    const rawText = await res.text();
    let data: GooglePlacesDetailsResponse | { [k: string]: any } | null = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }

    if (!res.ok) {
      return jsonFail("Google Places upstream error", 502, {
        upstreamStatus: res.status,
        upstreamBody: data ?? rawText,
      });
    }

    const parsed = data as GooglePlacesDetailsResponse;

    if (!parsed || parsed.status !== "OK") {
      return jsonFail("Google Places returned non-OK status", 502, {
        googleStatus: parsed?.status ?? null,
        googleError: parsed?.error_message ?? null,
      });
    }

    return jsonOk({
      where: "google_places",
      status: "ok",
      placeName: parsed.result?.name ?? null,
      rating: typeof parsed.result?.rating === "number" ? parsed.result.rating : null,
    });
  } catch (err: any) {
    const isAbort =
      typeof err?.name === "string" && err.name.toLowerCase().includes("abort");

    console.error("[health/google] error", err?.message || String(err));

    return jsonFail(isAbort ? "Google Places timed out" : "Failed to reach Google Places", 502, {
      where: "google_places",
    });
  } finally {
    clearTimeout(timeout);
  }
}
