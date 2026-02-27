"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { GBP_ENABLED } from "@/lib/featureFlags";

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

type Toast = {
  message: string;
  type?: "success" | "error";
};

type GbpAccount = {
  name: string;
  accountName?: string;
  type?: string;
};

type GbpLocation = {
  name: string;
  title?: string;
};

type SavedGbpLocation = {
  google_account_id: string;
  google_location_id: string;
  google_location_name: string;
  status?: string;
  updated_at?: string;
};

function maskPlaceId(pid?: string | null) {
  if (!pid) return "";
  const s = String(pid);
  if (s.length <= 10) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function maskLongId(id?: string | null) {
  if (!id) return "";
  const s = String(id);
  if (s.length <= 18) return s;
  return `${s.slice(0, 10)}…${s.slice(-6)}`;
}

export default function ConnectGooglePage() {
  const sb = supabaseBrowser();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"search" | "connect" | null>(null);

  const [business, setBusiness] = useState<CurrentBusiness | null>(null);
  const [userEmail, setUserEmail] = useState("");

  const [showReconnectUI, setShowReconnectUI] = useState(false);

  const [placeSearchQuery, setPlaceSearchQuery] = useState("");
  const [placeSearchResults, setPlaceSearchResults] = useState<PlaceCandidate[]>([]);
  const [placeSearchError, setPlaceSearchError] = useState<string | null>(null);

  const [placeIdInput, setPlaceIdInput] = useState("");
  const [placeIdStatus, setPlaceIdStatus] = useState<PlaceIdStatus>("idle");
  const [placeIdError, setPlaceIdError] = useState<string | null>(null);
  const [verified, setVerified] = useState<{
    name?: string;
    rating?: number;
    user_ratings_total?: number;
  } | null>(null);

  const [gbpStatus, setGbpStatus] = useState<string | null>(null);
  const [gbpPendingApproval, setGbpPendingApproval] = useState(false);

  const [gbpOauthConnected, setGbpOauthConnected] = useState(false);
  const [gbpOauthEmail, setGbpOauthEmail] = useState<string | null>(null);
  const [gbpOauthChecked, setGbpOauthChecked] = useState(false);

  const [gbpAccounts, setGbpAccounts] = useState<GbpAccount[]>([]);
  const [gbpSelectedAccount, setGbpSelectedAccount] = useState<string>("");
  const [gbpLocations, setGbpLocations] = useState<GbpLocation[]>([]);
  const [gbpSelectedLocations, setGbpSelectedLocations] = useState<Record<string, boolean>>({});
  const [gbpLoading, setGbpLoading] = useState<null | "accounts" | "locations" | "save">(null);

  const [gbpSavedLocations, setGbpSavedLocations] = useState<SavedGbpLocation[]>([]);
  const [gbpSavedLoading, setGbpSavedLoading] = useState(false);
  const [gbpRemoveLoadingId, setGbpRemoveLoadingId] = useState<string | null>(null);

  const [toast, setToast] = useState<Toast | null>(null);

  function showToast(t: Toast, ms = 3200) {
    setToast(t);
    window.setTimeout(() => setToast(null), ms);
  }

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

  async function loadGbpOauthStatus() {
    try {
      const res = await fetch("/api/google/oauth/status", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json?.ok) {
        setGbpOauthConnected(Boolean(json?.connected));
        setGbpOauthEmail(json?.integration?.google_account_email ?? null);
      } else {
        setGbpOauthConnected(false);
        setGbpOauthEmail(null);
      }
    } catch {
      setGbpOauthConnected(false);
      setGbpOauthEmail(null);
    } finally {
      setGbpOauthChecked(true);
    }
  }

  async function gbpLoadSavedLocations() {
    if (gbpSavedLoading) return;
    setGbpSavedLoading(true);
    try {
      const res = await fetch("/api/google/gbp/locations/selected", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json?.ok) {
        const locs = Array.isArray(json?.locations) ? (json.locations as SavedGbpLocation[]) : [];
        setGbpSavedLocations(locs);
      } else {
        setGbpSavedLocations([]);
      }
    } catch {
      setGbpSavedLocations([]);
    } finally {
      setGbpSavedLoading(false);
    }
  }

  async function gbpRemoveSavedLocation(google_location_id: string) {
    if (!google_location_id || gbpRemoveLoadingId) return;

    const row = gbpSavedLocations.find((x) => x.google_location_id === google_location_id);
    const label = row?.google_location_name ?? "this location";

    const ok = window.confirm(`Remove saved location "${label}"?`);
    if (!ok) return;

    setGbpRemoveLoadingId(google_location_id);
    setGbpStatus(null);

    try {
      const res = await fetch("/api/google/gbp/locations/selected", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ google_location_id }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        const msg = json?.error ?? "Failed to remove location.";
        showToast({ message: msg, type: "error" }, 4200);
        return;
      }

      const revoked = typeof json?.revoked === "number" ? json.revoked : 1;
      showToast({ message: `Removed (${revoked}).`, type: "success" }, 2200);

      await gbpLoadSavedLocations();
    } catch (e: any) {
      const msg = e?.message ?? "Failed to remove location.";
      showToast({ message: msg, type: "error" }, 4200);
    } finally {
      setGbpRemoveLoadingId(null);
    }
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
        setPlaceSearchError(json?.error ?? "Search didn't work. Try again.");
        return;
      }

      const candidates = Array.isArray(json?.candidates)
        ? (json.candidates as PlaceCandidate[])
        : [];
      setPlaceSearchResults(candidates);

      if (candidates.length === 0) {
        setPlaceSearchError("No matches yet — try adding the city or neighborhood.");
      }
    } catch (e: any) {
      setPlaceSearchError(e?.message ?? "Search didn't work. Try again.");
    } finally {
      setActionLoading(null);
    }
  }

  async function connectGooglePlaces() {
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
          "We couldn't confirm that listing. Please try again.";
        setPlaceIdStatus("error");
        setPlaceIdError(msg);
        showToast({ message: msg, type: "error" }, 4200);
        return;
      }

      setPlaceIdStatus("success");
      setVerified(json?.verified ?? null);

      await loadCurrentBusiness();

      showToast({ message: "Connected. Taking you to your dashboard…", type: "success" }, 2200);

      router.push("/dashboard");
      router.refresh();
    } catch (e: any) {
      const msg = e?.message ?? "Network error. Please try again.";
      setPlaceIdStatus("error");
      setPlaceIdError(msg);
      showToast({ message: msg, type: "error" }, 4200);
    } finally {
      setActionLoading(null);
    }
  }

  async function gbpLoadAccounts() {
    if (gbpLoading) return;

    if (!gbpOauthConnected) {
      const msg = "Connect Google (OAuth) first, then load accounts.";
      setGbpStatus(msg);
      showToast({ message: msg, type: "error" }, 3000);
      return;
    }

    setGbpLoading("accounts");
    setGbpStatus(null);
    setGbpPendingApproval(false);

    setGbpAccounts([]);
    setGbpSelectedAccount("");
    setGbpLocations([]);
    setGbpSelectedLocations({});

    try {
      const res = await fetch("/api/google/gbp/accounts", { cache: "no-store" });
      const json = await res.json();

      if (json?.code === "GBP_ACCESS_PENDING") {
        setGbpPendingApproval(true);
        setGbpStatus(
          "Google Business Profile API access is pending approval. You're connected via OAuth, and we'll enable full review syncing as soon as Google grants access."
        );
        return;
      }

      if (!res.ok) {
        const msg = json?.error ?? "Could not load Google Business Profile accounts.";
        setGbpStatus(msg);
        showToast({ message: msg, type: "error" }, 4200);
        return;
      }

      const accounts = Array.isArray(json?.accounts) ? (json.accounts as GbpAccount[]) : [];
      setGbpAccounts(accounts);

      if (accounts.length === 0) {
        const msg =
          "No accounts returned. Make sure you connected the correct Google account and it has access to the listing.";
        setGbpStatus(msg);
      } else {
        setGbpStatus(null);
      }
    } catch (e: any) {
      const msg = e?.message ?? "Failed to load accounts.";
      setGbpStatus(msg);
      showToast({ message: msg, type: "error" }, 4200);
    } finally {
      setGbpLoading(null);
    }
  }

  async function gbpLoadLocations(accountName: string) {
    if (!accountName || gbpLoading) return;

    setGbpLoading("locations");
    setGbpStatus(null);
    setGbpPendingApproval(false);

    setGbpLocations([]);
    setGbpSelectedLocations({});

    try {
      const res = await fetch(
        `/api/google/gbp/locations?account=${encodeURIComponent(accountName)}`,
        { cache: "no-store" }
      );
      const json = await res.json();

      if (json?.code === "GBP_ACCESS_PENDING") {
        setGbpPendingApproval(true);
        setGbpStatus(
          "Google Business Profile API access is pending approval. You're connected via OAuth, and we'll enable location loading as soon as Google grants access."
        );
        return;
      }

      if (!res.ok) {
        const msg = json?.error ?? "Could not load locations for this account.";
        setGbpStatus(msg);
        showToast({ message: msg, type: "error" }, 4200);
        return;
      }

      const locations = Array.isArray(json?.locations) ? (json.locations as GbpLocation[]) : [];
      setGbpLocations(locations);

      if (locations.length === 0) {
        setGbpStatus(
          "No locations returned. Make sure this account manages at least one Business Profile location."
        );
      }
    } catch (e: any) {
      const msg = e?.message ?? "Failed to load locations.";
      setGbpStatus(msg);
      showToast({ message: msg, type: "error" }, 4200);
    } finally {
      setGbpLoading(null);
    }
  }

  async function gbpSaveSelectedLocations() {
    if (gbpLoading) return;

    const chosen = gbpLocations
      .filter((l) => !!gbpSelectedLocations[l.name])
      .map((l) => ({
        google_location_id: l.name,
        google_location_name: l.title ?? l.name,
      }));

    if (!gbpSelectedAccount) {
      const msg = "Pick an account first.";
      setGbpStatus(msg);
      showToast({ message: msg, type: "error" }, 3000);
      return;
    }

    if (chosen.length === 0) {
      const msg = "Select at least one location.";
      setGbpStatus(msg);
      showToast({ message: msg, type: "error" }, 3000);
      return;
    }

    setGbpLoading("save");
    setGbpStatus(null);
    setGbpPendingApproval(false);

    try {
      const res = await fetch("/api/google/gbp/locations/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          google_account_id: gbpSelectedAccount,
          locations: chosen,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        const msg = json?.error ?? "Failed to save selected locations.";
        setGbpStatus(msg);
        showToast({ message: msg, type: "error" }, 4200);
        return;
      }

      const msg = `Saved ${json?.saved ?? chosen.length} location(s).`;
      setGbpStatus(msg);
      showToast({ message: msg, type: "success" }, 2200);

      await gbpLoadSavedLocations();
    } catch (e: any) {
      const msg = e?.message ?? "Failed to save selected locations.";
      setGbpStatus(msg);
      showToast({ message: msg, type: "error" }, 4200);
    } finally {
      setGbpLoading(null);
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

      if (GBP_ENABLED) {
        await loadGbpOauthStatus();
        await gbpLoadSavedLocations();
      }

      const b = await loadCurrentBusiness();

      if (b?.google_place_id) {
        setShowReconnectUI(false);
        setLoading(false);
        return;
      }

      setShowReconnectUI(true);
      setLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isAlreadyConnected = !!business?.google_place_id;

  const pageTitle = useMemo(() => {
    if (isAlreadyConnected && !showReconnectUI) return "Connected";
    if (isAlreadyConnected && showReconnectUI) return "Change connection";
    return "Connect";
  }, [isAlreadyConnected, showReconnectUI]);

  const gbpSelectedCount = useMemo(
    () => Object.values(gbpSelectedLocations).filter(Boolean).length,
    [gbpSelectedLocations]
  );

  if (loading) {
    return (
      <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>Connect</h1>
        <div style={{ opacity: 0.8 }}>Loading…</div>
      </main>
    );
  }

  // Connected summary view
  if (isAlreadyConnected && !showReconnectUI) {
    const name = business?.google_place_name ?? business?.business_name ?? "Your business";

    return (
      <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Connected ✅</h1>

        {userEmail && (
          <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 14 }}>
            Signed in as {userEmail}
          </div>
        )}

        <div style={cardStyle}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
            Your connected listing (Places)
          </div>

          <div style={{ fontSize: 14, opacity: 0.95 }}>
            <strong>{name}</strong>
          </div>

          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            Listing ID:{" "}
            <span style={{ fontFamily: "monospace" }}>
              {maskPlaceId(business?.google_place_id)}
            </span>
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

          {GBP_ENABLED && (
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(148,163,184,0.18)" }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                Google Business Profile (OAuth)
              </div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>
                {gbpOauthChecked ? (
                  gbpOauthConnected ? (
                    <>Connected ✅{gbpOauthEmail ? ` (${gbpOauthEmail})` : ""}</>
                  ) : (
                    "Not connected yet."
                  )
                ) : (
                  "Checking…"
                )}
              </div>
            </div>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => router.push("/dashboard")}
              style={buttonStyle}
              title="Go to dashboard"
            >
              Go to dashboard
            </button>

            <button
              onClick={() => {
                setShowReconnectUI(true);
                setPlaceSearchQuery("");
                setPlaceSearchResults([]);
                setPlaceSearchError(null);
                setPlaceIdStatus("idle");
                setPlaceIdError(null);
                setVerified(null);
                setGbpStatus(null);
                setGbpPendingApproval(false);
                setGbpAccounts([]);
                setGbpSelectedAccount("");
                setGbpLocations([]);
                setGbpSelectedLocations({});
              }}
              style={{ ...buttonStyle, background: "rgba(226,232,240,0.08)" }}
              title="Change connected listing"
            >
              Change listing
            </button>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
            Review Concierge drafts replies — it never posts anything for you.
          </div>
        </div>

        {toast && (
          <div style={toastStyle(toast.type)} aria-live="polite">
            {toast.message}
          </div>
        )}
      </main>
    );
  }

  // Connect / Change UI
  return (
    <main style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 6 }}>{pageTitle}</h1>

      {userEmail && (
        <div style={{ opacity: 0.7, fontSize: 13, marginBottom: 14 }}>
          Signed in as {userEmail}
        </div>
      )}

      {isAlreadyConnected && (
        <div style={{ marginBottom: 14, fontSize: 13, opacity: 0.85 }}>
          Currently connected to{" "}
          <strong>{business?.google_place_name ?? business?.business_name ?? "your business"}</strong>.
          You can switch to a different listing below.
        </div>
      )}

      <div style={cardStyle}>

        {/* ---------------------------------------- */}
        {/* GBP Section — only shown when flag is on */}
        {/* ---------------------------------------- */}
        {GBP_ENABLED && (
          <>
            <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
              Recommended: Google Business Profile (full reviews)
            </div>

            <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 12 }}>
              This is the official integration that enables <strong>all reviews per location</strong>{" "}
              (multi-location supported). If you haven't connected yet, start with OAuth.
            </div>

            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 10 }}>
              OAuth status:{" "}
              {gbpOauthChecked ? (
                gbpOauthConnected ? (
                  <strong>Connected ✅{gbpOauthEmail ? ` (${gbpOauthEmail})` : ""}</strong>
                ) : (
                  <strong>Not connected</strong>
                )
              ) : (
                "Checking…"
              )}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <a
                href="/api/google/oauth/start"
                style={{
                  ...buttonStyle,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Connect Google via OAuth"
              >
                {gbpOauthConnected ? "Reconnect Google (OAuth)" : "Connect Google (OAuth)"}
              </a>

              <button
                onClick={gbpLoadAccounts}
                disabled={gbpLoading !== null || !gbpOauthConnected}
                style={buttonStyle}
                title={!gbpOauthConnected ? "Connect Google (OAuth) first" : "Load GBP accounts"}
              >
                {gbpLoading === "accounts" ? "Loading accounts…" : "Load accounts"}
              </button>

              <button
                onClick={gbpLoadSavedLocations}
                disabled={gbpSavedLoading || gbpRemoveLoadingId !== null}
                style={{ ...buttonStyle, background: "rgba(226,232,240,0.08)" }}
                title="Refresh saved locations"
              >
                {gbpSavedLoading ? "Refreshing…" : "Refresh saved"}
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
                Saved locations:
              </div>

              {gbpSavedLoading ? (
                <div style={{ fontSize: 12, opacity: 0.75 }}>Loading saved locations…</div>
              ) : gbpSavedLocations.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  None yet. Once GBP is approved, you'll select locations here and we'll sync reviews per location.
                </div>
              ) : (
                <div style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 12, padding: 10 }}>
                  {gbpSavedLocations.map((l) => {
                    const isRemoving = gbpRemoveLoadingId === l.google_location_id;
                    return (
                      <div
                        key={l.google_location_id}
                        style={{
                          padding: "8px 6px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 13 }}>{l.google_location_name}</div>
                          <div style={{ fontSize: 12, opacity: 0.75, fontFamily: "monospace" }}>
                            {maskLongId(l.google_location_id)}
                          </div>
                        </div>

                        <button
                          onClick={() => gbpRemoveSavedLocation(l.google_location_id)}
                          disabled={gbpRemoveLoadingId !== null}
                          style={{
                            ...miniButtonStyle,
                            border: "1px solid rgba(248,113,113,0.45)",
                            background: "rgba(127,29,29,0.25)",
                          }}
                          title="Remove saved location"
                        >
                          {isRemoving ? "Removing…" : "Remove"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {gbpPendingApproval && (
              <div
                style={{
                  marginTop: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.25)",
                  background: "rgba(15,23,42,0.55)",
                  fontSize: 13,
                  opacity: 0.95,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: 4 }}>GBP access pending ⏳</div>
                <div style={{ opacity: 0.9 }}>
                  Google has not approved Business Profile API access for this project yet (quota is 0),
                  so we can't load accounts/locations today. Your OAuth connection is working, and we'll
                  enable full review syncing as soon as Google grants access.
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                  In the meantime, you can use the <strong>Places</strong> connection below.
                </div>
              </div>
            )}

            {gbpStatus && !gbpPendingApproval && (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 13,
                  color: gbpStatus.includes("Saved") ? "#22c55e" : "#f87171",
                }}
              >
                {gbpStatus}
              </div>
            )}

            {gbpAccounts.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>Choose an account:</div>

                <select
                  value={gbpSelectedAccount}
                  onChange={(e) => {
                    const v = e.target.value;
                    setGbpSelectedAccount(v);
                    setGbpLocations([]);
                    setGbpSelectedLocations({});
                    if (v) gbpLoadLocations(v);
                  }}
                  style={selectStyle}
                  disabled={gbpLoading === "locations" || gbpLoading === "save"}
                >
                  <option value="">Select an account…</option>
                  {gbpAccounts.map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {gbpLocations.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
                    Select locations ({gbpSelectedCount} selected):
                  </div>
                  <button
                    onClick={() => {
                      const all: Record<string, boolean> = {};
                      gbpLocations.forEach((l) => (all[l.name] = true));
                      setGbpSelectedLocations(all);
                    }}
                    style={{ ...miniButtonStyle }}
                  >
                    Select all
                  </button>
                </div>

                <div style={{ border: "1px solid rgba(148,163,184,0.25)", borderRadius: 12, padding: 10 }}>
                  {gbpLocations.map((l) => (
                    <label key={l.name} style={{ display: "flex", gap: 10, padding: "8px 6px" }}>
                      <input
                        type="checkbox"
                        checked={!!gbpSelectedLocations[l.name]}
                        onChange={(e) =>
                          setGbpSelectedLocations((prev) => ({ ...prev, [l.name]: e.target.checked }))
                        }
                        disabled={gbpLoading === "save"}
                      />
                      <span>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{l.title ?? "(Untitled location)"}</div>
                        <div style={{ fontSize: 12, opacity: 0.75 }}>{l.name}</div>
                      </span>
                    </label>
                  ))}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={gbpSaveSelectedLocations} disabled={gbpLoading !== null} style={buttonStyle}>
                    {gbpLoading === "save" ? "Saving…" : "Save selected locations"}
                  </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                  You can select multiple locations. Reviews will be ingested per-location once the GBP review access is available.
                </div>
              </div>
            )}

            {/* Divider between GBP and Places */}
            <div style={{ marginTop: 16, borderTop: "1px solid rgba(148,163,184,0.18)", paddingTop: 16 }} />
          </>
        )}

        {/* ---------------------------------------- */}
        {/* Places Section — always shown            */}
        {/* ---------------------------------------- */}
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>
          {GBP_ENABLED ? "Legacy: Google Places (limited reviews)" : "Connect your Google listing"}
        </div>

        <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 12 }}>
          {GBP_ENABLED
            ? "This is your current MVP integration. Google may only provide a limited sample of reviews here."
            : "Search for your business listing and connect it to start drafting replies."}
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Find your listing</div>

        <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 12 }}>
          Search using <strong>name + city</strong> (example: "Delfina Palo Alto").
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={placeSearchQuery}
            onChange={(e) => setPlaceSearchQuery(e.target.value)}
            placeholder="Business name + city"
            disabled={actionLoading === "search" || actionLoading === "connect"}
            style={inputStyle}
          />

          <button
            onClick={searchPlaces}
            disabled={actionLoading === "search" || !placeSearchQuery.trim()}
            style={buttonStyle}
            title="Search"
          >
            {actionLoading === "search" ? "Searching…" : "Search"}
          </button>
        </div>

        {placeSearchError && (
          <div style={{ marginTop: 10, fontSize: 13, color: "#f87171" }}>{placeSearchError}</div>
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
                  showToast({ message: `Selected: ${p.name}`, type: "success" }, 1800);
                }}
                style={resultButtonStyle}
                title="Select this listing"
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                {p.formatted_address && (
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                    {p.formatted_address}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div style={{ marginTop: 14, borderTop: "1px solid rgba(148,163,184,0.18)", paddingTop: 14 }}>
          <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>Or paste a listing ID:</div>

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
              placeholder="Listing ID"
              disabled={actionLoading === "connect"}
              style={inputStyle}
            />

            <button
              onClick={connectGooglePlaces}
              disabled={actionLoading === "connect" || !placeIdInput.trim()}
              style={buttonStyle}
              title="Connect"
            >
              {actionLoading === "connect" ? "Connecting…" : "Connect"}
            </button>
          </div>

          <div style={{ marginTop: 10 }}>
            {placeIdStatus === "loading" && <div style={{ fontSize: 13, opacity: 0.9 }}>Connecting…</div>}
            {placeIdStatus === "error" && <div style={{ fontSize: 13, color: "#f87171" }}>{placeIdError}</div>}
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
              {typeof verified.user_ratings_total === "number" ? ` • ${verified.user_ratings_total} ratings` : ""}
            </div>
          )}

          {isAlreadyConnected && (
            <div style={{ marginTop: 14 }}>
              <button
                onClick={() => {
                  setShowReconnectUI(false);
                  router.refresh();
                }}
                style={{ ...buttonStyle, background: "rgba(226,232,240,0.08)" }}
              >
                Cancel (keep current)
              </button>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
          We'll show your reviews inside Review Concierge so you can draft replies in your voice.
          You approve, edit, and post.
        </div>
      </div>

      {toast && (
        <div style={toastStyle(toast.type)} aria-live="polite">
          {toast.message}
        </div>
      )}
    </main>
  );
}

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 16,
  padding: 16,
  background: "#0f172a",
  color: "#e2e8f0",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#0f172a",
  cursor: "pointer",
  color: "#e2e8f0",
};

const miniButtonStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.6)",
  cursor: "pointer",
  color: "#e2e8f0",
  fontSize: 12,
};

const inputStyle: React.CSSProperties = {
  flex: "1 1 260px",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.7)",
  color: "inherit",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.7)",
  color: "#e2e8f0",
  outline: "none",
};

const resultButtonStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "12px 12px",
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.6)",
  color: "#e2e8f0",
  cursor: "pointer",
};

function toastStyle(type?: "success" | "error"): React.CSSProperties {
  return {
    position: "fixed",
    bottom: 24,
    right: 24,
    padding: "12px 16px",
    borderRadius: 12,
    background: type === "error" ? "rgba(220,38,38,0.95)" : "rgba(15,23,42,0.95)",
    color: "#fff",
    fontSize: 14,
    boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
    zIndex: 1000,
    maxWidth: 360,
  };
}