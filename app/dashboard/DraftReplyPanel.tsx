"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type DraftReplyResponse = {
  ok: boolean;
  reply?: string;
  error?: string;
};

type Status = "idle" | "loading" | "success" | "error";

type DraftReplyPanelProps = {
  businessName?: string | null;
};

export default function DraftReplyPanel({ businessName }: DraftReplyPanelProps) {
  const [businessNameState, setBusinessNameState] = useState<string>((businessName ?? "").trim());

  const [rating, setRating] = useState<number>(5);
  const [language, setLanguage] = useState<string>("es");

  // Keep empty-friendly: paste/replace quickly
  const [reviewText, setReviewText] = useState<string>("");

  const [draft, setDraft] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  const [version, setVersion] = useState<number>(0);

  // Responsive: compute isMobile safely (no global style mutations)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(max-width: 720px)");
    const apply = () => setIsMobile(mq.matches);

    apply();

    // Safari compatibility: addEventListener may not exist on older versions
    if (mq.addEventListener) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } else {
      mq.addListener(apply);
      return () => mq.removeListener(apply);
    }
  }, []);

  // Keep local input synced if Dashboard loads a business name later
  useEffect(() => {
    const next = (businessName ?? "").trim();
    if (next && next !== businessNameState) setBusinessNameState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessName]);

  const canSubmit = useMemo(() => {
    return businessNameState.trim().length > 0 && reviewText.trim().length > 10;
  }, [businessNameState, reviewText]);

  async function generateDraft() {
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/reviews/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessNameState.trim(),
          rating,
          language,
          review_text: reviewText.trim(),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as Partial<DraftReplyResponse>;

      if (!res.ok || data.ok === false) {
        const msg =
          typeof data.error === "string" && data.error.trim()
            ? data.error
            : "Failed to generate draft.";
        setStatus("error");
        setErrorMessage(msg);
        return { ok: false as const };
      }

      if (typeof data.reply !== "string" || !data.reply.trim()) {
        setStatus("error");
        setErrorMessage("No draft returned from server.");
        return { ok: false as const };
      }

      setDraft(data.reply);
      setStatus("success");
      return { ok: true as const };
    } catch (err: unknown) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
      return { ok: false as const };
    }
  }

  async function onGenerate() {
    setDraft("");
    setVersion(0);
    const result = await generateDraft();
    if (result.ok) setVersion(1);
  }

  async function onRegenerate() {
    const result = await generateDraft();
    if (result.ok) setVersion((v) => (v > 0 ? v + 1 : 1));
  }

  async function onCopy() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);

      setCopied(true);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);

      copiedTimer.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimer.current = null;
      }, 1200);
    } catch {
      setStatus("error");
      setErrorMessage("Could not copy to clipboard.");
    }
  }

  const isLoading = status === "loading";
  const hasDraft = Boolean(draft.trim());
  const canCopy = hasDraft && !isLoading;

  const statusPill = useMemo(() => {
    if (status === "loading") return { label: "Generating…", tone: "neutral" as const };
    if (status === "error") return { label: "Error", tone: "error" as const };
    if (status === "success" && hasDraft) return { label: "Draft ready", tone: "success" as const };
    return null;
  }, [status, hasDraft]);

  const controlsGridStyle: React.CSSProperties = useMemo(() => {
    return {
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "1fr 140px 120px",
      gap: 10,
      marginTop: 12,
    };
  }, [isMobile]);

  return (
    <section style={panelStyle}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 240 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Draft Reply</h2>

            <span style={badgeStyle}>READ-ONLY</span>

            {version > 0 ? (
              <span style={versionBadgeStyle} title="Draft version counter">
                v{version}
              </span>
            ) : null}

            {/* Only show the status pill when there is something meaningful to show */}
            {statusPill ? <span style={statusPillStyle(statusPill.tone)}>{statusPill.label}</span> : null}
          </div>

          <p style={{ marginTop: 8, marginBottom: 0, color: "rgba(226,232,240,0.78)", lineHeight: 1.4 }}>
            Paste a review → generate a suggested reply (does not post anywhere yet).
          </p>
        </div>
      </div>

      {/* Controls */}
      <div style={controlsGridStyle}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={labelStyle}>Business name</div>
          <input
            value={businessNameState}
            onChange={(e) => setBusinessNameState(e.target.value)}
            placeholder="e.g. Andeluna Winery Lodge"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={labelStyle}>Rating</div>
          <select value={String(rating)} onChange={(e) => setRating(Number(e.target.value))} style={selectStyle}>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {r}★
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={labelStyle}>Language</div>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} style={selectStyle}>
            <option value="en">EN</option>
            <option value="es">ES</option>
            <option value="pt">PT</option>
            <option value="fr">FR</option>
            <option value="it">IT</option>
            <option value="de">DE</option>
          </select>
        </div>
      </div>

      {/* Review input */}
      <div style={{ marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <div style={labelStyle}>Review text</div>
          <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>{reviewText.trim().length}/10+</div>
        </div>

        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Paste the review text here…"
          rows={5}
          style={{ ...textareaStyle, marginTop: 6 }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        {!hasDraft ? (
          <button onClick={onGenerate} disabled={!canSubmit || isLoading} style={primaryButtonStyle(!canSubmit || isLoading)}>
            {isLoading ? "Generating…" : "Generate draft"}
          </button>
        ) : (
          <>
            <button
              onClick={onRegenerate}
              disabled={!canSubmit || isLoading}
              style={primaryButtonStyle(!canSubmit || isLoading)}
              title="Generate another version"
            >
              {isLoading ? "Regenerating…" : "Regenerate"}
            </button>

            <button onClick={onCopy} disabled={!canCopy} style={secondaryButtonStyle(!canCopy)}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </>
        )}

        {status === "error" ? <span style={{ color: "#fecaca", fontSize: 13 }}>{errorMessage}</span> : null}

        {isLoading && hasDraft ? (
          <span style={{ color: "rgba(226,232,240,0.65)", fontSize: 13 }}>Generating a fresh version…</span>
        ) : null}
      </div>

      {/* Draft output */}
      <div style={{ marginTop: 14, position: "relative" }}>
        <div style={labelStyle}>Draft reply</div>

        <textarea
          value={draft}
          readOnly
          placeholder="Draft reply will appear here…"
          rows={7}
          style={{
            ...textareaStyle,
            marginTop: 6,
            opacity: hasDraft ? 1 : 0.85,
            filter: isLoading && hasDraft ? "blur(0.2px)" : undefined,
          }}
        />

        {isLoading && hasDraft ? (
          <div
            aria-label="Regenerating draft overlay"
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 12,
              background: "rgba(2,6,23,0.40)",
              border: "1px solid rgba(148,163,184,0.20)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.28)",
                background: "rgba(15,23,42,0.75)",
                fontSize: 13,
                color: "#e2e8f0",
              }}
            >
              Regenerating…
            </div>
          </div>
        ) : null}
      </div>

      {/* Small footer note for demos */}
      <div style={{ marginTop: 10, fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
        Tip: after generating, click <strong>Copy</strong> and paste into Google Reviews.
      </div>
    </section>
  );
}

/** ---------- Styles (dark/premium, matches dashboard) ---------- */

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 16,
  padding: 16,
  background: "#0f172a",
  color: "#e2e8f0",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(226,232,240,0.72)",
};

const badgeStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.06em",
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.28)",
  background: "rgba(15,23,42,0.75)",
  color: "rgba(226,232,240,0.85)",
};

const versionBadgeStyle: React.CSSProperties = {
  fontSize: 12,
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.28)",
  background: "rgba(15,23,42,0.75)",
  color: "#e2e8f0",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.85)",
  color: "#e2e8f0",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  WebkitAppearance: "none",
  appearance: "none",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  width: "100%",
  resize: "vertical",
  lineHeight: 1.45,
  minHeight: 120,
};

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.35)",
    background: disabled ? "rgba(15,23,42,0.75)" : "rgba(99,102,241,0.50)",
    cursor: disabled ? "not-allowed" : "pointer",
    color: "#e2e8f0",
    fontWeight: 700,
    minWidth: 160,
    opacity: disabled ? 0.6 : 1,
  };
}

function secondaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(148,163,184,0.35)",
    background: "rgba(15,23,42,0.85)",
    cursor: disabled ? "not-allowed" : "pointer",
    color: "#e2e8f0",
    fontWeight: 700,
    minWidth: 110,
    opacity: disabled ? 0.6 : 1,
  };
}

function statusPillStyle(tone: "neutral" | "success" | "error"): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 12,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.28)",
    background: "rgba(15,23,42,0.75)",
    color: "#e2e8f0",
    whiteSpace: "nowrap",
  };

  if (tone === "success") {
    return {
      ...base,
      border: "1px solid rgba(34,197,94,0.35)",
      background: "rgba(34,197,94,0.12)",
    };
  }

  if (tone === "error") {
    return {
      ...base,
      border: "1px solid rgba(248,113,113,0.45)",
      background: "rgba(248,113,113,0.12)",
    };
  }

  return base;
}
