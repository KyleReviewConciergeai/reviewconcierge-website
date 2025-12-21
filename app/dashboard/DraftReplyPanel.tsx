"use client";

import React, { useMemo, useRef, useState } from "react";

type DraftReplyResponse = {
  ok: boolean;
  reply?: string;
  error?: string;
};

type Status = "idle" | "loading" | "success" | "error";

export default function DraftReplyPanel() {
  const [businessName, setBusinessName] = useState("Andeluna");
  const [rating, setRating] = useState<number>(5);
  const [language, setLanguage] = useState<string>("es");
  const [reviewText, setReviewText] = useState(
    "Amazing tasting experience and the staff was super friendly. Beautiful views!"
  );

  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  // ✅ NEW: version counter for demo confidence (v1, v2, v3...)
  const [version, setVersion] = useState<number>(0);

  const canSubmit = useMemo(() => {
    return businessName.trim().length > 0 && reviewText.trim().length > 10;
  }, [businessName, reviewText]);

  async function generateDraft() {
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/reviews/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessName.trim(),
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
    // First generation: clear draft so user knows it’s “fresh”
    setDraft("");
    setVersion(0); // reset counter
    const result = await generateDraft();
    if (result.ok) setVersion(1); // v1 after first successful generation
  }

  async function onRegenerate() {
    // Regenerate: KEEP existing draft visible while loading
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

  return (
    <section
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: 16,
        background: "rgba(255,255,255,0.03)",
        maxWidth: 900,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, display: "flex", gap: 10, alignItems: "center" }}>
            Draft Reply (Read-only)
            {/* ✅ NEW: subtle version pill */}
            {version > 0 ? (
              <span
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.06)",
                  opacity: 0.9,
                }}
                title="Draft version counter"
              >
                v{version}
              </span>
            ) : null}
          </h2>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Paste a review → generate a suggested reply (does not post anywhere yet).
          </p>
        </div>

        {status === "success" && hasDraft ? (
          <div style={{ opacity: 0.75, fontSize: 13, alignSelf: "center" }}>
            Draft ready ✅
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 140px 120px",
          gap: 10,
          marginTop: 12,
        }}
      >
        <input
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Business name"
          style={inputStyle}
        />

        <select
          value={String(rating)}
          onChange={(e) => setRating(Number(e.target.value))}
          style={inputStyle}
        >
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r}★
            </option>
          ))}
        </select>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          style={inputStyle}
        >
          <option value="en">EN</option>
          <option value="es">ES</option>
          <option value="pt">PT</option>
          <option value="fr">FR</option>
          <option value="it">IT</option>
          <option value="de">DE</option>
        </select>
      </div>

      <div style={{ marginTop: 10 }}>
        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Paste the review text here..."
          rows={5}
          style={{
            ...inputStyle,
            width: "100%",
            resize: "vertical",
            lineHeight: 1.4,
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 10, alignItems: "center" }}>
        {!hasDraft ? (
          <button
            onClick={onGenerate}
            disabled={!canSubmit || isLoading}
            style={primaryButtonStyle(!canSubmit || isLoading)}
          >
            {isLoading ? "Generating..." : "Generate draft"}
          </button>
        ) : (
          <>
            <button
              onClick={onRegenerate}
              disabled={!canSubmit || isLoading}
              style={primaryButtonStyle(!canSubmit || isLoading)}
              title="Generate another version"
            >
              {isLoading ? "Regenerating..." : "Regenerate"}
            </button>

            <button
              onClick={onCopy}
              disabled={!canCopy}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                cursor: canCopy ? "pointer" : "not-allowed",
                color: "white",
                fontWeight: 600,
                minWidth: 96,
                opacity: canCopy ? 1 : 0.6,
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </>
        )}

        {status === "error" && (
          <span style={{ color: "#ffb3b3", fontSize: 14 }}>{errorMessage}</span>
        )}

        {isLoading && hasDraft ? (
          <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 13 }}>
            Generating a fresh version…
          </span>
        ) : null}
      </div>

      {/* ✅ Draft box with “locked” overlay while regenerating */}
      <div style={{ marginTop: 12, position: "relative" }}>
        <textarea
          value={draft}
          readOnly
          placeholder="Draft reply will appear here..."
          rows={7}
          style={{
            ...inputStyle,
            width: "100%",
            resize: "vertical",
            lineHeight: 1.4,
            opacity: hasDraft ? 1 : 0.8,
            // subtle visual lock when regenerating
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
              background: "rgba(0,0,0,0.22)",
              border: "1px solid rgba(255,255,255,0.08)",
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
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.06)",
                fontSize: 13,
                opacity: 0.9,
              }}
            >
              Regenerating…
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: disabled ? "rgba(255,255,255,0.06)" : "rgba(99,102,241,0.35)",
    cursor: disabled ? "not-allowed" : "pointer",
    color: "white",
    fontWeight: 600,
    minWidth: 140,
  };
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.10)",
  background: "rgba(0,0,0,0.25)",
  color: "white",
  outline: "none",
};
