// app/dashboard/DraftReplyPanel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type DraftReplyResponse = {
  ok: boolean;
  reply?: string;
  error?: string;
  meta?: {
    owner_language?: string;
    reviewer_language?: string;
    reply_tone?: string;
    reply_signature?: string | null;
  };
};

type TranslateReplyResponse = {
  ok: boolean;
  translated?: string;
  error?: string;
};

type Status = "idle" | "loading" | "success" | "error";

type DraftReplyPanelProps = {
  businessName?: string | null;
};

/**
 * Dashboard emits: window.dispatchEvent(new CustomEvent("rc:select-review", { detail: { ... } }))
 * We support BOTH payload shapes:
 *  - Old:  { reviewText, rating, authorName, detectedLanguage, reviewId, businessId }
 *  - New:  { text, rating, authorName, language, reviewId, businessId }
 */
type RcSelectReviewDetail = {
  reviewId?: string | null;
  businessId?: string | null;

  // new shape
  text?: string | null;
  language?: string | null;

  // old shape
  reviewText?: string | null;
  detectedLanguage?: string | null;

  rating?: number | null;
  authorName?: string | null;
  createdAt?: string | null;
  source?: string | null;
};

type SelectedReview = {
  reviewId: string;
  businessId: string | null;
  text: string;
  rating: number | null;
  authorName: string | null;
  createdAt: string | null;
  language: string | null;
  source: string | null;
};

/** Small hook for responsive inline styles (safe in React/Next) */
function useIsNarrow(maxWidthPx = 720) {
  const [isNarrow, setIsNarrow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const apply = () => setIsNarrow(mq.matches);
    apply();

    if (mq.addEventListener) mq.addEventListener("change", apply);
    else mq.addListener(apply);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", apply);
      else mq.removeListener(apply);
    };
  }, [maxWidthPx]);

  return isNarrow;
}

/** Normalize language tags so ES / es / es-ES all compare the same */
function normLang(tag: string) {
  return (tag || "").trim().toLowerCase().split("-")[0];
}

/** Step 8: rating → tone */
function toneFromRating(r: number) {
  if (r >= 5) return "warm, upbeat, grateful";
  if (r === 4) return "warm, concise, appreciative";
  if (r === 3) return "balanced, appreciative, lightly apologetic";
  if (r === 2) return "apologetic, accountable, helpful";
  return "very apologetic, calm, accountable, invite offline resolution";
}

/** Step 8: anti-robot rules (sent to server; server can use or ignore) */
const DRAFT_RULES = [
  "Keep it 2–4 sentences.",
  "Sound like a real owner, not a brand.",
  "Avoid corporate phrases like: 'we’re thrilled', 'we appreciate your feedback', 'valued guest'.",
  "If possible, reference one specific detail from the review (food, staff, vibe, timing).",
  "No emojis.",
  "Use at most one exclamation mark, and only for 5★ reviews.",
  "If rating is 1–2★: apologize, take accountability, and invite them to continue the conversation offline.",
  "Do not promise refunds, policy changes, or future guarantees.",
];

// --- tiny fetch helper: logs status + raw text if JSON parse fails ---
async function fetchJson<T = any>(input: RequestInfo, init?: RequestInit): Promise<{
  ok: boolean;
  status: number;
  json: T | null;
  rawText: string;
}> {
  const res = await fetch(input, init);
  const status = res.status;
  const rawText = await res.text().catch(() => "");
  let json: T | null = null;

  try {
    json = rawText ? (JSON.parse(rawText) as T) : null;
  } catch {
    // non-JSON response (404 HTML etc)
    json = null;
  }

  if (!res.ok) {
    console.warn("[fetchJson] request failed", {
      url: typeof input === "string" ? input : "Request",
      status,
      rawPreview: rawText.slice(0, 300),
      json,
    });
  }

  return { ok: res.ok, status, json, rawText };
}

