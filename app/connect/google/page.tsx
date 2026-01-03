"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type PlaceCandidate = {
  place_id: string;
  name: string;
  formatted_address?: string;
};

type CurrentBusiness = {
  id: string;
  business_name?: string | null;
  google_place_id?: string | null;
  google_place_name?: string | null;
  google_rating?: number | null;
  google_user_ratings_total?: number | null;
};

type PlaceIdStatus = "idle" | "loading" | "success" | "error";

export default function ConnectGooglePage() {
  const sb = supabaseBrowser();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"search" | "connect" | null>(null);

  const [business, setBusiness] = useState<CurrentBusiness | null>(null);
  const [userEmail, setUserEmail] = useState("");

  // If already connected, we show a “connected” view.
  // User can optionally click “Reconnect” to use the search/connect UI.
  const [showReconnectUI, setShowReconnectUI] = useState(false);

  // search flow
  const [placeSearchQuery, setPlaceSearchQuery] = useState("");
  const [placeSearchResults, setPlaceSearchResults] = useState<PlaceCandidate[]>([]);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);

  // connect flow
  const [placeIdInput, setPlaceIdInput] = useState("");
  const [placeIdStatus, setPlaceIdStatus] = useState<PlaceIdStatus>("idle");
  const [placeIdError, setPlaceIdError] = useState<string | null>(null);
  const [verified, setVerified] = useState<{
    name?: string;
    rating?: number;
    user_ratings_total?: number;
  } | null>(null);

  async function loadCurrentBusiness() {
    const res = await fetch("/api/businesses/current", { cache: "no-store" });
    const json = await res.json();
    if (res.ok && json?.ok) {
      const b = (json.business ?? null) as CurrentBusiness | null;
      setBusiness(b);
      setPlaceIdInput(b?.google_place_id ?? "");
      return b;
    }
    return null;
  }

  async function searchPlaces() {
    const q = placeSearchQuery.trim();
    if (!q || actionLoading) return;

    setActionLoading("search");
    setPlaceSearchError(null);
    setPlaceSearchResults([]);

    try {
      const res = await fetch(`/api/google/places-search?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        setPlaceSearchError(json?.error ?? "Search failed");
        return;
      }

      const candidates = Array.isArray(json?.candidates)
        ? (json.candidates as PlaceCandidate[])
        : [];
      setPlaceSearchResults(candidates);
    } catch (e: any) {
      setPlaceSearchError(e?.message ?? "Search failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function connectGoogle() {
    if (actionLoading) return;

    const placeId = placeIdInput.trim();
    if (!placeId) return;

    setPlaceIdStatus("loading");
    setPlaceIdError(null);
    setVerified(null);

    setActionLoading("connect");
    try {
      const res = await fetch("/api/businesses/connect-google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google_place_id: placeId }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        const msg =
          json?.error ??
          json?.googleError ??
          "We couldn’t verify this Place ID. Please double-check it and try again.";
        setPlaceIdStatus("error");
        setPlaceIdError(msg);
        return;
      }

      setPlaceIdStatus("success");
      setVerified(json?.verified ?? null);

      // refresh business and send to dashboard
      await loadCurrentBusiness();
      router.push("/dashboard");
      router.refresh();
    } catch (e: any) {
      const msg = e?.message ?? "Network error verifying Place ID. Please try again.";
      setPlaceIdStatus("error");
      setPlaceIdError(msg);
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);

      const { data: userData } = await sb.auth.getUser();
      const email = userData?.user?.email ?? "";
      setUserEmail(email);

      if (!userData?.user) {
        router.replace("/login");
        return;
      }

      const b = await loadCurrentBusiness();

      // Instead of forcing redirect if already connected,
      // keep user here and show a “Connected” summary.
      if (b?.google_place_id) {
        setShowReconnectUI(false);
        setLoading(false);
        return;
      }

      // not connected → show connect UI
      setShowReconnectUI(true);
      setLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAlreadyConnected = !!business?.google_place_id;

  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Connect Google</h1>
        <div style={{ opacity: 0.8 }}>Loading…</div>
      </main>
    );
  }

  // Connected view (default when already connected)
  if (isAlreadyConnected && !showReconnectUI) {
    return (
      <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Google Connected ✅</h1>

        {userEmail && (
          <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 14 }}>
            Signed in as {userEmail}
          </div>
        )}

        <div
          style={{
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 16,
            padding: 16,
            background: "#0f172a",
            color: "#e2e8f0",
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
            Connected business
          </div>

          <div style={{ fontSize: 14, opacity: 0.95 }}>
            <strong>{business?.google_place_name ?? business?.business_name ?? "Your Business"}</strong>
          </div>

          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            Place ID:{" "}
            <span style={{ fontFamily: "monospace" }}>{business?.google_place_id}</span>
          </div>

          {(typeof business?.google_rating === "number" ||
            typeof business?.google_user_ratings_total === "number") && (
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
              {typeof business?.google_rating === "number" ? `${business.google_rating}★` : ""}
              {typeof business?.google_user_ratings_total === "number"
                ? ` • ${business.google_user_ratings_total} ratings`
                : ""}
            </div>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => router.push("/dashboard")}
              style={buttonStyle}
              title="Go to dashboard"
            >
              Go to Dashboard
            </button>

            <button
              onClick={() => {
                // reveal connect UI
                setShowReconnectUI(true);
                setPlaceSearchQuery("");
                setPlaceSearchResults([]);
                setPlaceSearchError(null);
                setPlaceIdStatus("idle");
                setPlaceIdError(null);
                setVerified(null);
              }}
              style={{
                ...buttonStyle,
                background: "rgba(226,232,240,0.08)",
              }}
              title="Reconnect or change business"
            >
              Change / Reconnect
            </button>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
            Tip: If you want to switch to a different location/business, use “Change / Reconnect”.
          </div>
        </div>
      </main>
    );
  }

  // Connect UI (either not connected, or user clicked reconnect)
  return (
    <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>
        {isAlreadyConnected ? "Reconnect Google" : "Connect Google"}
      </h1>
      {userEmail && (
        <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 14 }}>
          Signed in as {userEmail}
        </div>
      )}

      {isAlreadyConnected && (
        <div style={{ marginBottom: 14, fontSize: 13, opacity: 0.85 }}>
          Currently connected to{" "}
          <strong>{business?.google_place_name ?? business?.business_name ?? "Your Business"}</strong>.{" "}
          Select a new business below to switch.
        </div>
      )}

      <div
        style={{
          border: "1px solid rgba(148,163,184,0.25)",
          borderRadius: 16,
          padding: 16,
          background: "#0f172a",
          color: "#e2e8f0",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
          Find your business
        </div>
        <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 12 }}>
          Tip: search “name + city” (e.g. “Delfina Palo Alto”)
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={placeSearchQuery}
            onChange={(e) => setPlaceSearchQuery(e.target.value)}
            placeholder="Business name + city"
            disabled={actionLoading === "search" || actionLoading === "connect"}
            style={{
              flex: "1 1 260px",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(148,163,184,0.35)",
              background: "rgba(15,23,42,0.7)",
              color: "inherit",
              outline: "none",
            }}
          />

          <button
            onClick={searchPlaces}
            disabled={actionLoading === "search" || !placeSearchQuery.trim()}
            style={buttonStyle}
            title="Search Google Places"
          >
            {actionLoading === "search" ? "Searching…" : "Search"}
          </button>
        </div>

        {placeSearchError && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#f87171" }}>
            {placeSearchError}
          </div>
        )}

        {placeSearchResults.length > 0 && (
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {placeSearchResults.map((p) => (
              <button
                key={p.place_id}
                onClick={() => {
                  setPlaceIdInput(p.place_id);
                  setPlaceIdStatus("idle");
                  setPlaceIdError(null);
                  setVerified(null);
                }}
                style={{
                  textAlign: "left",
                  padding: "12px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(148,163,184,0.25)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e2e8f0",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                {p.formatted_address && (
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                    {p.formatted_address}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 11,
                    opacity: 0.55,
                    marginTop: 8,
                    fontFamily: "monospace",
                  }}
                >
                  {p.place_id}
                </div>
              </button>
            ))}
          </div>
        )}

        <div
          style={{
            marginTop: 14,
            borderTop: "1px solid rgba(148,163,184,0.18)",
            paddingTop: 14,
          }}
        >
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
            Or paste a Place ID manually:
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input
              value={placeIdInput}
              onChange={(e) => {
                setPlaceIdInput(e.target.value);
                if (placeIdStatus === "error") {
                  setPlaceIdStatus("idle");
                  setPlaceIdError(null);
                }
              }}
              placeholder="Google Place ID"
              disabled={actionLoading === "connect"}
              style={{
                flex: "1 1 320px",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.35)",
                background: "rgba(15,23,42,0.7)",
                color: "inherit",
                outline: "none",
              }}
            />

            <button
              onClick={connectGoogle}
              disabled={actionLoading === "connect" || !placeIdInput.trim()}
              style={buttonStyle}
              title="Verify & Connect"
            >
              {actionLoading === "connect" ? "Verifying…" : "Verify & Connect"}
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            {placeIdStatus === "loading" && (
              <div style={{ fontSize: 13, opacity: 0.9 }}>Verifying…</div>
            )}
            {placeIdStatus === "error" && (
              <div style={{ fontSize: 13, color: "#f87171" }}>{placeIdError}</div>
            )}
            {placeIdStatus === "success" && (
              <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 700 }}>
                Connected ✔ Redirecting…
              </div>
            )}
          </div>

          {verified?.name && (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.9 }}>
              Connected to: <strong>{verified.name}</strong>
              {typeof verified.rating === "number" ? ` • ${verified.rating}★` : ""}
              {typeof verified.user_ratings_total === "number"
                ? ` • ${verified.user_ratings_total} ratings`
                : ""}
            </div>
          )}

          {isAlreadyConnected && (
            <div style={{ marginTop: 14 }}>
              <button
                onClick={() => {
                  setShowReconnectUI(false);
                  router.refresh();
                }}
                style={{
                  ...buttonStyle,
                  background: "rgba(226,232,240,0.08)",
                }}
              >
                Cancel (keep current connection)
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#0f172a",
  cursor: "pointer",
  color: "#e2e8f0",
};
