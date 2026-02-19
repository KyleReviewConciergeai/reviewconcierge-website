"use client";

import React, { useEffect, useState } from "react";

type VoiceSample = {
  id: string;
  sample_text: string;
  created_at?: string;
};

type ApiResp =
  | { ok: true; samples: VoiceSample[] }
  | { ok: false; error: string };

export default function VoiceSamplesCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [samples, setSamples] = useState<VoiceSample[]>([]);
  const [newSample, setNewSample] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadSamples() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/org/voice-samples", { cache: "no-store" });
      const json = (await res.json()) as ApiResp;

      if (!res.ok || !json.ok) {
        setError(
          (json as any)?.error ??
            "Couldn’t load voice samples yet. (API not wired up.)"
        );
        setSamples([]);
        return;
      }

      setSamples(json.samples ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Couldn’t load voice samples yet. (API not wired up.)");
      setSamples([]);
    } finally {
      setLoading(false);
    }
  }

  async function addSample() {
    const text = newSample.trim();
    if (!text || saving) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/org/voice-samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample_text: text }),
      });

      const json = await res.json();

      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "Couldn’t add sample yet. (API not wired up.)");
        return;
      }

      setNewSample("");
      await loadSamples();
    } catch (e: any) {
      setError(e?.message ?? "Couldn’t add sample yet. (API not wired up.)");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSample(id: string) {
    if (!id) return;
    setError(null);

    // optimistic UI
    const prev = samples;
    setSamples((s) => s.filter((x) => x.id !== id));

    try {
      const res = await fetch(`/api/org/voice-samples?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setSamples(prev);
        setError(json?.error ?? "Couldn’t delete sample yet. (API not wired up.)");
      }
    } catch (e: any) {
      setSamples(prev);
      setError(e?.message ?? "Couldn’t delete sample yet. (API not wired up.)");
    }
  }

  useEffect(() => {
    loadSamples();
  }, []);

  return (
    <div style={cardStyle}>
      <div style={{ fontWeight: 800, marginBottom: 6 }}>Voice samples</div>
      <div style={{ opacity: 0.78, fontSize: 13, lineHeight: 1.45, marginBottom: 12 }}>
        Add a few examples of how you reply. We’ll use these to match your writing style.
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <textarea
          value={newSample}
          onChange={(e) => setNewSample(e.target.value)}
          placeholder="Example: “Thanks for coming in — really appreciate you taking the time to leave a note.”"
          style={textareaStyle}
        />

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={addSample}
            disabled={saving || !newSample.trim()}
            style={{
              ...buttonStyle,
              opacity: saving || !newSample.trim() ? 0.65 : 1,
            }}
          >
            {saving ? "Adding…" : "Add sample"}
          </button>

          <button onClick={loadSamples} disabled={saving} style={ghostButtonStyle}>
            Refresh
          </button>

          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Tip: 3–7 samples is plenty.
          </div>
        </div>

        {error && (
          <div style={{ fontSize: 13, color: "#f87171", marginTop: 4 }}>{error}</div>
        )}

        <div
          style={{
            borderTop: "1px solid rgba(148,163,184,0.18)",
            paddingTop: 10,
            marginTop: 4,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>
            Your saved samples
          </div>

          {loading ? (
            <div style={{ fontSize: 13, opacity: 0.75 }}>Loading…</div>
          ) : samples.length === 0 ? (
            <div style={{ fontSize: 13, opacity: 0.7 }}>
              No samples yet. Add one above.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {samples.map((s) => (
                <div
                  key={s.id}
                  style={{
                    border: "1px solid rgba(148,163,184,0.20)",
                    borderRadius: 12,
                    padding: 12,
                    background: "rgba(2,6,23,0.25)",
                  }}
                >
                  <div style={{ fontSize: 13, lineHeight: 1.5, opacity: 0.95, whiteSpace: "pre-wrap" }}>
                    {s.sample_text}
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 11, opacity: 0.55 }}>
                      {s.created_at ? new Date(s.created_at).toLocaleString() : ""}
                    </div>

                    <button
                      onClick={() => deleteSample(s.id)}
                      style={{
                        ...ghostButtonStyle,
                        padding: "8px 10px",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                      title="Delete this sample"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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

const ghostButtonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.35)",
  cursor: "pointer",
  color: "rgba(226,232,240,0.92)",
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 14,
  padding: 14,
  background: "#0f172a",
  color: "#e2e8f0",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 88,
  resize: "vertical",
  borderRadius: 12,
  padding: "10px 12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.65)",
  color: "#e2e8f0",
  outline: "none",
  lineHeight: 1.45,
  fontSize: 13,
};
