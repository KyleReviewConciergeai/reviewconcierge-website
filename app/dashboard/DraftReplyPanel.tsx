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

/** Small hook for responsive inline styles (safe in React/Next) */
function useIsNarrow(maxWidthPx = 720) {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);

    const apply = () => setIsNarrow(mq.matches);
    apply();

    // Support older Safari
    if (mq.addEventListener) mq.addEventListener("change", apply);
    else mq.addListener(apply);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener(apply);
    };
  }, [maxWidthPx]);

  return isNarrow;
}

export default function DraftReplyPanel({ businessName }: DraftReplyPanelProps) {
  const [businessNameState, setBusinessNameState] = useState<string>(businessName?.trim() ?? "");
  const [rating, setRating] = useState<number>(5);

  /**
   * Doctrine note:
   * - The UI language selector should represent the reviewer’s language
   *   (i.e., the reply will be drafted in that language).
   * - Owner “mirror translation” is an optional add-on later; not included here.
   */
  const [replyLanguage, setReplyLanguage] = useState<string>("es");

  // Keep empty by default (faster paste UX)
  const [reviewText, setReviewText] = useState("");

  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  // Version count is okay if framed as "another option" (not automation)
  const [version, setVersion] = useState<number>(0);

  const isNarrow = useIsNarrow(720);

  // Copy locked to doctrine (avoid SaaS-y / automation language)
  const COPY = {
    title: "Draft a reply in your voice",
    subtitle:
      "Paste a guest review. We’ll suggest a short reply that sounds like you. You can edit it before you post anywhere.",
    businessLabel: "Business name",
    ratingLabel: "Rating",
    replyLanguageLabel: "Reply language",
    reviewLabel: "Guest review",
    reviewHelp: "Paste the review text exactly as the guest wrote it.",
    reviewCountHint: "10+",
    draftLabel: "Suggested reply",
    draftPlaceholder: "A suggested reply will appear here…",
    draftHelp:
      "This is a starting point. Edit it freely so it feels like you.",
    btnDraft: "Draft a reply",
    btnDraftLoading: "Drafting…",
    btnAnother: "Draft another option",
    btnAnotherLoading: "Drafting…",
    btnCopy: "Copy reply",
    btnCopied: "Copied",
    statusDrafting: "Drafting…",
    statusReady: "Suggested",
    statusError: "Couldn’t draft",
    errorDefault: "Couldn’t draft a reply right now. Please try again.",
    tip:
      "Tip: Copy the reply, then paste it into Google Reviews to post. Nothing is posted automatically.",
  };

  useEffect(() => {
    const next = (businessName ?? "").trim();
    if (next && next !== businessNameState) setBusinessNameState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessName]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (copiedTimer.current) {
        window.clearTimeout(copiedTimer.current);
        copiedTimer.current = null;
      }
    };
  }, []);

  const canSubmit = useMemo(() => {
    return businessNameState.trim().length > 0 && reviewText.trim().length > 10;
  }, [businessNameState, reviewText]);

  async function requestDraft() {
    setStatus("loading");
    setErrorMessage("");

    try {
      const res = await fetch("/api/reviews/draft-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: businessNameState.trim(),
          rating,
          language: replyLanguage,
          review_text: reviewText.trim(),
        }),
      });

      const data = (await res.json().catch(() => ({}))) as Partial<DraftReplyResponse>;

      if (!res.ok || data.ok === false) {
        const msg =
          typeof data.error === "string" && data.error.trim()
            ? data.error
            : COPY.errorDefault;

        // Clear draft on error so we don't show stale content
        setDraft("");
        setStatus("error");
        setErrorMessage(msg);
        return { ok: false as const };
      }

      if (typeof data.reply !== "string" || !data.reply.trim()) {
        setDraft("");
        setStatus("error");
        setErrorMessage("No reply was returned.");
        return { ok: false as const };
      }

      setDraft(data.reply);
      setStatus("success");
      return { ok: true as const };
    } catch (err: unknown) {
      setDraft("");
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : COPY.errorDefault);
      return { ok: false as const };
    }
  }

  async function onDraft() {
    // New drafting attempt resets version and clears prior suggestion
    setDraft("");
    setVersion(0);
    const result = await requestDraft();
    if (result.ok) setVersion(1);
  }

  async function onDraftAnother() {
    const result = await requestDraft();
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

  // Status pill that reinforces "suggestion" + "you’re in control"
  const statusPill = useMemo(() => {
    if (status === "loading") return { label: COPY.statusDrafting, tone: "neutral" as const };
    if (status === "error") return { label: COPY.statusError, tone: "error" as const };
    if (status === "success" && hasDraft) return { label: COPY.statusReady, tone: "success" as const };
    return null;
  }, [status, hasDraft, COPY.statusDrafting, COPY.statusError, COPY.statusReady]);

  const controlsGridStyle: React.CSSProperties = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: isNarrow ? "1fr" : "1fr 140px 160px",
      gap: 10,
      marginTop: 12,
    }),
    [isNarrow]
  );

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
            <h2 style={{ margin: 0, fontSize: 18 }}>{COPY.title}</h2>

            {/* REMOVE "READ-ONLY" (doctrine violation: implies locked system ownership) */}
            {version > 0 ? (
              <span style={versionBadgeStyle} title="Another option counter">
                Option {version}
              </span>
            ) : null}
          </div>

          <p style={{ marginTop: 8, marginBottom: 0, color: "rgba(226,232,240,0.78)", lineHeight: 1.45 }}>
            {COPY.subtitle}
          </p>
        </div>

        {statusPill ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={statusPillStyle(statusPill.tone)}>{statusPill.label}</span>
          </div>
        ) : null}
      </div>

      {/* Controls */}
      <div style={controlsGridStyle}>
        <div style={{ display: "grid", gap: 6 }}>
          <div style={labelStyle}>{COPY.businessLabel}</div>
          <input
            value={businessNameState}
            onChange={(e) => setBusinessNameState(e.target.value)}
            placeholder="e.g. Your business name"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={labelStyle}>{COPY.ratingLabel}</div>
          <select value={String(rating)} onChange={(e) => setRating(Number(e.target.value))} style={selectStyle}>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {r}★
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={labelStyle}>{COPY.replyLanguageLabel}</div>
          <select value={replyLanguage} onChange={(e) => setReplyLanguage(e.target.value)} style={selectStyle}>
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
          <div style={labelStyle}>{COPY.reviewLabel}</div>
          <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
            {reviewText.trim().length}/{COPY.reviewCountHint}
          </div>
        </div>

        <div style={{ marginTop: 6, fontSize: 12, color: "rgba(226,232,240,0.62)", lineHeight: 1.35 }}>
          {COPY.reviewHelp}
        </div>

        <textarea
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Paste the review text here…"
          rows={5}
          style={{ ...textareaStyle, marginTop: 8 }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        {!hasDraft ? (
          <button
            onClick={onDraft}
            disabled={!canSubmit || isLoading}
            style={primaryButtonStyle(!canSubmit || isLoading)}
            title="Create a suggested reply you can edit"
          >
            {isLoading ? COPY.btnDraftLoading : COPY.btnDraft}
          </button>
        ) : (
          <>
            <button
              onClick={onDraftAnother}
              disabled={!canSubmit || isLoading}
              style={primaryButtonStyle(!canSubmit || isLoading)}
              title="Create another suggested option"
            >
              {isLoading ? COPY.btnAnotherLoading : COPY.btnAnother}
            </button>

            <button onClick={onCopy} disabled={!canCopy} style={secondaryButtonStyle(!canCopy)}>
              {copied ? COPY.btnCopied : COPY.btnCopy}
            </button>
          </>
        )}

        {status === "error" ? <span style={{ color: "#fecaca", fontSize: 13 }}>{errorMessage}</span> : null}

        {isLoading && hasDraft ? (
          <span style={{ color: "rgba(226,232,240,0.65)", fontSize: 13 }}>
            Drafting another option…
          </span>
        ) : null}
      </div>

      {/* Draft output */}
      <div style={{ marginTop: 14, position: "relative" }}>
        <div style={labelStyle}>{COPY.draftLabel}</div>

        {/* Doctrine: draft should feel editable / owned by human.
            We keep the default textarea editable (NOT readOnly). */}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={COPY.draftPlaceholder}
          rows={7}
          style={{
            ...textareaStyle,
            marginTop: 6,
            opacity: hasDraft ? 1 : 0.9,
            filter: isLoading && hasDraft ? "blur(0.2px)" : undefined,
          }}
        />

        {hasDraft ? (
          <div style={{ marginTop: 8, fontSize: 12, color: "rgba(226,232,240,0.62)", lineHeight: 1.35 }}>
            {COPY.draftHelp}
          </div>
        ) : null}

        {isLoading && hasDraft ? (
          <div
            aria-label="Drafting overlay"
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
              Drafting…
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 10, fontSize: 12, color: "rgba(226,232,240,0.6)", lineHeight: 1.45 }}>
        {COPY.tip}
      </div>
    </section>
  );
}

/** ---------- Styles (dark/premium) ---------- */

const panelStyle: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 16,
  padding: 16,
  background: "#0f172a",
  color: "#e2e8f0",
  width: "100%",
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  color: "rgba(226,232,240,0.72)",
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
    fontWeight: 800,
    minWidth: 180,
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
    fontWeight: 800,
    minWidth: 130,
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
