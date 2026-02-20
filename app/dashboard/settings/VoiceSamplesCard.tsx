"use client";

import React, { useEffect, useMemo, useState } from "react";

type VoiceSample = {
  id: string;
  sample_text: string;
  created_at?: string;
  updated_at?: string;
};

type ApiResp =
  | { ok: true; samples: VoiceSample[] }
  | { ok: false; error: string };

type ApiSingleResp =
  | { ok: true; sample: VoiceSample }
  | { ok: false; error: string };

const MIN_CHARS = 40;
const MAX_CHARS = 1200;

// Keep these “human” guidance phrases out of voice samples (helps later A4 scoring too)
const SAMPLE_BAD_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: "Too corporate/templated", re: /\bwe (?:strive|aim|endeavor)\b/i },
  { label: "Too corporate/templated", re: /\bwe take (?:your )?feedback seriously\b/i },
  { label: "Too corporate/templated", re: /\bthank you for (?:your )?feedback\b/i },
  { label: "Too corporate/templated", re: /\bwe regret\b/i },
  { label: "AI-y/robotic", re: /\bas an ai\b/i },
  { label: "Sales/marketing", re: /\b(check out|visit our|follow us|book now|special offer)\b/i },
  { label: "Emojis", re: /[\u{1F300}-\u{1FAFF}]/u },
];

function clampText(raw: string) {
  const t = (raw ?? "").replace(/\r\n/g, "\n"); // normalize newlines
  if (t.length <= MAX_CHARS) return t;
  return t.slice(0, MAX_CHARS);
}

function validateSampleText(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, msg: "" };
  if (trimmed.length < MIN_CHARS) {
    return { ok: false, msg: `Too short — aim for at least ${MIN_CHARS} characters.` };
  }
  if (trimmed.length > MAX_CHARS) {
    return { ok: false, msg: `Too long — keep it under ${MAX_CHARS} characters.` };
  }
  return { ok: true, msg: "" };
}

function analyzeSample(text: string) {
  const issues: string[] = [];
  for (const p of SAMPLE_BAD_PATTERNS) {
    if (p.re.test(text)) issues.push(p.label);
  }
  // de-dupe labels
  return Array.from(new Set(issues));
}

