// app/try/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";

type Locale = "en" | "es" | "pt";
const LOCALE_COOKIE = "rc_locale";

function readLocaleCookie(): Locale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
  const val = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return val === "es" || val === "pt" || val === "en" ? val : "en";
}

// ─── Sample reviews (cycles 5★ → 3★ → 1★) ─────────────────────────────────────

type Sample = {
  business: string;
  rating: number;
  language: string;
  text: string;
};

const SAMPLES: Sample[] = [
  {
    business: "Casa Lola Cartagena",
    rating: 5,
    language: "en",
    text: "Absolutely incredible experience from start to finish. Maria at the front desk was wonderful and the rooftop dinner exceeded every expectation. Best meal we've had in Cartagena hands down.",
  },
  {
    business: "Estancia Las Carreras",
    rating: 3,
    language: "en",
    text: "The location is stunning and our room had beautiful views. However, check-in took over 45 minutes and the front desk seemed disorganized. Breakfast was good but service was slow.",
  },
  {
    business: "Bodega Vista Andina",
    rating: 1,
    language: "en",
    text: "Worst tasting experience of our trip. Our guide was clearly bothered to be there, gave one-word answers, and rushed us through every wine. When my partner asked a question she rolled her eyes. Will never come back.",
  },
];

// ─── i18n copy ────────────────────────────────────────────────────────────────

