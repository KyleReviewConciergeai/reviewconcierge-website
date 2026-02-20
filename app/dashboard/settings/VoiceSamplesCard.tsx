"use client";

import React, { useEffect, useMemo, useState } from "react";

type VoiceSample = {
  id: string;
  sample_text: string;
  created_at?: string;
};

type ApiResp =
  | { ok: true; samples: VoiceSample[] }
  | { ok: false; error: string };

const MIN_CHARS = 40;
const MAX_CHARS = 1200;

function clampText(raw: string) {
  const t = (raw ?? "").replace(/\r\n/g, "\n"); // normalize newlines
  if (t.length <= MAX_CHARS) return t;
  return t.slice(0, MAX_CHARS);
}

export default function VoiceSamplesCard() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [samples, setSamples] = useState<VoiceSample[]>([]);
  const [newSample, setNewSample] = useState("");
  const [error, setError] = useState<string | null>(null);

  const trimmed = useMemo(() => newSample.trim(), [newSample]);
  const charCount = useMemo(() => newSample.length, [newSample]);

  const validation = useMemo(() => {
    if (!trimmed) return { ok: false, msg: "" };
    if (trimmed.length < MIN_CHARS)
      return { ok: false, msg: `Too short — aim for at least ${MIN_CHARS} characters.` };
    if (trimmed.length > MAX_CHARS)
      return { ok: false, msg: `Too long — keep it under ${MAX_CHARS} characters.` };
    return { ok: true, msg: "" };
  }, [trimmed]);

  async function loadSamples() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/org/voice-samples", { cache: "no-store" });
      const json = (await res.json()) as ApiResp;

      if (!res.ok || !json.ok) {
        setError((json as any)?.error ?? "Couldn’t load voice samples.");
        setSamples([]);
        return;
      }

      setSamples(json.samples ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Couldn’t load voice samples.");
      setSamples([]);
    } finally {
      setLoading(false);
    }
  }

  async function addSample() {
    const text = trimmed;
    if (!text || saving) return;
    if (text.length < MIN_CHARS || text.length > MAX_CHARS) return;

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
        setError(json?.error ?? "Couldn’t add sample.");
        return;
      }

      setNewSample("");
      await loadSamples();
    } catch (e: any) {
      setError(e?.message ?? "Couldn’t add sample.");
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
        setError(json?.error ?? "Couldn’t delete sample.");
      }
    } catch (e: any) {
      setSamples(prev);
      setError(e?.message ?? "Couldn’t delete sample.");
    }
  }

  useEffect(() => {
    loadSamples();
  }, []);

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Voice samples</div>
          <div style={{ opacity: 0.78, fontSize: 13, lineHeight: 1.45, marginBottom: 8 }}>
            Add a few examples of how you reply. We’ll use these to match your writing style.
          </div>
          <div style={{ fontSize: 12, opacity: 0.62, lineHeight: 1.4 }}>
            Don’t paste private info (phone numbers, emails, addresses). Keep it like a real Google
            reply.
          </div>
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, alignSelf: "flex-start" }}>
          Recommended: <span style={{ fontWeight: 700 }}>3–7</span> samples
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <textarea
          value={newSample}
          onChange={(e) => setNewSample(clampText(e.target.value))}
          placeholder={`Example:\n“Thanks for coming in — really appreciate you taking the time to leave a note. Hope to see you again soon.”`}
          style={textareaStyle}
        />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {charCount}/{MAX_CHARS} characters{" "}
            {trimmed && trimmed.length < MIN_CHARS ? (
              <span style={{ color: "#fbbf24", marginLeft: 8 }}>
                (min {MIN_CHARS})
              </span>
            ) : null}
          </div>

          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Tip: include a detail + a simple close (no marketing).
          </div>
        </div>

        {validation.msg ? (
          <div style={{ fontSize: 13, color: "#fbbf24" }}>{validation.msg}</div>
        ) : null}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={addSample}
            disabled={saving || !validation.ok}
            style={{
              ...buttonStyle,
              opacity: saving || !validation.ok ? 0.6 : 1,
            }}
          >
            {saving ? "Adding…" : "Add sample"}
          </button>

          <button onClick={loadSamples} disabled={saving} style={ghostButtonStyle}>
            Refresh
          </button>
        </div>

        {error && <div style={{ fontSize: 13, color: "#f87171", marginTop: 2 }}>{error}</div>}

        <div
          style={{
            borderTop: "1px solid rgba(148,163,184,0.18)",
            paddingTop: 12,
            marginTop: 6,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.78, marginBottom: 10 }}>Your saved samples</div>

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
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.55,
                      opacity: 0.95,
                      whiteSpace: "pre-wrap",
                    }}
                  >
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

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.6, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 700, opacity: 0.9, marginBottom: 6 }}>
              What makes a good sample?
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li>1–3 sentences</li>
              <li>References one detail (dish, staff moment, vibe, timing)</li>
              <li>Sounds like you — not corporate</li>
              <li>No emojis, no long apologies, no marketing copy</li>
            </ul>
          </div>
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
  minHeight: 110,
  resize: "vertical",
  borderRadius: 12,
  padding: "10px 12px",
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.65)",
  color: "#e2e8f0",
  outline: "none",
  lineHeight: 1.5,
  fontSize: 13,
};