export default function VoiceSamplesCard() {
  const [loading, setLoading] = useState(true);

  const [samples, setSamples] = useState<VoiceSample[]>([]);
  const [newSample, setNewSample] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Create state
  const [creating, setCreating] = useState(false);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  // Delete confirm state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const trimmedNew = useMemo(() => newSample.trim(), [newSample]);
  const newCharCount = useMemo(() => newSample.length, [newSample]);
  const newValidation = useMemo(() => validateSampleText(newSample), [newSample]);
  const newIssues = useMemo(() => (trimmedNew ? analyzeSample(trimmedNew) : []), [trimmedNew]);

  const editTrimmed = useMemo(() => editText.trim(), [editText]);
  const editCharCount = useMemo(() => editText.length, [editText]);
  const editValidation = useMemo(() => validateSampleText(editText), [editText]);
  const editIssues = useMemo(() => (editTrimmed ? analyzeSample(editTrimmed) : []), [editTrimmed]);

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
    const text = trimmedNew;
    if (!text || creating) return;

    const v = validateSampleText(text);
    if (!v.ok) return;

    setCreating(true);
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
      setCreating(false);
    }
  }

  function beginEdit(s: VoiceSample) {
    setError(null);
    setConfirmDeleteId(null);
    setEditingId(s.id);
    setEditText(s.sample_text ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
    setSavingId(null);
  }

  async function saveEdit(id: string) {
    if (!id || savingId) return;

    const text = editTrimmed;
    const v = validateSampleText(text);
    if (!v.ok) return;

    setSavingId(id);
    setError(null);

    // optimistic UI
    const prev = samples;
    setSamples((xs) => xs.map((x) => (x.id === id ? { ...x, sample_text: text } : x)));

    try {
      // preferred REST endpoint
      const res = await fetch(`/api/org/voice-samples/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sample_text: text }),
      });

      const json = (await res.json()) as ApiSingleResp;

      if (!res.ok || !json.ok) {
        setSamples(prev);
        setError((json as any)?.error ?? "Couldn’t update sample.");
        return;
      }

      // keep server-truth (updated_at, any normalization)
      setSamples((xs) => xs.map((x) => (x.id === id ? json.sample : x)));
      cancelEdit();
    } catch (e: any) {
      setSamples(prev);
      setError(e?.message ?? "Couldn’t update sample.");
    } finally {
      setSavingId(null);
    }
  }

  function askDelete(id: string) {
    setError(null);
    // if currently editing this one, exit edit mode to avoid confusion
    if (editingId === id) cancelEdit();
    setConfirmDeleteId(id);
  }

  function cancelDelete() {
    setConfirmDeleteId(null);
    setDeletingId(null);
  }

  async function confirmDelete(id: string) {
    if (!id || deletingId) return;
    setDeletingId(id);
    setError(null);

    // optimistic UI
    const prev = samples;
    setSamples((xs) => xs.filter((x) => x.id !== id));

    try {
      const res = await fetch(`/api/org/voice-samples/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (!res.ok || !json?.ok) {
        setSamples(prev);
        setError(json?.error ?? "Couldn’t delete sample.");
        return;
      }

      cancelDelete();
    } catch (e: any) {
      setSamples(prev);
      setError(e?.message ?? "Couldn’t delete sample.");
    } finally {
      setDeletingId(null);
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
        {/* Create new */}
        <textarea
          value={newSample}
          onChange={(e) => setNewSample(clampText(e.target.value))}
          placeholder={`Example:\n“Thanks for coming in — really appreciate you taking the time to leave a note. Hope to see you again soon.”`}
          style={textareaStyle}
          disabled={creating}
        />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {newCharCount}/{MAX_CHARS} characters{" "}
            {trimmedNew && trimmedNew.length < MIN_CHARS ? (
              <span style={{ color: "#fbbf24", marginLeft: 8 }}>(min {MIN_CHARS})</span>
            ) : null}
          </div>

          <div style={{ fontSize: 12, opacity: 0.65 }}>
            Tip: include a detail + a simple close (no marketing).
          </div>
        </div>

        {newValidation.msg ? (
          <div style={{ fontSize: 13, color: "#fbbf24" }}>{newValidation.msg}</div>
        ) : null}

        {!newValidation.msg && newIssues.length > 0 ? (
          <div style={{ fontSize: 13, color: "#fbbf24" }}>
            Quick tweak: consider removing <span style={{ fontWeight: 700 }}>{newIssues.join(", ")}</span>.
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={addSample}
            disabled={creating || !newValidation.ok}
            style={{
              ...buttonStyle,
              opacity: creating || !newValidation.ok ? 0.6 : 1,
            }}
          >
            {creating ? "Adding…" : "Add sample"}
          </button>

          <button onClick={loadSamples} disabled={creating || !!savingId || !!deletingId} style={ghostButtonStyle}>
            Refresh
          </button>
        </div>

        {error && <div style={{ fontSize: 13, color: "#f87171", marginTop: 2 }}>{error}</div>}

        {/* List */}
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
            <div style={{ fontSize: 13, opacity: 0.7 }}>No samples yet. Add one above.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {samples.map((s) => {
                const isEditing = editingId === s.id;
                const isSavingThis = savingId === s.id;
                const isConfirmDelete = confirmDeleteId === s.id;
                const isDeletingThis = deletingId === s.id;

                return (
                  <div
                    key={s.id}
                    style={{
                      border: "1px solid rgba(148,163,184,0.20)",
                      borderRadius: 12,
                      padding: 12,
                      background: "rgba(2,6,23,0.25)",
                    }}
                  >
                    {!isEditing ? (
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
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(clampText(e.target.value))}
                          style={{ ...textareaStyle, minHeight: 120 }}
                          disabled={isSavingThis || isDeletingThis}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ fontSize: 12, opacity: 0.7 }}>
                            {editCharCount}/{MAX_CHARS} characters
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.65 }}>
                            Keep it real: 1–3 sentences, detail, simple close.
                          </div>
                        </div>

                        {editValidation.msg ? (
                          <div style={{ fontSize: 13, color: "#fbbf24" }}>{editValidation.msg}</div>
                        ) : editIssues.length > 0 ? (
                          <div style={{ fontSize: 13, color: "#fbbf24" }}>
                            Quick tweak: consider removing{" "}
                            <span style={{ fontWeight: 700 }}>{editIssues.join(", ")}</span>.
                          </div>
                        ) : null}

                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          <button
                            onClick={() => saveEdit(s.id)}
                            disabled={isSavingThis || !editValidation.ok}
                            style={{
                              ...buttonStyle,
                              opacity: isSavingThis || !editValidation.ok ? 0.6 : 1,
                            }}
                          >
                            {isSavingThis ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={cancelEdit}
                            disabled={isSavingThis}
                            style={ghostButtonStyle}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

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
                        {s.updated_at
                          ? `Updated ${new Date(s.updated_at).toLocaleString()}`
                          : s.created_at
                          ? `Created ${new Date(s.created_at).toLocaleString()}`
                          : ""}
                      </div>

                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {!isEditing ? (
                          <button
                            onClick={() => beginEdit(s)}
                            disabled={!!savingId || !!deletingId || creating}
                            style={{
                              ...ghostButtonStyle,
                              padding: "8px 10px",
                              borderRadius: 10,
                              fontSize: 12,
                              opacity: !!savingId || !!deletingId || creating ? 0.6 : 1,
                            }}
                            title="Edit this sample"
                          >
                            Edit
                          </button>
                        ) : null}

                        {!isConfirmDelete ? (
                          <button
                            onClick={() => askDelete(s.id)}
                            disabled={!!savingId || !!deletingId || creating}
                            style={{
                              ...ghostButtonStyle,
                              padding: "8px 10px",
                              borderRadius: 10,
                              fontSize: 12,
                              opacity: !!savingId || !!deletingId || creating ? 0.6 : 1,
                            }}
                            title="Delete this sample"
                          >
                            Delete
                          </button>
                        ) : (
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <div style={{ fontSize: 12, opacity: 0.8 }}>Delete?</div>
                            <button
                              onClick={() => confirmDelete(s.id)}
                              disabled={isDeletingThis}
                              style={{
                                ...buttonStyle,
                                padding: "8px 10px",
                                borderRadius: 10,
                                fontSize: 12,
                                opacity: isDeletingThis ? 0.6 : 1,
                              }}
                            >
                              {isDeletingThis ? "Deleting…" : "Yes"}
                            </button>
                            <button
                              onClick={cancelDelete}
                              disabled={isDeletingThis}
                              style={{
                                ...ghostButtonStyle,
                                padding: "8px 10px",
                                borderRadius: 10,
                                fontSize: 12,
                                opacity: isDeletingThis ? 0.6 : 1,
                              }}
                            >
                              No
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.6, lineHeight: 1.45 }}>
            <div style={{ fontWeight: 700, opacity: 0.9, marginBottom: 6 }}>What makes a good sample?</div>
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