export default function DraftReplyPanel({ businessName }: DraftReplyPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const reviewTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const [selectedReview, setSelectedReview] = useState<SelectedReview | null>(null);

  const [businessNameState, setBusinessNameState] = useState<string>(businessName?.trim() ?? "");
  const [rating, setRating] = useState<number>(5);

  /** ✅ This dropdown represents the REVIEWER language (copy-ready output). */
  const [replyLanguage, setReplyLanguage] = useState<string>("en");

  const [reviewText, setReviewText] = useState("");

  // Owner-language draft (editable)
  const [draft, setDraft] = useState("");

  // Copy-ready reply (reviewer language)
  const [finalReply, setFinalReply] = useState("");

  const [ownerLanguage, setOwnerLanguage] = useState<string>("en");

  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<number | null>(null);

  const [version, setVersion] = useState<number>(0);

  // Track DB record created on draft (so copy can PATCH it)
  const [replyRecordId, setReplyRecordId] = useState<string | null>(null);

  const isNarrow = useIsNarrow(720);

  const COPY = {
    title: "Draft a reply in your voice",
    subtitle:
      "Paste the guest's review here. We'll draft a short reply in your style—you can tweak it before you post it anywhere.",
    businessLabel: "Business name",
    ratingLabel: "Review rating",
    replyLanguageLabel: "Reviewer language (copy-ready)",
    reviewLabel: "Guest review",
    reviewHelp: "Paste the review text exactly as the guest wrote it.",
    reviewCountHint: "10+",
    draftLabel: "Owner draft (editable)",
    draftPlaceholder: "A suggested reply will appear here…",
    draftHelp: "This is a starting point. Edit it freely so it feels like you.",
    finalLabel: "Copy-ready reply",
    finalPlaceholder: "Copy-ready reply will appear here…",
    finalHelp: "This is what you’ll paste into Google Reviews. It matches the reviewer’s language.",
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
    tip: "Tip: Copy the reply, then paste it into Google Reviews to post. Nothing is posted automatically.",
    selectedHint: "Selected review",
    clearSelection: "Clear selection",
  };

  useEffect(() => {
    const next = (businessName ?? "").trim();
    if (next && next !== businessNameState) setBusinessNameState(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessName]);

  // ✅ Listen for rc:select-review
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = (evt: Event) => {
      const ce = evt as CustomEvent<RcSelectReviewDetail | undefined>;
      const d = ce.detail;
      if (!d) return;

      const rawText =
        typeof d.text === "string"
          ? d.text
          : typeof d.reviewText === "string"
          ? d.reviewText
          : "";

      const text = (rawText ?? "").trim();
      if (!text) return;

      const langRaw =
        typeof d.language === "string"
          ? d.language
          : typeof d.detectedLanguage === "string"
          ? d.detectedLanguage
          : null;

      const next: SelectedReview = {
        reviewId: String(d.reviewId ?? ""),
        businessId: d.businessId ? String(d.businessId) : null,
        text,
        rating: typeof d.rating === "number" ? d.rating : null,
        authorName: d.authorName ?? null,
        createdAt: d.createdAt ?? null,
        language: langRaw ?? null,
        source: d.source ?? null,
      };

      setSelectedReview(next);

      setReviewText(next.text);

      if (typeof next.rating === "number" && next.rating >= 1 && next.rating <= 5) {
        setRating(next.rating);
      }

      if (typeof next.language === "string" && next.language.trim()) {
        const lang = normLang(next.language);
        if (lang) setReplyLanguage(lang);
      }

      setDraft("");
      setFinalReply("");
      setOwnerLanguage("en");
      setVersion(0);
      setStatus("idle");
      setErrorMessage("");
      setReplyRecordId(null);

      try {
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {}

      window.setTimeout(() => {
        try {
          reviewTextareaRef.current?.focus();
        } catch {}
      }, 50);
    };

    window.addEventListener("rc:select-review", handler as EventListener);
    return () => window.removeEventListener("rc:select-review", handler as EventListener);
  }, []);

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

  const sameLang = useMemo(() => {
    return normLang(ownerLanguage) === normLang(replyLanguage);
  }, [ownerLanguage, replyLanguage]);

  async function requestTranslate(text: string, targetLanguage: string) {
    const { ok, json, status, rawText } = await fetchJson<TranslateReplyResponse>(
      "/api/reviews/translate-reply",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, target_language: targetLanguage }),
      }
    );

    if (!ok || !json || json.ok === false) {
      const msg =
        (json as any)?.error ||
        `Could not translate the reply. (status ${status}) ${rawText.slice(0, 120)}`;
      throw new Error(msg);
    }

    if (typeof json.translated !== "string" || !json.translated.trim()) {
      throw new Error("No translated reply was returned.");
    }

    return json.translated;
  }

  async function createReplyRecordDraft(params: {
    review_id: string;
    business_id: string;
    draft_text: string;
    owner_language: string;
    reviewer_language: string;
    rating: number;
  }) {
    const { ok, json, status, rawText } = await fetchJson<any>("/api/reviews/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, status: "draft" }),
    });

    if (!ok || !json?.ok) {
      console.warn("Failed to create reply record (draft).", {
        status,
        json,
        rawPreview: rawText.slice(0, 300),
      });
      return null;
    }

    const id = json?.reply_record?.id;
    return typeof id === "string" && id ? id : null;
  }

  async function patchReplyRecord(id: string, statusValue: "copied" | "posted") {
    const { ok, json, status, rawText } = await fetchJson<any>("/api/reviews/replies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: statusValue }),
    });

    if (!ok || !json?.ok) {
      console.warn("Failed to PATCH reply record.", {
        status,
        json,
        rawPreview: rawText.slice(0, 300),
      });
      return false;
    }

    return true;
  }

  // fallback: if no replyRecordId exists for any reason, create a copied record on copy
  async function createCopiedReplyRecordFallback(params: {
    review_id: string;
    business_id: string;
    draft_text: string;
    owner_language: string;
    reviewer_language: string;
    rating: number;
  }) {
    const { ok, json, status, rawText } = await fetchJson<any>("/api/reviews/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, status: "copied" }),
    });

    if (!ok || !json?.ok) {
      console.warn("Failed to create reply record (copied fallback).", {
        status,
        json,
        rawPreview: rawText.slice(0, 300),
      });
      return null;
    }

    const id = json?.reply_record?.id;
    return typeof id === "string" && id ? id : null;
  }

  async function requestDraft() {
    setStatus("loading");
    setErrorMessage("");

    const tone = toneFromRating(rating);

    try {
      const { ok, json, status: httpStatus, rawText } = await fetchJson<DraftReplyResponse>(
        "/api/reviews/draft-reply",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business_name: businessNameState.trim(),
            rating,
            language: replyLanguage,
            review_text: reviewText.trim(),
            tone,
            rules: DRAFT_RULES,
          }),
        }
      );

      if (!ok || !json || json.ok === false) {
        const msg =
          (json as any)?.error ||
          `${COPY.errorDefault} (status ${httpStatus}) ${rawText.slice(0, 120)}`;

        setDraft("");
        setFinalReply("");
        setStatus("error");
        setErrorMessage(msg);
        setReplyRecordId(null);
        return { ok: false as const };
      }

      if (typeof json.reply !== "string" || !json.reply.trim()) {
        setDraft("");
        setFinalReply("");
        setStatus("error");
        setErrorMessage("No reply was returned.");
        setReplyRecordId(null);
        return { ok: false as const };
      }

      const ownerDraft = json.reply.trim();
      setDraft(ownerDraft);

      const ownerLangRaw = json.meta?.owner_language || "en";
      setOwnerLanguage(ownerLangRaw);

      const reviewerLangRaw = replyLanguage || json.meta?.reviewer_language || "en";

      if (normLang(ownerLangRaw) !== normLang(reviewerLangRaw)) {
        const translated = await requestTranslate(ownerDraft, reviewerLangRaw);
        setFinalReply(translated);
      } else {
        setFinalReply("");
      }

      // create a draft record (best-effort)
      const review_id = selectedReview?.reviewId?.trim() || "";
      const business_id = selectedReview?.businessId?.trim() || "";

      if (review_id && business_id) {
        const recId = await createReplyRecordDraft({
          review_id,
          business_id,
          draft_text: ownerDraft,
          owner_language: ownerLangRaw,
          reviewer_language: reviewerLangRaw,
          rating,
        });
        setReplyRecordId(recId);
      } else {
        setReplyRecordId(null);
      }

      setStatus("success");
      return { ok: true as const };
    } catch (err: unknown) {
      setDraft("");
      setFinalReply("");
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : COPY.errorDefault);
      setReplyRecordId(null);
      return { ok: false as const };
    }
  }

  async function onDraft() {
    setDraft("");
    setFinalReply("");
    setVersion(0);
    setReplyRecordId(null);
    const result = await requestDraft();
    if (result.ok) setVersion(1);
  }

  async function onDraftAnother() {
    setReplyRecordId(null);
    const result = await requestDraft();
    if (result.ok) setVersion((v) => (v > 0 ? v + 1 : 1));
  }

  async function onCopy() {
    const textToCopy = (sameLang ? draft : finalReply || draft).trim();
    if (!textToCopy) return;

    try {
      await navigator.clipboard.writeText(textToCopy);

      // best-effort logging
      const review_id = selectedReview?.reviewId?.trim() || "";
      const business_id = selectedReview?.businessId?.trim() || "";

      if (review_id && business_id) {
        if (replyRecordId) {
          await patchReplyRecord(replyRecordId, "copied");
        } else {
          const fallbackId = await createCopiedReplyRecordFallback({
            review_id,
            business_id,
            draft_text: textToCopy,
            owner_language: ownerLanguage,
            reviewer_language: replyLanguage,
            rating,
          });
          setReplyRecordId(fallbackId);
        }
      }

      setCopied(true);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);

      copiedTimer.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimer.current = null;
      }, 1200);
    } catch (e) {
      console.error("copy failed:", e);
      setStatus("error");
      setErrorMessage("Could not copy to clipboard.");
    }
  }

  function onClearSelection() {
    setSelectedReview(null);
    setReviewText("");
    setDraft("");
    setFinalReply("");
    setOwnerLanguage("en");
    setVersion(0);
    setStatus("idle");
    setErrorMessage("");
    setReplyRecordId(null);
  }

  const isLoading = status === "loading";
  const hasDraft = Boolean(draft.trim());
  const hasFinal = Boolean(finalReply.trim());
  const canCopy = (hasDraft && (sameLang || hasFinal)) && !isLoading;

  const statusPill = useMemo(() => {
    if (status === "loading") return { label: COPY.statusDrafting, tone: "neutral" as const };
    if (status === "error") return { label: COPY.statusError, tone: "error" as const };
    if (status === "success" && (hasDraft || hasFinal))
      return { label: COPY.statusReady, tone: "success" as const };
    return null;
  }, [status, hasDraft, hasFinal, COPY.statusDrafting, COPY.statusError, COPY.statusReady]);

  const controlsGridStyle: React.CSSProperties = useMemo(
    () => ({
      display: "grid",
      gridTemplateColumns: isNarrow ? "1fr" : "1fr 140px 220px",
      gap: 10,
      marginTop: 12,
    }),
    [isNarrow]
  );

  return (
    <section style={panelStyle} ref={panelRef as any}>
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

            {version > 0 ? (
              <span style={versionBadgeStyle} title="Another option counter">
                Option {version}
              </span>
            ) : null}
          </div>

          <p
            style={{
              marginTop: 8,
              marginBottom: 0,
              color: "rgba(226,232,240,0.78)",
              lineHeight: 1.45,
            }}
          >
            {COPY.subtitle}
          </p>

          {selectedReview ? (
            <div
              style={{
                marginTop: 10,
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(148,163,184,0.28)",
                  background: "rgba(15,23,42,0.75)",
                  color: "#e2e8f0",
                }}
              >
                {COPY.selectedHint}
                {selectedReview.authorName ? ` · ${selectedReview.authorName}` : ""}
                {typeof selectedReview.rating === "number" && selectedReview.rating > 0
                  ? ` · ${selectedReview.rating}★`
                  : ""}
              </span>

              <button
                type="button"
                onClick={onClearSelection}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(148,163,184,0.28)",
                  background: "rgba(15,23,42,0.75)",
                  color: "#e2e8f0",
                  cursor: "pointer",
                  fontSize: 12,
                }}
                title="Clear the selected review and reset the panel"
              >
                {COPY.clearSelection}
              </button>
            </div>
          ) : null}

          {hasDraft ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "rgba(226,232,240,0.55)" }}>
              Draft language (owner): <b>{normLang(ownerLanguage).toUpperCase()}</b> • Copy-ready:{" "}
              <b>{normLang(replyLanguage).toUpperCase()}</b>
            </div>
          ) : null}
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
          <div style={labelStyle}>Business name</div>
          <input
            value={businessNameState}
            onChange={(e) => setBusinessNameState(e.target.value)}
            placeholder="e.g. Your business name"
            style={inputStyle}
          />
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={labelStyle}>Review rating</div>
          <select
            value={String(rating)}
            onChange={(e) => setRating(Number(e.target.value))}
            style={selectStyle}
          >
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {r}★
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <div style={labelStyle}>Reviewer language (copy-ready)</div>
          <select
            value={replyLanguage}
            onChange={(e) => setReplyLanguage(e.target.value)}
            style={selectStyle}
          >
            <option value="en">EN</option>
            <option value="es">ES</option>
            <option value="pt">PT</option>
            <option value="fr">FR</option>
            <option value="it">IT</option>
            <option value="de">DE</option>
          </select>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "rgba(226,232,240,0.62)", marginTop: 6 }}>
        Helps tailor the reply tone to a 1★ vs 5★ experience.
      </div>

      {/* Review input */}
      <div style={{ marginTop: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "baseline",
          }}
        >
          <div style={labelStyle}>Guest review</div>
          <div style={{ fontSize: 12, color: "rgba(226,232,240,0.6)" }}>
            {reviewText.trim().length}/10+
          </div>
        </div>

        <div
          style={{
            marginTop: 6,
            fontSize: 12,
            color: "rgba(226,232,240,0.62)",
            lineHeight: 1.35,
          }}
        >
          Paste the review text exactly as the guest wrote it.
        </div>

        <textarea
          ref={reviewTextareaRef}
          value={reviewText}
          onChange={(e) => setReviewText(e.target.value)}
          placeholder="Paste the review text here…"
          rows={5}
          style={{ ...textareaStyle, marginTop: 8 }}
        />
      </div>

      {/* Actions */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {!hasDraft ? (
          <button
            onClick={onDraft}
            disabled={!canSubmit || isLoading}
            style={primaryButtonStyle(!canSubmit || isLoading)}
            title="Create a suggested reply you can edit"
          >
            {isLoading ? "Drafting…" : "Draft a reply"}
          </button>
        ) : (
          <>
            <button
              onClick={onDraftAnother}
              disabled={!canSubmit || isLoading}
              style={primaryButtonStyle(!canSubmit || isLoading)}
              title="Create another suggested option"
            >
              {isLoading ? "Drafting…" : "Draft another option"}
            </button>

            <button onClick={onCopy} disabled={!canCopy} style={secondaryButtonStyle(!canCopy)}>
              {copied ? "Copied" : "Copy reply"}
            </button>
          </>
        )}

        {status === "error" ? (
          <span style={{ color: "#fecaca", fontSize: 13 }}>{errorMessage}</span>
        ) : null}
      </div>

      {/* Owner Draft output */}
      <div style={{ marginTop: 14 }}>
        <div style={labelStyle}>Owner draft (editable)</div>

        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="A suggested reply will appear here…"
          rows={7}
          style={{
            ...textareaStyle,
            marginTop: 6,
            opacity: hasDraft ? 1 : 0.9,
          }}
        />

        {hasDraft ? (
          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "rgba(226,232,240,0.62)",
              lineHeight: 1.35,
            }}
          >
            This is a starting point. Edit it freely so it feels like you.
          </div>
        ) : null}
      </div>

      {/* Copy-ready output (ONLY when different language) */}
      {!sameLang ? (
        <div style={{ marginTop: 14 }}>
          <div style={labelStyle}>Copy-ready reply</div>

          <textarea
            value={finalReply}
            onChange={(e) => setFinalReply(e.target.value)}
            placeholder="Copy-ready reply will appear here…"
            rows={7}
            style={{
              ...textareaStyle,
              marginTop: 6,
              opacity: finalReply.trim() ? 1 : 0.9,
            }}
          />

          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "rgba(226,232,240,0.62)",
              lineHeight: 1.35,
            }}
          >
            This is what you’ll paste into Google Reviews. It matches the reviewer’s language.
          </div>
        </div>
      ) : null}

      {/* Footer note */}
      <div
        style={{
          marginTop: 10,
          fontSize: 12,
          color: "rgba(226,232,240,0.6)",
          lineHeight: 1.45,
        }}
      >
        Tip: Copy the reply, then paste it into Google Reviews to post. Nothing is posted automatically.
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
