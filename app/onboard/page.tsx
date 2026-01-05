// app/onboard/page.tsx
"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ConnectGoogleResponse = {
  ok: boolean;
  business?: {
    id: string;
    google_place_id?: string | null;
    google_place_name?: string | null;
    business_name?: string | null;
  } | null;
  verified?: { name?: string; rating?: number; user_ratings_total?: number } | null;

  // error fields (when ok=false)
  error?: string;
  googleStatus?: string;
  googleError?: string;

  // optional gating fields
  upgradeRequired?: boolean;
  status?: string | null;
};

type ImportReviewsResponse = {
  ok: boolean;

  // success fields
  fetched?: number;
  upserted_total?: number;
  note?: string;

  // error fields
  error?: string;
  googleStatus?: string;
  googleError?: string;

  // gating
  upgradeRequired?: boolean;
  status?: string | null;
};

export default function OnboardPage() {
  const router = useRouter();

  const [placeId, setPlaceId] = useState("");
  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // If review import is gated by subscription, we show a friendly note + redirect
  const [needsUpgrade, setNeedsUpgrade] = useState(false);

  // Basic “valid enough” check (Place IDs vary, but they’re never tiny)
  const cleanedPlaceId = useMemo(() => placeId.trim(), [placeId]);
  const isValid = useMemo(() => cleanedPlaceId.length >= 10, [cleanedPlaceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;

    setError(null);
    setSuccess(false);
    setNeedsUpgrade(false);
    setLoading(true);

    try {
      // 1) Connect/verify Google Place ID (creates/updates current org business)
      const connectRes = await fetch("/api/businesses/connect-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google_place_id: cleanedPlaceId }),
      });

      const connectJson = (await connectRes
        .json()
        .catch(() => null)) as ConnectGoogleResponse | null;

      if (!connectRes.ok || connectJson?.ok !== true) {
        const msg =
          connectJson?.error ||
          connectJson?.googleError ||
          "We couldn’t verify this Place ID. Please double-check it and try again.";
        throw new Error(msg);
      }

      const connectedPlaceId =
        connectJson.business?.google_place_id?.trim() || cleanedPlaceId;

      // 2) Import reviews from Google (GET)
      const importedRes = await fetch(
        `/api/reviews/google?google_place_id=${encodeURIComponent(connectedPlaceId)}`,
        { cache: "no-store" }
      );

      const importedJson = (await importedRes
        .json()
        .catch(() => null)) as ImportReviewsResponse | null;

      // If your reviews route gates with { upgradeRequired: true } + 402, handle nicely.
      if (importedRes.status === 402 || importedJson?.upgradeRequired) {
        setSuccess(true);
        setNeedsUpgrade(true);
        setTimeout(() => router.push("/dashboard?upgrade=1"), 900);
        return;
      }

      if (!importedRes.ok || importedJson?.ok !== true) {
        const msg =
          importedJson?.error ||
          importedJson?.googleError ||
          "Failed to import reviews.";
        throw new Error(msg);
      }

      setSuccess(true);

      // 3) Redirect to dashboard
      setTimeout(() => router.push("/dashboard"), 900);
    } catch (err: any) {
      setError(err?.message || "Could not onboard this business.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold leading-tight">
            Get your Google reviews in one place
          </h1>
          <p className="text-sm text-white/70 mt-2">
            Paste your business’s Google Place ID and we’ll connect it instantly.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Google Place ID</label>

            <input
              value={placeId}
              onChange={(e) => setPlaceId(e.target.value)}
              placeholder="e.g. ChIJN1t_tDeuEmsRUsoyG83frY4"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-3 text-base outline-none focus:border-white/30 focus:bg-white/10"
            />

            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-white/60">
                This uniquely identifies your business on Google.
              </p>

              <a
                href="https://developers.google.com/maps/documentation/places/web-service/place-id"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-white/80 underline underline-offset-4 hover:text-white"
              >
                Where do I find my Place ID?
              </a>
            </div>

            {!isValid && placeId.length > 0 && (
              <p className="mt-2 text-xs text-red-300">
                That doesn’t look like a valid Place ID yet — double-check and try
                again.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={!isValid || loading}
            className="w-full rounded-lg px-4 py-3 font-medium border border-white/15 bg-white/10 hover:bg-white/15 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Connecting…" : "Connect & Import Reviews"}
          </button>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-3">
              <p className="text-sm text-red-100">{error}</p>
            </div>
          )}

          {success && !needsUpgrade && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-3">
              <p className="text-sm text-emerald-50">
                Success — importing complete. Redirecting…
              </p>
            </div>
          )}

          {success && needsUpgrade && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-3">
              <p className="text-sm text-amber-50">
                Connected ✅
                <br />
                Review sync requires an active subscription. Redirecting to the
                dashboard…
              </p>
            </div>
          )}

          <p className="text-xs text-white/50 pt-2">
            Tip: For in-person demos, keep this page open — paste the Place ID and
            jump to the dashboard.
          </p>
        </form>
      </div>
    </div>
  );
}
