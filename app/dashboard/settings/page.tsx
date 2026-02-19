"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import VoiceSamplesCard from "./VoiceSamplesCard";

type Settings = {
  owner_language: string;
  reply_tone: string;
  reply_signature: string | null;
};

type Toast = { message: string; type?: "success" | "error" };

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "pt", label: "Portuguese" },
  { code: "fr", label: "French" },
  { code: "it", label: "Italian" },
  { code: "de", label: "German" },
];

// Mendoza MVP: keep tones tight and easy to explain.
// (No "Playful" to avoid edge cases / decision fatigue)
const TONES: Array<{ value: string; label: string; help: string; example: string }> = [
  {
    value: "warm",
    label: "Warm",
    help: "Friendly, grateful, human.",
    example: "“Loved the cozy vibe and the kebabs — really appreciate you coming in.”",
  },
  {
    value: "neutral",
    label: "Neutral",
    help: "Calm, straightforward, not overly emotional.",
    example: "“Thanks for stopping by — glad you enjoyed it, and we appreciate the note.”",
  },
  {
    value: "direct",
    label: "Direct",
    help: "Short and to the point.",
    example: "“Thanks for the visit — we’ll keep that feedback in mind.”",
  },
];

function normalizeTone(v: string) {
  const t = (v || "").toLowerCase().trim();

  // Map legacy values to current set (so existing DB values don’t break)
  if (t === "professional") return "neutral";
  if (t === "playful") return "warm";

  if (t === "warm" || t === "neutral" || t === "direct") return t;
  return "warm";
}

export default function SettingsPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [organizationId, setOrganizationId] = useState<string>("");

  const [settings, setSettings] = useState<Settings>({
    owner_language: "en",
    reply_tone: "warm",
    reply_signature: null,
  });

  function showToast(t: Toast, ms = 3000) {
    setToast(t);
    window.setTimeout(() => setToast(null), ms);
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/organizations/settings", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json?.ok) {
        showToast({ message: json?.error ?? "Couldn’t load settings.", type: "error" }, 4500);
        if (json?.organizationId) setOrganizationId(String(json.organizationId));
        return;
      }

      if (json?.organizationId) setOrganizationId(String(json.organizationId));

      const s = json.settings as Settings;
      setSettings({
        owner_language: s?.owner_language ?? "en",
        reply_tone: normalizeTone(s?.reply_tone ?? "warm"),
        reply_signature: s?.reply_signature ?? null,
      });
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t load settings.", type: "error" }, 4500);
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);

    // optimistic: keep what user selected visible immediately
    const optimistic: Settings = {
      ...settings,
      reply_tone: normalizeTone(settings.reply_tone),
      reply_signature: (settings.reply_signature ?? "").trim() || null,
    };

    try {
      const res = await fetch("/api/organizations/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(optimistic),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        showToast({ message: json?.error ?? "Couldn’t save settings.", type: "error" }, 4500);
        if (json?.organizationId) setOrganizationId(String(json.organizationId));
        return;
      }

      if (json?.organizationId) setOrganizationId(String(json.organizationId));

      // Use server-saved values if present
      const saved = (json.settings ?? optimistic) as Settings;

      setSettings({
        owner_language: saved.owner_language ?? optimistic.owner_language,
        reply_tone: normalizeTone(saved.reply_tone ?? optimistic.reply_tone),
        reply_signature:
          typeof saved.reply_signature === "string"
            ? saved.reply_signature
            : optimistic.reply_signature,
      });

      // ✅ “Saved” then route back to dashboard
      showToast({ message: "Saved settings.", type: "success" }, 900);
      window.setTimeout(() => {
        router.push("/dashboard");
      }, 750);
    } catch (e: any) {
      showToast({ message: e?.message ?? "Couldn’t save settings.", type: "error" }, 4500);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const selectedTone = useMemo(() => {
    const t = normalizeTone(settings.reply_tone);
    return TONES.find((x) => x.value === t) ?? TONES[0];
  }, [settings.reply_tone]);

  if (loading) {
    return (
      <>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 10 }}>Settings</h1>
        <p style={{ opacity: 0.75, marginTop: 0 }}>Loading…</p>
        {toast && (
          <div style={toastStyle(toast.type)} aria-live="polite">
            {toast.message}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Settings</h1>
          <p style={{ opacity: 0.78, marginTop: 0, maxWidth: 720, lineHeight: 1.5 }}>
            Set your default language and tone. We’ll draft replies for you to edit — nothing is ever
            posted automatically.
          </p>

          {organizationId && (
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 8, fontFamily: "monospace" }}>
              Org ID: {organizationId}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
          <button onClick={save} disabled={saving} style={buttonStyle}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={load} disabled={saving} style={buttonStyle}>
            Reload
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Owner language</div>
          <div style={{ opacity: 0.78, fontSize: 13, lineHeight: 1.45, marginBottom: 10 }}>
            Draft replies in this language by default.
          </div>

          <select
            value={settings.owner_language}
            onChange={(e) => setSettings((s) => ({ ...s, owner_language: e.target.value }))}
            style={selectStyle}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div style={cardStyle}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Reply tone</div>
          <div style={{ opacity: 0.78, fontSize: 13, lineHeight: 1.45, marginBottom: 10 }}>
            Choose a default tone. You can still edit every reply.
          </div>

          <select
            value={normalizeTone(settings.reply_tone)}
            onChange={(e) => setSettings((s) => ({ ...s, reply_tone: e.target.value }))}
            style={selectStyle}
          >
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>{selectedTone.help}</div>
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.62, lineHeight: 1.35 }}>
            Example: <span style={{ fontStyle: "italic" }}>{selectedTone.example}</span>
          </div>
        </div>

        {/* ✅ NEW: Voice Samples (clean + future-proof) */}
        <VoiceSamplesCard />

        <div style={cardStyle}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Signature (optional)</div>
          <div style={{ opacity: 0.78, fontSize: 13, lineHeight: 1.45, marginBottom: 10 }}>
            If you want, we’ll add a short sign-off (ex: “— Kyle” or “— The Team”).
          </div>

          <input
            value={settings.reply_signature ?? ""}
            onChange={(e) => setSettings((s) => ({ ...s, reply_signature: e.target.value }))}
            placeholder="— Your name"
            style={inputStyle}
          />
        </div>
      </div>

      {toast && (
        <div style={toastStyle(toast.type)} aria-live="polite">
          {toast.message}
        </div>
      )}
    </>
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

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 14,
  padding: 14,
  background: "#0f172a",
  color: "#e2e8f0",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  padding: "10px 10px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#0f172a",
  color: "#e2e8f0",
  outline: "none",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 520,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#0f172a",
  color: "#e2e8f0",
  outline: "none",
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
