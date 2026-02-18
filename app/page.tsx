// app/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Locale = "en" | "es" | "pt";

const LOCALE_COOKIE = "rc_locale";

// ✅ Hosted on Vercel Blob (public URL)
const DEMO_VIDEO_URL =
  "https://r0sironssiim51vb.public.blob.vercel-storage.com/demo.mp4";

const DEMO_POSTER_URL =
  process.env.NEXT_PUBLIC_DEMO_POSTER_URL ||
  "https://r0sironssiim51vb.public.blob.vercel-storage.com/demo-poster.png";

function readLocaleCookie(): Locale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${LOCALE_COOKIE}=`));
  const val = match ? decodeURIComponent(match.split("=")[1] ?? "") : "";
  return val === "es" || val === "pt" || val === "en" ? val : "en";
}

function writeLocaleCookie(locale: Locale) {
  // 1 year, site-wide
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(
    locale
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export default function Home() {
  // Locale
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    setLocale(readLocaleCookie());
  }, []);

  // ✅ Demo video readiness (hosted on Vercel Blob)
  const [demoReady, setDemoReady] = useState<boolean>(true);

  // Waitlist form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [businessTypeOther, setBusinessTypeOther] = useState("");
  const [locationsCount, setLocationsCount] = useState("");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");

  // Honeypot + timing
  const [companyWebsite, setCompanyWebsite] = useState("");
  const formRenderedAtRef = useRef<number>(Date.now());

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");

  const isOther = businessType === "Other";

  useEffect(() => {
    if (!isOther && businessTypeOther !== "") setBusinessTypeOther("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessType]);

  const COPY = useMemo(() => {
    const en = {
      nav: {
        how: "How it works",
        what: "What it does",
        pricing: "Pricing",
        login: "Log in",
        getStarted: "Start free trial",
      },
      badge: "Owner-voice replies • AI drafts • You stay in control",
      h1a: "Reply to reviews in your voice",
      h1b: "in minutes — not hours.",
      subtitleA:
        "Review Concierge drafts short, human replies that sound like you — so you can respond fast without giving up control or sounding generic.",
      subtitleB:
        "Draft thoughtful replies to reviews in English, Spanish, Portuguese, French, Italian, and German.",
      outcome: "Reply to your last 10 reviews in ~15 minutes.",
      cta: {
        primary: "Start 14-day free trial",
        waitlistLink: "Not ready? Join the waitlist",
        already: "Already have an account?",
      },
      todayNext: {
        todayTitle: "Today",
        todayText:
          "Connect a Google Place ID • Sync a recent sample of reviews • Generate reply drafts you can copy, tweak (optional), and post manually.",
        nextTitle: "Next",
        nextText:
          "Deeper voice training, team roles + approvals, and direct integration with Google Business Profile for importing reviews — so all your reviews appear in one place, ready for thoughtful replies.",
      },
      heroCard: {
        title: "Draft replies that sound like you",
        body:
          "Pull recent Google reviews into one place and generate owner-voice drafts you can post in minutes.",
        bullets: [
          "Connect your Google Place ID",
          "Sync a recent sample of reviews",
          "Generate a reply draft in your voice",
          "Copy, lightly edit (optional), and post manually",
          "Never auto-posts",
        ],
        matrix: {
          nowTitle: "Included now",
          soonTitle: "Coming soon",
          now: [
            "Google sync (recent sample)",
            "Owner-voice drafts",
            "Multilingual drafting",
            "Copy + post manually",
          ],
          soon: [
            "Full Google Business Profile integration",
            "Deeper voice training",
            "Team roles + approvals",
            "Multi-location workflows",
          ],
          foot:
            "Roadmap features are in progress. Early access customers help shape what ships next.",
        },
      },
      demo: {
        title: "Quick demo",
        subtitle: "Dashboard → pick a review → draft reply → copy. (~30 seconds)",
        lengthNote: "Demo video: under 1 minute.",
        label: "Demo video",
        sec: "Draft in ≈30s",
        placeholderTitle: "Video unavailable",
        placeholderBody:
          "The demo video is hosted on our secure file store. If it doesn’t load, please refresh or try again in a moment.",
        steps: ["Open dashboard", "Pick a review", "Draft reply", "Copy + post"],
        note: "No auto-posting. You stay in control.",
        whatTitle: "What you’ll see",
        whatBullets: [
          "Open your dashboard",
          "Select a recent review",
          "Generate an owner-voice draft",
          "Copy + post manually in Google",
        ],
      },
      waitlist: {
        title: "Join the beta waitlist",
        intro:
          "Prefer to wait? Join the waitlist and we’ll reach out when slots open.",
        businessName: "Business name *",
        businessType: "Business type *",
        workEmail: "Work email *",
        locations: "# of locations *",
        join: "Join the beta waitlist",
        joining: "Joining...",
        more: "More (optional)",
        name: "Name (optional)",
        role: "Your role (optional)",
        city: "City (optional)",
        web: "Website or Instagram (optional)",
        success: "You’re in! We’ll email you when slots open.",
        noSpam: "No spam. Early access invites only.",
      },
      how: {
        title: "How it works",
        c1t: "1. Create an account",
        c1b: "Sign up in seconds. No call. No setup fees.",
        c2t: "2. Connect Google",
        c2b: "Add your Google Place ID — takes ~60 seconds. We’ll show you where to find it.",
        c3t: "3. Draft & post",
        c3b: "Generate replies you can copy/paste into Google. You stay in control.",
      },
      what: {
        title: "What it does (and doesn’t)",
        a1t: "Owner-voice drafts",
        a1b: "Short, human replies that feel like they were written by the owner — not a bot.",
        a2t: "Human control",
        a2b: "Review Concierge drafts. You decide. No auto-posting, no automation that risks your reputation.",
        a3t: "Multilingual replies",
        a3b:
          "Reviews come in many languages. Review Concierge drafts replies in your preferred language first — then translates them for the guest when needed.",
        a3c:
          "This preserves your voice across languages while helping you respond to global customers.",
        a3d:
          "Supported languages: English, Spanish, Portuguese, French, Italian, and German.",
        a4t: "Lightweight workflow",
        a4b: "See reviews, draft replies, copy/paste. Everything else stays out of your way.",
      },
      pricing: {
        title: "Founders Pilot pricing",
        intro:
          "One simple plan — built to get you replying faster this week.",
        plan: "Founders Pilot",
        price: "$49",
        per: "/ month",
        bullets: [
          "Google sync (recent sample)",
          "Reply drafting inside the dashboard",
          "Multilingual drafting (EN/ES/PT/FR/IT/DE)",
          "Priority support + roadmap input",
        ],
        note:
          "Note: today uses Google Places “recent sample”. GBP import is coming next.",
      },
      footer: {
        privacy: "Privacy",
        terms: "Terms",
        refunds: "Refunds",
        cookies: "Cookies",
        security: "Security",
        contact: "Contact",
      },
    };

    const es = {
      nav: {
        how: "Cómo funciona",
        what: "Qué hace",
        pricing: "Precios",
        login: "Iniciar sesión",
        getStarted: "Prueba gratis",
      },
      badge: "Respuestas con tu voz • Borradores con IA • Tú decides",
      h1a: "Responde reseñas con tu voz",
      h1b: "en minutos — no en horas.",
      subtitleA:
        "Review Concierge redacta respuestas cortas y humanas que suenan como tú — para que respondas rápido sin perder control ni sonar genérico.",
      subtitleB:
        "Redacta respuestas cuidadas en inglés, español, portugués, francés, italiano y alemán.",
      outcome: "Responde tus últimas 10 reseñas en ~15 minutos.",
      cta: {
        primary: "Prueba gratis 14 días",
        waitlistLink: "¿Aún no? Sumate a la lista",
        already: "¿Ya tienes cuenta?",
      },
      todayNext: {
        todayTitle: "Hoy",
        todayText:
          "Conecta tu Place ID de Google • Sincroniza una muestra reciente de reseñas • Genera borradores que puedes copiar, ajustar (opcional) y publicar manualmente.",
        nextTitle: "Próximamente",
        nextText:
          "Mejor entrenamiento de voz, roles de equipo + aprobaciones e integración directa con Google Business Profile para importar reseñas — todo en un solo lugar, listo para responder bien.",
      },
      heroCard: {
        title: "Borradores que suenan como tú",
        body:
          "Trae reseñas recientes de Google a un solo lugar y genera borradores con voz de dueño en minutos.",
        bullets: [
          "Conecta tu Place ID de Google",
          "Sincroniza una muestra reciente de reseñas",
          "Genera un borrador con tu voz",
          "Copia, edita un poco (opcional) y publica manualmente",
          "Nunca publica automáticamente",
        ],
        matrix: {
          nowTitle: "Incluye hoy",
          soonTitle: "Muy pronto",
          now: [
            "Sync de Google (muestra reciente)",
            "Borradores con tu voz",
            "Borradores multilingües",
            "Copiar + publicar manualmente",
          ],
          soon: [
            "Integración completa con Google Business Profile",
            "Mejor entrenamiento de voz",
            "Roles de equipo + aprobaciones",
            "Flujos multi-ubicación",
          ],
          foot:
            "Las funciones del roadmap están en progreso. Los primeros clientes ayudan a priorizar qué sale primero.",
        },
      },
      demo: {
        title: "Demo rápida",
        subtitle: "Panel → elige una reseña → genera respuesta → copia. (~30 segundos)",
        lengthNote: "Video demo: menos de 1 minuto.",
        label: "Video demo",
        sec: "Borrador en ≈30s",
        placeholderTitle: "Video no disponible",
        placeholderBody:
          "El video demo está alojado en nuestro almacenamiento. Si no carga, actualiza la página o vuelve a intentar en unos segundos.",
        steps: ["Abrir panel", "Elegir reseña", "Generar respuesta", "Copiar + publicar"],
        note: "Nada de auto-publicación. Tú tienes el control.",
        whatTitle: "Qué vas a ver",
        whatBullets: [
          "Abrir tu panel",
          "Seleccionar una reseña reciente",
          "Generar un borrador con voz de dueño",
          "Copiar y publicar manualmente en Google",
        ],
      },
      waitlist: {
        title: "Sumate a la beta",
        intro:
          "¿Preferís esperar? Sumate a la lista y te contactamos cuando se abran cupos.",
        businessName: "Nombre del negocio *",
        businessType: "Tipo de negocio *",
        workEmail: "Email de trabajo *",
        locations: "# de locales *",
        join: "Unirme a la beta",
        joining: "Uniéndote...",
        more: "Más (opcional)",
        name: "Nombre (opcional)",
        role: "Tu rol (opcional)",
        city: "Ciudad (opcional)",
        web: "Web o Instagram (opcional)",
        success: "¡Listo! Te escribimos cuando se abran cupos.",
        noSpam: "Sin spam. Acceso anticipado por invitación.",
      },
      how: {
        title: "Cómo funciona",
        c1t: "1. Crea una cuenta",
        c1b: "Registrate en segundos. Sin llamadas. Sin costos de setup.",
        c2t: "2. Conecta Google",
        c2b: "Agrega tu Place ID — tarda ~60 segundos. Te mostramos dónde encontrarlo.",
        c3t: "3. Redacta y publica",
        c3b: "Genera respuestas para copiar/pegar en Google. Tú decides.",
      },
      what: {
        title: "Qué hace (y qué no)",
        a1t: "Borradores con tu voz",
        a1b: "Respuestas cortas y humanas que parecen escritas por el dueño — no por un bot.",
        a2t: "Control humano",
        a2b: "Review Concierge propone. Tú decides. Sin auto-publicación ni automatizaciones riesgosas.",
        a3t: "Respuestas multilingües",
        a3b:
          "Las reseñas llegan en varios idiomas. Review Concierge redacta primero en tu idioma preferido y luego traduce para el cliente cuando hace falta.",
        a3c:
          "Así se mantiene tu voz en distintos idiomas y respondés mejor a turistas internacionales.",
        a3d: "Idiomas: inglés, español, portugués, francés, italiano y alemán.",
        a4t: "Flujo simple",
        a4b: "Ves reseñas, generas borradores, copias/pegas. Sin complicaciones.",
      },
      pricing: {
        title: "Precio Founders Pilot",
        intro:
          "Un plan simple — para que respondas más rápido esta semana.",
        plan: "Founders Pilot",
        price: "$49",
        per: "/ mes",
        bullets: [
          "Sync de Google (muestra reciente)",
          "Redacción de respuestas en el panel",
          "Borradores multilingües (EN/ES/PT/FR/IT/DE)",
          "Soporte prioritario + feedback de roadmap",
        ],
        note:
          "Nota: hoy usamos una “muestra reciente” vía Google Places. Importación completa por GBP viene después.",
      },
      footer: {
        privacy: "Privacidad",
        terms: "Términos",
        refunds: "Reembolsos",
        cookies: "Cookies",
        security: "Seguridad",
        contact: "Contacto",
      },
    };

    const pt = {
      nav: {
        how: "Como funciona",
        what: "O que faz",
        pricing: "Preços",
        login: "Entrar",
        getStarted: "Teste grátis",
      },
      badge: "Respostas com sua voz • Rascunhos com IA • Você no controle",
      h1a: "Responda avaliações com sua voz",
      h1b: "em minutos — não horas.",
      subtitleA:
        "O Review Concierge cria respostas curtas e humanas que soam como você — para responder rápido sem perder o controle nem parecer genérico.",
      subtitleB:
        "Crie respostas cuidadosas em inglês, espanhol, português, francês, italiano e alemão.",
      outcome: "Responda suas últimas 10 avaliações em ~15 minutos.",
      cta: {
        primary: "Teste grátis por 14 dias",
        waitlistLink: "Ainda não? Entre na lista",
        already: "Já tem conta?",
      },
      todayNext: {
        todayTitle: "Hoje",
        todayText:
          "Conecte um Place ID do Google • Sincronize uma amostra recente de avaliações • Gere rascunhos para copiar, ajustar (opcional) e postar manualmente.",
        nextTitle: "Em breve",
        nextText:
          "Treinamento de voz melhor, papéis da equipe + aprovações e integração direta com o Google Business Profile para importar avaliações — tudo em um só lugar, pronto para responder bem.",
      },
      heroCard: {
        title: "Rascunhos que soam como você",
        body:
          "Traga avaliações recentes do Google para um só lugar e gere rascunhos com voz do proprietário em minutos.",
        bullets: [
          "Conecte seu Place ID do Google",
          "Sincronize uma amostra recente de avaliações",
          "Gere um rascunho com sua voz",
          "Copie, edite um pouco (opcional) e poste manualmente",
          "Nunca posta automaticamente",
        ],
        matrix: {
          nowTitle: "Inclui hoje",
          soonTitle: "Em breve",
          now: [
            "Sync do Google (amostra recente)",
            "Rascunhos com voz do dono",
            "Rascunhos multilíngues",
            "Copiar + postar manualmente",
          ],
          soon: [
            "Integração completa com Google Business Profile",
            "Treinamento de voz melhor",
            "Papéis da equipe + aprovações",
            "Fluxos multi-localização",
          ],
          foot:
            "Recursos do roadmap estão em desenvolvimento. Clientes early access ajudam a definir prioridades.",
        },
      },
      demo: {
        title: "Demo rápida",
        subtitle: "Painel → escolha uma avaliação → gerar resposta → copiar. (~30 segundos)",
        lengthNote: "Vídeo demo: menos de 1 minuto.",
        label: "Vídeo demo",
        sec: "Rascunho em ≈30s",
        placeholderTitle: "Vídeo indisponível",
        placeholderBody:
          "O vídeo demo está hospedado no nosso armazenamento. Se não carregar, atualize a página ou tente novamente em alguns segundos.",
        steps: ["Abrir painel", "Escolher avaliação", "Gerar resposta", "Copiar + postar"],
        note: "Sem autopost. Você no controle.",
        whatTitle: "O que você vai ver",
        whatBullets: [
          "Abrir seu painel",
          "Selecionar uma avaliação recente",
          "Gerar um rascunho com voz do dono",
          "Copiar e postar manualmente no Google",
        ],
      },
      waitlist: {
        title: "Entre na beta",
        intro:
          "Prefere esperar? Entre na lista e avisaremos quando abrirem vagas.",
        businessName: "Nome do negócio *",
        businessType: "Tipo de negócio *",
        workEmail: "Email de trabalho *",
        locations: "# de locais *",
        join: "Entrar na beta",
        joining: "Entrando...",
        more: "Mais (opcional)",
        name: "Nome (opcional)",
        role: "Seu cargo (opcional)",
        city: "Cidade (opcional)",
        web: "Site ou Instagram (opcional)",
        success: "Pronto! Vamos avisar por email quando abrir.",
        noSpam: "Sem spam. Acesso antecipado só por convite.",
      },
      how: {
        title: "Como funciona",
        c1t: "1. Crie uma conta",
        c1b: "Cadastre-se em segundos. Sem ligação. Sem taxa de setup.",
        c2t: "2. Conecte o Google",
        c2b: "Adicione seu Place ID — leva ~60 segundos. Mostramos onde encontrar.",
        c3t: "3. Rascunhe e poste",
        c3b: "Gere respostas para copiar/colar no Google. Você decide.",
      },
      what: {
        title: "O que faz (e o que não faz)",
        a1t: "Rascunhos com voz do dono",
        a1b: "Respostas curtas e humanas que parecem do proprietário — não de um robô.",
        a2t: "Controle humano",
        a2b: "O Review Concierge sugere. Você decide. Sem autopost, sem automações arriscadas.",
        a3t: "Respostas multilíngues",
        a3b:
          "Avaliações chegam em vários idiomas. O Review Concierge redige primeiro no seu idioma preferido e depois traduz quando necessário.",
        a3c:
          "Assim sua voz se mantém entre idiomas enquanto você atende turistas internacionais.",
        a3d: "Idiomas: inglês, espanhol, português, francês, italiano e alemão.",
        a4t: "Fluxo leve",
        a4b: "Veja avaliações, gere rascunhos, copie/cole. Sem complicação.",
      },
      pricing: {
        title: "Preço Founders Pilot",
        intro:
          "Um plano simples — para você responder mais rápido nesta semana.",
        plan: "Founders Pilot",
        price: "$49",
        per: "/ mês",
        bullets: [
          "Sync do Google (amostra recente)",
          "Rascunhos dentro do painel",
          "Rascunhos multilíngues (EN/ES/PT/FR/IT/DE)",
          "Suporte prioritário + feedback de roadmap",
        ],
        note:
          "Obs.: hoje usamos a “amostra recente” via Google Places. Importação completa por GBP vem depois.",
      },
      footer: {
        privacy: "Privacidade",
        terms: "Termos",
        refunds: "Reembolsos",
        cookies: "Cookies",
        security: "Segurança",
        contact: "Contato",
      },
    };

    return { en, es, pt } as const;
  }, []);

  const t = COPY[locale];

  async function handleWaitlistSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    // Bot protection: Honeypot
    if (companyWebsite.trim().length > 0) {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
      return;
    }

    // Bot protection: Timing (minimum 3 seconds)
    const elapsedMs = Date.now() - formRenderedAtRef.current;
    if (elapsedMs < 3000) {
      setStatus("error");
      setErrorMessage("Please wait a moment and try again.");
      return;
    }

    // Frontend validation: if "Other" selected, require text
    if (isOther && businessTypeOther.trim().length === 0) {
      setStatus("error");
      setErrorMessage("Please specify your business type (Other).");
      return;
    }

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          businessName,
          businessType,
          businessTypeOther: isOther ? businessTypeOther.trim() : "",
          locationsCount,
          units: locationsCount, // TEMP compatibility for old backend
          role,
          city,
          website,
          companyWebsite,
          formElapsedMs: elapsedMs,
        }),
      });

      const data: unknown = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg =
          typeof (data as { error?: unknown })?.error === "string"
            ? (data as { error: string }).error
            : "Something went wrong. Please try again.";
        throw new Error(msg);
      }

      setStatus("success");
      setName("");
      setEmail("");
      setBusinessName("");
      setBusinessType("");
      setBusinessTypeOther("");
      setLocationsCount("");
      setRole("");
      setCity("");
      setWebsite("");

      setCompanyWebsite("");
      formRenderedAtRef.current = Date.now();
    } catch (err: unknown) {
      setStatus("error");
      if (err instanceof Error) setErrorMessage(err.message);
      else setErrorMessage("Something went wrong. Please try again.");
    }
  }

  function applyLocale(next: Locale) {
    setLocale(next);
    writeLocaleCookie(next);
    // simple + reliable for now
    window.location.reload();
  }

  return (
    <>
      <main className="page">
        <header className="nav">
          <div className="logo">
            Review Concierge<span>.ai</span>
          </div>

          <nav className="nav-links">
            <a href="#how-it-works">{t.nav.how}</a>
            <a href="#features">{t.nav.what}</a>
            <a href="#pricing">{t.nav.pricing}</a>
          </nav>

          <div className="nav-actions">
            {/* ✅ Always show EN / ES / PT */}
            <div className="lang-toggle" role="group" aria-label="Language">
              {(["en", "es", "pt"] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  className={`lang-btn ${locale === code ? "active" : ""}`}
                  onClick={() => applyLocale(code)}
                  aria-pressed={locale === code}
                >
                  {code.toUpperCase()}
                </button>
              ))}
            </div>

            <a className="nav-link" href="/login">
              {t.nav.login}
            </a>
            <a className="nav-primary" href="/signup">
              {t.nav.getStarted}
            </a>
          </div>
        </header>

        {/* Hero */}
        <section className="hero">
          <div className="hero-text">
            <div className="badge">{t.badge}</div>

            <h1>
              {t.h1a}
              <br />
              <span className="accent">{t.h1b}</span>
            </h1>

            <p className="hero-subtitle">
              {t.subtitleA}
              <br />
              <span style={{ opacity: 0.85 }}>{t.subtitleB}</span>
            </p>

            {/* ✅ Concrete outcome line */}
            <p className="hero-outcome">{t.outcome}</p>

            {/* ✅ Single primary CTA + secondary text link (removes mixed signals) */}
            <div className="hero-ctas">
              <a className="primary-btn" href="/signup">
                {t.cta.primary}
              </a>

              <a className="text-link" href="#waitlist">
                {t.cta.waitlistLink}
              </a>

              <div className="cta-note">
                {t.cta.already} <a href="/login">{t.nav.login}</a>
              </div>
            </div>
          </div>

          {/* Right-side card */}
          <div className="hero-card">
            <h2>{t.heroCard.title}</h2>
            <p>{t.heroCard.body}</p>

            <ul className="checklist">
              {t.heroCard.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>

            <div className="card-divider" />

            <div className="roadmap-matrix" aria-label="Product roadmap">
              <div className="roadmap-col">
                <div className="roadmap-title">{t.heroCard.matrix.nowTitle}</div>
                <ul className="roadmap-list">
                  {t.heroCard.matrix.now.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="roadmap-col">
                <div className="roadmap-title">{t.heroCard.matrix.soonTitle}</div>
                <ul className="roadmap-list roadmap-soon">
                  {t.heroCard.matrix.soon.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="roadmap-foot">{t.heroCard.matrix.foot}</div>
          </div>
        </section>

        <div className="section-divider" />

        {/* Demo */}
        <section className="demo-section">
          <div className="demo-head">
            <h2>{t.demo.title}</h2>
            <p className="section-intro" style={{ marginBottom: 0 }}>
              {t.demo.subtitle}
            </p>
            <p className="demo-length-note">{t.demo.lengthNote}</p>
          </div>

          <div className="demo-grid">
            <div className="demo-video-card">
              <div className="demo-chip-row">
                <span className="demo-chip">{t.demo.label}</span>
                <span className="demo-chip">{t.demo.sec}</span>
              </div>

              <div className="demo-media">
                {demoReady ? (
                  <video
                    controls
                    playsInline
                    // @ts-ignore - attribute is fine in DOM
                    webkit-playsinline="true"
                    preload="metadata"
                    poster={DEMO_POSTER_URL}
                    className="demo-video"
                    crossOrigin="anonymous"
                    controlsList="nodownload noplaybackrate"
                    disablePictureInPicture
                    onError={() => setDemoReady(false)}
                  >
                    <source src={DEMO_VIDEO_URL} type="video/mp4" />
                    Your browser does not support the video tag.
                  </video>
                ) : (
                  <div className="demo-placeholder">
                    <div className="demo-placeholder-title">
                      {t.demo.placeholderTitle}
                    </div>
                    <div className="demo-placeholder-body">
                      {t.demo.placeholderBody}
                    </div>
                  </div>
                )}
              </div>

              <div className="demo-steps">
                {t.demo.steps.map((s, idx) => (
                  <div className="demo-step" key={s}>
                    <span className="demo-step-num">{idx + 1}</span>
                    <span className="demo-step-text">{s}</span>
                  </div>
                ))}
              </div>

              <div className="demo-note">{t.demo.note}</div>
            </div>

            <div className="demo-what-card">
              <h3>{t.demo.whatTitle}</h3>
              <ul className="checklist">
                {t.demo.whatBullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <div className="section-divider" />

        {/* Waitlist */}
        <section id="waitlist" className="waitlist-section">
          <div className="waitlist-head">
            <h2>{t.waitlist.title}</h2>
            <p className="section-intro" style={{ marginBottom: 0 }}>
              {t.waitlist.intro}
            </p>
          </div>

          <div className="hero-actions">
            <form onSubmit={handleWaitlistSubmit} className="waitlist-form">
              {/* Honeypot */}
              <div
                style={{
                  position: "absolute",
                  left: "-10000px",
                  top: "auto",
                  width: "1px",
                  height: "1px",
                  overflow: "hidden",
                }}
                aria-hidden="true"
              >
                <label htmlFor="companyWebsite">Company Website</label>
                <input
                  id="companyWebsite"
                  type="text"
                  name="companyWebsite"
                  tabIndex={-1}
                  autoComplete="off"
                  value={companyWebsite}
                  onChange={(e) => setCompanyWebsite(e.target.value)}
                />
              </div>

              <div className="waitlist-row">
                <input
                  type="text"
                  placeholder={t.waitlist.businessName}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="waitlist-input"
                  required
                />

                <div className="waitlist-select-wrap">
                  <select
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className="waitlist-input waitlist-select"
                    required
                    style={{
                      color: businessType
                        ? "#f9fafb"
                        : "rgba(209, 213, 219, 0.55)",
                    }}
                  >
                    <option value="" disabled>
                      {t.waitlist.businessType}
                    </option>
                    <option value="Winery">Winery</option>
                    <option value="Restaurant">Restaurant</option>
                    <option value="Bar">Bar</option>
                    <option value="Cafe">Cafe</option>
                    <option value="Nightclub">Nightclub</option>
                    <option value="Tour Operator">Tour Operator</option>
                    <option value="Hotel">Hotel</option>
                    <option value="Other">Other</option>
                  </select>
                  <span className="waitlist-select-caret" aria-hidden="true">
                    ▼
                  </span>
                </div>

                {isOther && (
                  <input
                    type="text"
                    placeholder="Business type (Other) *"
                    value={businessTypeOther}
                    onChange={(e) => setBusinessTypeOther(e.target.value)}
                    className="waitlist-input"
                    required
                  />
                )}

                <input
                  type="email"
                  placeholder={t.waitlist.workEmail}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="waitlist-input"
                  required
                />

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={t.waitlist.locations}
                  value={locationsCount}
                  onChange={(e) =>
                    setLocationsCount(e.target.value.replace(/\D/g, ""))
                  }
                  className="waitlist-input"
                  required
                />

                <button
                  type="submit"
                  className="primary-btn"
                  disabled={status === "loading"}
                >
                  {status === "loading" ? t.waitlist.joining : t.waitlist.join}
                </button>
              </div>

              <details className="waitlist-more">
                <summary>{t.waitlist.more}</summary>

                <div className="waitlist-more-grid">
                  <input
                    type="text"
                    placeholder={t.waitlist.name}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="waitlist-input"
                  />

                  <input
                    type="text"
                    placeholder={t.waitlist.role}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="waitlist-input"
                  />

                  <input
                    type="text"
                    placeholder={t.waitlist.city}
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="waitlist-input"
                  />

                  <input
                    type="text"
                    placeholder={t.waitlist.web}
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="waitlist-input"
                  />
                </div>
              </details>

              {status === "success" && (
                <p className="hero-note">{t.waitlist.success}</p>
              )}

              {status === "error" && (
                <p className="hero-note" style={{ color: "#ffb3b3" }}>
                  {errorMessage}
                </p>
              )}

              {status === "idle" && <p className="hero-note">{t.waitlist.noSpam}</p>}
            </form>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <h2>{t.how.title}</h2>
          <div className="grid-3">
            <div className="card">
              <h3>{t.how.c1t}</h3>
              <p>{t.how.c1b}</p>
            </div>
            <div className="card">
              <h3>{t.how.c2t}</h3>
              <p>{t.how.c2b}</p>
            </div>
            <div className="card">
              <h3>{t.how.c3t}</h3>
              <p>{t.how.c3b}</p>
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <h2>{t.what.title}</h2>
          <div className="grid-3">
            <div className="card">
              <h3>{t.what.a1t}</h3>
              <p>{t.what.a1b}</p>
            </div>
            <div className="card">
              <h3>{t.what.a2t}</h3>
              <p>{t.what.a2b}</p>
            </div>
            <div className="card">
              <h3>{t.what.a3t}</h3>
              <p>{t.what.a3b}</p>
              <p>{t.what.a3c}</p>
              <p>{t.what.a3d}</p>
            </div>
            <div className="card">
              <h3>{t.what.a4t}</h3>
              <p>{t.what.a4b}</p>
            </div>
          </div>
        </section>

        <section className="section" id="pricing">
          <h2>{t.pricing.title}</h2>
          <p className="section-intro">{t.pricing.intro}</p>

          <div className="pricing-card">
            <h3>{t.pricing.plan}</h3>
            <p className="price">
              <span>{t.pricing.price}</span> {t.pricing.per}
            </p>
            <ul>
              {t.pricing.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>

            <div className="pricing-actions">
              <a className="primary-btn" href="/signup">
                {t.cta.primary}
              </a>
              <a className="secondary-btn" href="#waitlist">
                {t.waitlist.title}
              </a>
            </div>

            <p className="pricing-note">{t.pricing.note}</p>
          </div>
        </section>

        <footer className="footer">
          <p>© {new Date().getFullYear()} Review Concierge.ai</p>

          <div className="footer-links">
            <a href="/privacy">{t.footer.privacy}</a>
            <a href="/terms">{t.footer.terms}</a>
            <a href="/refunds">{t.footer.refunds}</a>
            <a href="/cookies">{t.footer.cookies}</a>
            <a href="/security">{t.footer.security}</a>
            <a href="/contact">{t.footer.contact}</a>
          </div>

          <div className="footer-links">
            <a href="/login">{t.nav.login}</a>
            <a href="/signup">{t.cta.primary}</a>
            <a href="#waitlist">{t.waitlist.title}</a>
          </div>
        </footer>
      </main>

      <style jsx global>{`
        :global(html) {
          scroll-behavior: smooth;
        }

        :global(body) {
          margin: 0;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "SF Pro",
            "Inter", sans-serif;
          background: radial-gradient(
              circle at top left,
              rgba(62, 104, 255, 0.12),
              transparent 55%
            ),
            #050816;
          color: #f9fafb;
        }

        .page {
          min-height: 100vh;
          max-width: 1100px;
          margin: 0 auto;
          padding: 32px 20px 64px;
        }

        .nav {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 40px;
        }

        .logo {
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          font-size: 14px;
        }

        .logo span {
          color: #60a5fa;
        }

        .nav-links {
          display: flex;
          gap: 18px;
          font-size: 14px;
        }

        .nav-links a {
          color: #e5e7eb;
          text-decoration: none;
          opacity: 0.85;
        }

        .nav-links a:hover {
          opacity: 1;
        }

        .nav-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        /* ✅ Language toggle */
        .lang-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(2, 6, 23, 0.25);
          white-space: nowrap;
        }

        .lang-btn {
          height: 30px;
          min-width: 40px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid transparent;
          background: transparent;
          color: rgba(226, 232, 240, 0.9);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }

        .lang-btn:hover {
          border-color: rgba(96, 165, 250, 0.35);
        }

        .lang-btn.active {
          background: linear-gradient(
            135deg,
            rgba(37, 99, 235, 0.35),
            rgba(124, 58, 237, 0.35)
          );
          border-color: rgba(96, 165, 250, 0.55);
          color: #ffffff;
        }

        .nav-link {
          font-size: 14px;
          color: rgba(229, 231, 235, 0.9);
          text-decoration: none;
          opacity: 0.9;
        }

        .nav-link:hover {
          opacity: 1;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .nav-primary {
          font-size: 13px;
          padding: 8px 16px;
          border-radius: 999px;
          border: 1px solid rgba(96, 165, 250, 0.7);
          color: #e5e7eb;
          text-decoration: none;
          background: linear-gradient(
            135deg,
            rgba(37, 99, 235, 0.25),
            rgba(139, 92, 246, 0.35)
          );
        }

        .nav-primary:hover {
          filter: brightness(1.05);
        }

        .hero {
          display: grid;
          grid-template-columns: minmax(0, 1.9fr) minmax(360px, 1.1fr);
          gap: 48px;
          align-items: start;
          margin-bottom: 32px;
        }

        .hero-text {
          position: relative;
          z-index: 2;
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(2, 6, 23, 0.35);
          color: rgba(226, 232, 240, 0.92);
          margin-bottom: 14px;
        }

        .hero-card {
          position: relative;
          z-index: 1;
          background: radial-gradient(
              circle at top left,
              rgba(96, 165, 250, 0.3),
              transparent 55%
            ),
            rgba(15, 23, 42, 0.95);
          border-radius: 18px;
          padding: 20px 22px;
          border: 1px solid rgba(148, 163, 184, 0.3);
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.8);
          font-size: 14px;
        }

        /* ✅ Fix: default UL bullets can look weird on iOS; use clean checkmarks instead */
        .checklist {
          list-style: none;
          padding: 0;
          margin: 12px 0 0;
        }

        .checklist li {
          position: relative;
          padding-left: 26px;
          margin: 10px 0;
          color: rgba(226, 232, 240, 0.92);
          line-height: 1.35;
        }

        .checklist li::before {
          content: "✓";
          position: absolute;
          left: 0;
          top: 0.1em;
          width: 18px;
          height: 18px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          background: rgba(37, 99, 235, 0.22);
          border: 1px solid rgba(96, 165, 250, 0.35);
          color: rgba(226, 232, 240, 0.95);
        }

        /* ✅ New: roadmap matrix visual */
        .roadmap-matrix {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 14px;
        }

        .roadmap-col {
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(2, 6, 23, 0.18);
          border-radius: 14px;
          padding: 12px 12px 10px;
        }

        .roadmap-title {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.01em;
          color: rgba(226, 232, 240, 0.92);
          margin-bottom: 8px;
        }

        .roadmap-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .roadmap-list li {
          position: relative;
          padding-left: 22px;
          margin: 8px 0;
          font-size: 12px;
          color: rgba(209, 213, 219, 0.88);
          line-height: 1.35;
        }

        .roadmap-list li::before {
          content: "✓";
          position: absolute;
          left: 0;
          top: 0.05em;
          font-weight: 900;
          color: rgba(96, 165, 250, 0.92);
        }

        .roadmap-list.roadmap-soon li::before {
          content: "⏳";
          color: rgba(156, 163, 175, 0.92);
        }

        .roadmap-foot {
          margin-top: 10px;
          font-size: 12px;
          color: rgba(156, 163, 175, 0.92);
          line-height: 1.35;
        }

        .hero-text h1 {
          font-size: 40px;
          line-height: 1.1;
          margin: 0 0 16px;
        }

        .accent {
          color: #60a5fa;
        }

        .hero-subtitle {
          margin: 0 0 10px;
          color: #d1d5db;
          max-width: 560px;
        }

        /* ✅ New outcome line */
        .hero-outcome {
          margin: 0 0 18px;
          font-size: 14px;
          font-weight: 700;
          color: rgba(226, 232, 240, 0.92);
        }

        .hero-ctas {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 18px;
        }

        .text-link {
          font-size: 13px;
          color: rgba(226, 232, 240, 0.9);
          text-decoration: underline;
          text-underline-offset: 3px;
          opacity: 0.9;
          padding: 10px 4px;
        }

        .text-link:hover {
          opacity: 1;
        }

        .secondary-btn {
          height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 18px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(2, 6, 23, 0.25);
          color: rgba(226, 232, 240, 0.92);
          text-decoration: none;
          font-weight: 500;
          font-size: 14px;
        }

        .secondary-btn:hover {
          border-color: rgba(96, 165, 250, 0.55);
        }

        .cta-note {
          width: 100%;
          font-size: 12px;
          color: rgba(156, 163, 175, 0.95);
        }

        .cta-note a {
          color: rgba(226, 232, 240, 0.92);
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .card-divider {
          height: 1px;
          background: rgba(148, 163, 184, 0.25);
          margin: 14px 0;
        }

        .primary-btn {
          height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 22px;
          border-radius: 999px;
          white-space: nowrap;
          min-width: 170px;
          background: linear-gradient(135deg, #2563eb, #7c3aed);
          color: white;
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          box-shadow: 0 10px 30px rgba(37, 99, 235, 0.35);
          border: none;
          cursor: pointer;
        }

        .primary-btn:hover {
          filter: brightness(1.05);
        }

        .primary-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .section-divider {
          height: 1px;
          background: rgba(148, 163, 184, 0.16);
          margin: 18px 0 40px;
        }

        /* ✅ Demo section */
        .demo-section {
          margin-bottom: 56px;
        }

        .demo-head {
          margin-bottom: 14px;
        }

        .demo-length-note {
          margin: 6px 0 0;
          font-size: 12px;
          color: rgba(209, 213, 219, 0.7);
        }

        .demo-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
          gap: 18px;
          align-items: start;
        }

        .demo-video-card,
        .demo-what-card {
          background: rgba(15, 23, 42, 0.95);
          border-radius: 18px;
          padding: 16px 16px 14px;
          border: 1px solid rgba(148, 163, 184, 0.25);
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.65);
        }

        .demo-chip-row {
          display: flex;
          gap: 8px;
          margin-bottom: 10px;
        }

        .demo-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(2, 6, 23, 0.22);
          color: rgba(226, 232, 240, 0.92);
        }

        .demo-media {
          border-radius: 14px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          background: rgba(2, 6, 23, 0.22);
          overflow: hidden;
          line-height: 0;
          min-height: 0;
        }

        .demo-video {
          width: 100%;
          height: auto;
          display: block;
          max-height: 420px;
          background: rgba(2, 6, 23, 0.5);
          margin: 0;
        }

        .demo-placeholder {
          padding: 18px;
          min-height: 260px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 8px;
        }

        .demo-placeholder-title {
          font-size: 18px;
          font-weight: 700;
          color: rgba(226, 232, 240, 0.95);
        }

        .demo-placeholder-body {
          font-size: 13px;
          color: rgba(209, 213, 219, 0.85);
          line-height: 1.45;
          max-width: 680px;
        }

        .demo-steps {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }

        .demo-step {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.22);
          background: rgba(2, 6, 23, 0.2);
          color: rgba(226, 232, 240, 0.92);
          font-size: 12px;
          font-weight: 600;
        }

        .demo-step-num {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(37, 99, 235, 0.28);
          border: 1px solid rgba(96, 165, 250, 0.35);
          font-size: 11px;
        }

        .demo-note {
          margin-top: 10px;
          font-size: 12px;
          color: rgba(156, 163, 175, 0.95);
        }

        .demo-what-card h3 {
          margin-top: 0;
          margin-bottom: 10px;
          color: rgba(226, 232, 240, 0.95);
          font-size: 16px;
        }

        /* Waitlist */
        .waitlist-section {
          margin-bottom: 56px;
        }

        .waitlist-head {
          margin-bottom: 16px;
        }

        .hero-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          position: relative;
        }

        .waitlist-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        .waitlist-input {
          height: 44px;
          padding: 0 14px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.35);
          background: rgba(2, 6, 23, 0.35);
          color: #f9fafb;
          outline: none;
          min-width: 160px;
        }

        .waitlist-input::placeholder {
          color: rgba(209, 213, 219, 0.55);
        }

        .waitlist-input:focus {
          border-color: rgba(96, 165, 250, 0.9);
          box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.18);
        }

        .waitlist-select-wrap {
          position: relative;
          min-width: 160px;
          flex: 1;
        }

        .waitlist-select {
          width: 100%;
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          padding-right: 34px;
          background-image: none;
        }

        .waitlist-select-caret {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          pointer-events: none;
          opacity: 0.7;
          color: #e2e8f0;
          font-size: 12px;
          line-height: 1;
        }

        .hero-note {
          font-size: 12px;
          color: #9ca3af;
          margin: 8px 0 0;
        }

        .waitlist-more {
          margin-top: 12px;
        }

        .waitlist-more summary {
          cursor: pointer;
          color: #cbd5e1;
          font-size: 13px;
        }

        .waitlist-more-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 10px;
        }

        .section {
          margin-bottom: 56px;
        }

        .section h2 {
          font-size: 26px;
          margin-bottom: 18px;
        }

        .section-intro {
          margin-top: 0;
          margin-bottom: 24px;
          color: #d1d5db;
        }

        .grid-3 {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 20px;
        }

        .card {
          background: rgba(15, 23, 42, 0.95);
          border-radius: 16px;
          padding: 18px 18px 16px;
          border: 1px solid rgba(31, 41, 55, 0.9);
          font-size: 14px;
          color: #d1d5db;
        }

        .card h3 {
          margin-top: 0;
          margin-bottom: 8px;
          color: #e5e7eb;
          font-size: 16px;
        }

        .pricing-card {
          max-width: 520px;
          background: radial-gradient(
              circle at top left,
              rgba(96, 165, 250, 0.35),
              transparent 55%
            ),
            rgba(15, 23, 42, 0.98);
          border-radius: 20px;
          padding: 22px 22px 20px;
          border: 1px solid rgba(148, 163, 184, 0.45);
          box-shadow: 0 18px 50px rgba(15, 23, 42, 0.95);
          font-size: 14px;
        }

        .pricing-card h3 {
          margin: 0 0 6px;
          font-size: 18px;
        }

        .price {
          margin: 0 0 12px;
          color: #d1d5db;
        }

        .price span {
          font-size: 24px;
          font-weight: 700;
          color: #f9fafb;
        }

        .pricing-card ul {
          padding-left: 18px;
          margin: 0 0 14px;
          color: #d1d5db;
        }

        .pricing-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
          margin-bottom: 10px;
        }

        .pricing-note {
          font-size: 12px;
          color: #9ca3af;
          margin: 0;
        }

        .footer {
          border-top: 1px solid rgba(31, 41, 55, 0.9);
          padding-top: 18px;
          margin-top: 24px;
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: space-between;
          font-size: 12px;
          color: #9ca3af;
          align-items: center;
        }

        .footer-links {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .footer-links a {
          color: rgba(226, 232, 240, 0.9);
          text-decoration: none;
          opacity: 0.85;
        }

        .footer-links a:hover {
          opacity: 1;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        @media (max-width: 900px) {
          .hero {
            grid-template-columns: minmax(0, 1fr);
          }

          .demo-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .grid-3 {
            grid-template-columns: minmax(0, 1fr);
          }

          .waitlist-more-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .roadmap-matrix {
            grid-template-columns: minmax(0, 1fr);
          }

          .page {
            padding: 24px 18px 40px;
          }

          .nav-links {
            display: none;
          }

          .nav-actions {
            gap: 10px;
          }
        }
      `}</style>
    </>
  );
}