const COPY: Record<Locale, any> = {
  en: {
    headline: "Draft a Google review reply in your voice — in 30 seconds.",
    subhead: "Paste a review. Get a warm, specific reply. Try it free, no signup.",
    samplePrompt: "Try a sample review:",
    cycleSample: "Try another sample",
    business: "Business name",
    rating: "Rating",
    reviewLanguage: "Review language",
    review: "Guest review",
    reviewPlaceholder: "Paste a Google review here, or use the sample above…",
    draftBtn: "Draft reply",
    drafting: "Drafting…",
    yourDraft: "Your owner reply",
    copyBtn: "Copy reply",
    copied: "Copied!",
    draftsLeft: (n: number) => `${n} free draft${n === 1 ? "" : "s"} remaining`,
    draftsLeftEmail: (n: number) => `${n} draft${n === 1 ? "" : "s"} remaining`,
    emailModalTitle: "Like it? Get 5 more drafts free.",
    emailModalSub: "Just enter your email below.",
    emailPlaceholder: "you@yourbusiness.com",
    emailSubmit: "Unlock 5 more drafts",
    stripeModalTitle: "You've seen what it can do.",
    stripeModalSub: "Start your 30-day free trial — drafts in 6 languages, your voice, your control.",
    stripeBtn: "Start 30-day trial",
    trustNoAccount: "No account needed for first 3 drafts.",
    trustNoPost: "We don't post anything to Google.",
    trustControl: "You stay in control.",
    error: "Something went wrong. Please try again.",
    invalidEmail: "Please enter a valid email.",
    backToHome: "← Back to homepage",
  },
  es: {
    headline: "Redactá una respuesta a una reseña de Google en tu voz — en 30 segundos.",
    subhead: "Pegá una reseña. Recibí una respuesta cálida y específica. Probalo gratis, sin registro.",
    samplePrompt: "Probá con una reseña de ejemplo:",
    cycleSample: "Probar otro ejemplo",
    business: "Nombre del negocio",
    rating: "Calificación",
    reviewLanguage: "Idioma de la reseña",
    review: "Reseña del huésped",
    reviewPlaceholder: "Pegá una reseña de Google acá, o usá el ejemplo de arriba…",
    draftBtn: "Redactar respuesta",
    drafting: "Redactando…",
    yourDraft: "Tu respuesta como dueño",
    copyBtn: "Copiar respuesta",
    copied: "¡Copiado!",
    draftsLeft: (n: number) => `${n} borrador${n === 1 ? "" : "es"} gratis restante${n === 1 ? "" : "s"}`,
    draftsLeftEmail: (n: number) => `${n} borrador${n === 1 ? "" : "es"} restante${n === 1 ? "" : "s"}`,
    emailModalTitle: "¿Te gusta? Recibí 5 borradores más gratis.",
    emailModalSub: "Solo ingresá tu email abajo.",
    emailPlaceholder: "vos@tunegocio.com",
    emailSubmit: "Desbloquear 5 borradores más",
    stripeModalTitle: "Ya viste lo que puede hacer.",
    stripeModalSub: "Empezá tu prueba gratuita de 30 días — borradores en 6 idiomas, tu voz, tu control.",
    stripeBtn: "Empezar prueba de 30 días",
    trustNoAccount: "No hace falta cuenta para los primeros 3 borradores.",
    trustNoPost: "No publicamos nada en Google.",
    trustControl: "Vos mantenés el control.",
    error: "Algo salió mal. Por favor intentá de nuevo.",
    invalidEmail: "Por favor ingresá un email válido.",
    backToHome: "← Volver al inicio",
  },
  pt: {
    headline: "Redija uma resposta a uma avaliação do Google na sua voz — em 30 segundos.",
    subhead: "Cole uma avaliação. Receba uma resposta calorosa e específica. Experimente grátis, sem cadastro.",
    samplePrompt: "Experimente com uma avaliação de exemplo:",
    cycleSample: "Experimentar outro exemplo",
    business: "Nome do negócio",
    rating: "Avaliação",
    reviewLanguage: "Idioma da avaliação",
    review: "Avaliação do hóspede",
    reviewPlaceholder: "Cole uma avaliação do Google aqui, ou use o exemplo acima…",
    draftBtn: "Redigir resposta",
    drafting: "Redigindo…",
    yourDraft: "Sua resposta como dono",
    copyBtn: "Copiar resposta",
    copied: "Copiado!",
    draftsLeft: (n: number) => `${n} rascunho${n === 1 ? "" : "s"} grátis restante${n === 1 ? "" : "s"}`,
    draftsLeftEmail: (n: number) => `${n} rascunho${n === 1 ? "" : "s"} restante${n === 1 ? "" : "s"}`,
    emailModalTitle: "Gostou? Receba mais 5 rascunhos grátis.",
    emailModalSub: "Basta inserir seu email abaixo.",
    emailPlaceholder: "voce@seunegocio.com",
    emailSubmit: "Desbloquear mais 5 rascunhos",
    stripeModalTitle: "Você viu o que ele pode fazer.",
    stripeModalSub: "Comece seu teste gratuito de 30 dias — rascunhos em 6 idiomas, sua voz, seu controle.",
    stripeBtn: "Começar teste de 30 dias",
    trustNoAccount: "Nenhuma conta necessária para os primeiros 3 rascunhos.",
    trustNoPost: "Não publicamos nada no Google.",
    trustControl: "Você mantém o controle.",
    error: "Algo deu errado. Por favor, tente novamente.",
    invalidEmail: "Por favor, insira um email válido.",
    backToHome: "← Voltar para o início",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function TryPage() {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => setLocale(readLocaleCookie()), []);
  const t = COPY[locale];

  // Sample carousel
  const [sampleIdx, setSampleIdx] = useState(0);
  const currentSample = SAMPLES[sampleIdx];

  // Form state
  const [businessName, setBusinessName] = useState(currentSample.business);
  const [reviewText, setReviewText] = useState(currentSample.text);
  const [rating, setRating] = useState(currentSample.rating);
  const [language, setLanguage] = useState(currentSample.language);

  // Draft state
  const [draft, setDraft] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Funnel state
  const [draftsUsed, setDraftsUsed] = useState(0);
  const [draftsRemainingFree, setDraftsRemainingFree] = useState(3);
  const [draftsRemainingTotal, setDraftsRemainingTotal] = useState(8);
  const [email, setEmail] = useState("");
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [emailError, setEmailError] = useState("");

  // Cycle through samples
  function cycleSample() {
    const next = (sampleIdx + 1) % SAMPLES.length;
    setSampleIdx(next);
    const s = SAMPLES[next];
    setBusinessName(s.business);
    setReviewText(s.text);
    setRating(s.rating);
    setLanguage(s.language);
    setDraft(null);
    setError(null);
  }

  // Submit a draft
  async function handleDraft() {
    setError(null);
    setDraft(null);
    setDrafting(true);
    setCopied(false);

    try {
      const res = await fetch("/api/try/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          review_text: reviewText,
          business_name: businessName,
          rating,
          language,
          email: emailSubmitted ? email : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data?.gate === "email") {
          setShowEmailModal(true);
          setDrafting(false);
          return;
        }
        if (data?.gate === "stripe") {
          setShowStripeModal(true);
          setDrafting(false);
          return;
        }
        setError(data?.error || t.error);
        setDrafting(false);
        return;
      }

      setDraft(data.draft);
      setDraftsUsed(data.drafts_used);
      setDraftsRemainingFree(data.drafts_remaining_free);
      setDraftsRemainingTotal(data.drafts_remaining_total);

      if (data.requires_stripe_next) {
        // Last draft just used; next click will hit Stripe gate
      }
    } catch (e) {
      setError(t.error);
    } finally {
      setDrafting(false);
    }
  }

  // Submit email from the modal
  function handleEmailSubmit() {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setEmailError(t.invalidEmail);
      return;
    }
    setEmailError("");
    setEmailSubmitted(true);
    setShowEmailModal(false);
    // Auto-retry the draft
    handleDraft();
  }

  // Copy draft to clipboard
  function handleCopy() {
    if (!draft) return;
    navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Start Stripe trial
  async function handleStripeTrial() {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ next: "/dashboard" }),
      });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
    } catch {
      setError(t.error);
    }
  }

  // Counter logic
  const counterText = useMemo(() => {
    if (!emailSubmitted && draftsRemainingFree > 0) return t.draftsLeft(draftsRemainingFree);
    if (emailSubmitted && draftsRemainingTotal > 0) return t.draftsLeftEmail(draftsRemainingTotal);
    return null;
  }, [draftsRemainingFree, draftsRemainingTotal, emailSubmitted, t]);

  // ─── Styles (inline, matching homepage pattern) ──────────────────────────

  const wrap: React.CSSProperties = {
    minHeight: "100vh",
    background: "#0D1526",
    color: "#E5E7EB",
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    padding: "24px 16px 80px",
  };

  const container: React.CSSProperties = {
    maxWidth: 720,
    margin: "0 auto",
  };

  const headline: React.CSSProperties = {
    fontSize: "clamp(28px, 5vw, 40px)",
    fontWeight: 700,
    lineHeight: 1.15,
    margin: "32px 0 12px",
    color: "#FFFFFF",
  };

  const subheadStyle: React.CSSProperties = {
    fontSize: "clamp(15px, 2.5vw, 18px)",
    color: "#94A3B8",
    margin: "0 0 32px",
    lineHeight: 1.5,
  };

  const card: React.CSSProperties = {
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
  };

  const label: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#CBD5E1",
    marginBottom: 6,
  };

  const input: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(148, 163, 184, 0.25)",
    borderRadius: 8,
    color: "#E5E7EB",
    fontSize: 14,
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  const textarea: React.CSSProperties = {
    ...input,
    minHeight: 120,
    resize: "vertical",
    lineHeight: 1.5,
  };

  const primaryBtn: React.CSSProperties = {
    background: "#5B8FF9",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 8,
    padding: "12px 20px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    width: "100%",
    transition: "background 0.15s ease",
  };

  const secondaryBtn: React.CSSProperties = {
    ...primaryBtn,
    background: "transparent",
    color: "#5B8FF9",
    border: "1px solid #5B8FF9",
    width: "auto",
    padding: "8px 14px",
    fontSize: 13,
  };

  const draftBox: React.CSSProperties = {
    background: "rgba(91, 143, 249, 0.06)",
    border: "1px solid rgba(91, 143, 249, 0.3)",
    borderRadius: 8,
    padding: 16,
    fontSize: 15,
    lineHeight: 1.6,
    color: "#E5E7EB",
    marginBottom: 12,
    whiteSpace: "pre-wrap",
  };

  const counterStyle: React.CSSProperties = {
    fontSize: 13,
    color: "#94A3B8",
    margin: "16px 0 0",
    textAlign: "center",
  };

  const trustStrip: React.CSSProperties = {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    margin: "32px 0 0",
    lineHeight: 1.6,
  };

  const modalOverlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 1000,
  };

  const modal: React.CSSProperties = {
    background: "#0D1526",
    border: "1px solid rgba(148, 163, 184, 0.25)",
    borderRadius: 12,
    padding: 28,
    maxWidth: 420,
    width: "100%",
  };

  const homeLink: React.CSSProperties = {
    color: "#94A3B8",
    fontSize: 13,
    textDecoration: "none",
    display: "inline-block",
    marginBottom: 24,
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={wrap}>
      <div style={container}>
        <a href="/" style={homeLink}>{t.backToHome}</a>

        <h1 style={headline}>{t.headline}</h1>
        <p style={subheadStyle}>{t.subhead}</p>

        <div style={card}>
          {/* Sample cycle button */}
          <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 13, color: "#94A3B8" }}>
              {t.samplePrompt} <strong style={{ color: "#E5E7EB" }}>{currentSample.rating}★</strong>
            </span>
            <button onClick={cycleSample} style={secondaryBtn}>{t.cycleSample}</button>
          </div>

          {/* Form */}
          <div style={{ marginBottom: 14 }}>
            <label style={label}>{t.business}</label>
            <input
              style={input}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={200}
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <label style={label}>{t.rating}</label>
              <select
                style={input}
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
              >
                {[1, 2, 3, 4, 5].map((r) => (
                  <option key={r} value={r}>{r}★</option>
                ))}
              </select>
            </div>
            <div>
              <label style={label}>{t.reviewLanguage}</label>
              <select
                style={input}
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="pt">Português</option>
                <option value="fr">Français</option>
                <option value="it">Italiano</option>
                <option value="de">Deutsch</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={label}>{t.review}</label>
            <textarea
              style={textarea}
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder={t.reviewPlaceholder}
              maxLength={5000}
            />
          </div>

          <button
            onClick={handleDraft}
            disabled={drafting || !reviewText.trim() || !businessName.trim()}
            style={{
              ...primaryBtn,
              opacity: (drafting || !reviewText.trim() || !businessName.trim()) ? 0.5 : 1,
              cursor: (drafting || !reviewText.trim() || !businessName.trim()) ? "not-allowed" : "pointer",
            }}
          >
            {drafting ? t.drafting : t.draftBtn}
          </button>

          {error && (
            <p style={{ fontSize: 13, color: "#F87171", margin: "12px 0 0", textAlign: "center" }}>
              {error}
            </p>
          )}
        </div>

        {/* Result */}
        {draft && (
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#5B8FF9", marginBottom: 10 }}>
              {t.yourDraft}
            </div>
            <div style={draftBox}>{draft}</div>
            <button onClick={handleCopy} style={secondaryBtn}>
              {copied ? t.copied : t.copyBtn}
            </button>
          </div>
        )}

        {/* Counter */}
        {counterText && draft && (
          <p style={counterStyle}>{counterText}</p>
        )}

        {/* Trust strip */}
        <p style={trustStrip}>
          {t.trustNoAccount} · {t.trustNoPost} · {t.trustControl}
        </p>
      </div>

      {/* Email modal */}
      {showEmailModal && (
        <div style={modalOverlay} onClick={() => setShowEmailModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px", color: "#FFFFFF" }}>
              {t.emailModalTitle}
            </h2>
            <p style={{ fontSize: 14, color: "#94A3B8", margin: "0 0 20px" }}>
              {t.emailModalSub}
            </p>
            <input
              style={{ ...input, marginBottom: 12 }}
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
              placeholder={t.emailPlaceholder}
              autoFocus
            />
            {emailError && (
              <p style={{ fontSize: 12, color: "#F87171", margin: "0 0 12px" }}>{emailError}</p>
            )}
            <button onClick={handleEmailSubmit} style={primaryBtn}>
              {t.emailSubmit}
            </button>
          </div>
        </div>
      )}

      {/* Stripe modal */}
      {showStripeModal && (
        <div style={modalOverlay} onClick={() => setShowStripeModal(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px", color: "#FFFFFF" }}>
              {t.stripeModalTitle}
            </h2>
            <p style={{ fontSize: 14, color: "#94A3B8", margin: "0 0 20px", lineHeight: 1.5 }}>
              {t.stripeModalSub}
            </p>
            <button onClick={handleStripeTrial} style={primaryBtn}>
              {t.stripeBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}