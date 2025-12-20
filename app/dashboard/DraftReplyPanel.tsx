"use client";

import React, { useMemo, useState } from "react";

type DraftReplyResponse = {
  ok: boolean;
  reply?: string;
  error?: string;
};

export default function DraftReplyPanel() {
  const [businessName, setBusinessName] = useState("Andeluna");
  const [rating, setRating] = useState<number>(5);
  const [language, setLanguage] = useState<string>("es");
  const [reviewText, setReviewText] = useState(
    "Amazing tasting experience and the staff was super friendly. Beautiful views!"
  );

  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  const canSubmit = useMemo(() => {
    return businessName.trim().length > 0 && reviewText.trim().length > 10;
  }, [businessName, reviewText]);

  async function onGenerate() {
    setStatus("loading");
    setErrorMessage("");
    setDraft("");

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

      // Handle HTTP errors OR "ok: false" responses
      if (!res.ok || data.ok === false) {
        const msg = typeof data.error === "string" && data.error.trim()
          ? data.error
          : "Failed to generate draft.";
        setStatus("error");
        setErrorMessage(msg);
        return;
      }

      // Ensure we got a reply string
      if (typeof data.reply !== "string" || !data.reply.trim()) {
        setStatus("error");
        setErrorMessage("No draft returned from server.");
        return;
      }

      setDraft(data.reply);
      setStatus("success");
    } catch (err: unknown) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  async function onCopy() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
  }

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
      <h2 style={{ margin: 0, fontSize: 18 }}>Draft Reply (Read-only)</h2>
      <p style={{ marginTop: 6, opacity: 0.8 }}>
        Paste a review → generate a suggested reply (does not post anywhere yet).
      </p>

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
        <button
          onClick={onGenerate}
          disabled={!canSubmit || status === "loading"}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: status === "loading" ? "rgba(255,255,255,0.06)" : "rgba(99,102,241,0.35)",
            cursor: !canSubmit || status === "loading" ? "not-allowed" : "pointer",
            color: "white",
            fontWeight: 600,
          }}
        >
          {status === "loading" ? "Generating..." : "Generate draft"}
        </button>

        {draft && (
          <button
            onClick={onCopy}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.06)",
              cursor: "pointer",
              color: "white",
              fontWeight: 600,
            }}
          >
            Copy
          </button>
        )}

        {status === "error" && (
          <span style={{ color: "#ffb3b3", fontSize: 14 }}>{errorMessage}</span>
        )}

        {status === "success" && draft && (
          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 14 }}>
            Draft ready ✅
          </span>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
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
            opacity: draft ? 1 : 0.8,
          }}
        />
      </div>
    </section>
  );
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
