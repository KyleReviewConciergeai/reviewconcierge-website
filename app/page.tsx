"use client";

import React, { useEffect, useRef, useState } from "react";

export default function Home() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [businessTypeOther, setBusinessTypeOther] = useState("");
  const [locationsCount, setLocationsCount] = useState("");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [website, setWebsite] = useState("");

  // ✅ Honeypot (bots often fill hidden fields; humans won't)
  const [companyWebsite, setCompanyWebsite] = useState("");

  // ✅ Timing (bots submit instantly; humans take a moment)
  const formRenderedAtRef = useRef<number>(Date.now());

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState("");

  const isOther = businessType === "Other";

  // ✅ If user switches away from "Other", clear the "Other" textbox
  useEffect(() => {
    if (!isOther && businessTypeOther !== "") setBusinessTypeOther("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessType]);

  async function handleWaitlistSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    // ✅ Bot protection: Honeypot
    if (companyWebsite.trim().length > 0) {
      setStatus("error");
      setErrorMessage("Something went wrong. Please try again.");
      return;
    }

    // ✅ Bot protection: Timing (minimum 3 seconds on page)
    const elapsedMs = Date.now() - formRenderedAtRef.current;
    if (elapsedMs < 3000) {
      setStatus("error");
      setErrorMessage("Please wait a moment and try again.");
      return;
    }

    // ✅ Frontend validation: if "Other" is selected, require text
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
          units: locationsCount, // ✅ TEMP compatibility for old backend
          role,
          city,
          website,

          // ✅ Bot-signal fields
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

      // reset bot fields + timer
      setCompanyWebsite("");
      formRenderedAtRef.current = Date.now();
    } catch (err: unknown) {
      setStatus("error");
      if (err instanceof Error) setErrorMessage(err.message);
      else setErrorMessage("Something went wrong. Please try again.");
    }
  }

  return (
    <>
      <main className="page">
        <header className="nav">
          <div className="logo">
            Review Concierge<span>.ai</span>
          </div>

          <nav className="nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#features">What it does</a>
            <a href="#pricing">Pricing</a>
          </nav>

          {/* ✅ Primary CTAs */}
          <div className="nav-actions">
            <a className="nav-link" href="/login">
              Log in
            </a>
            <a className="nav-primary" href="/signup">
              Get started
            </a>
          </div>
        </header>

        {/* Hero */}
        <section className="hero">
          <div className="hero-text">
            <div className="badge">
              Owner-voice replies • AI drafts • You stay in control
            </div>

            <h1>
              Reply to reviews in your voice
              <br />
              <span className="accent">in minutes — not hours.</span>
            </h1>

            <p className="hero-subtitle">
              Review Concierge drafts short, human replies that sound like you — so you can
              respond fast without giving up control or sounding generic.
              <br />
              <span style={{ opacity: 0.85 }}>
                Draft thoughtful replies to reviews in English, Spanish, Portuguese, French,
                Italian, and German.
              </span>
            </p>

            <div className="hero-ctas">
              <a className="primary-btn" href="/signup">
                Get started
              </a>
              <a className="secondary-btn" href="#waitlist">
                Join waitlist
              </a>
              <div className="cta-note">
                Already have an account? <a href="/login">Log in</a>
              </div>
            </div>

            <div className="hero-micro">
              <div className="micro-item">
                <div className="micro-title">Today</div>
                <div className="micro-text">
                  Connect a Google Place ID • Sync a recent sample of reviews • Generate
                  reply drafts you can copy, tweak (optional), and post manually.
                </div>
              </div>
              <div className="micro-item">
                <div className="micro-title">Next</div>
                <div className="micro-text">
                  Deeper voice training, multilingual replies, and direct integration with Google Business Profile for importing reviews — so all your reviews appear in one place, ready for thoughtful replies.
                </div>
              </div>
            </div>
          </div>

          {/* Right-side card */}
          <div className="hero-card">
            <h2>Draft replies that sound like you</h2>
            <p>
              Pull recent Google reviews into one place and generate owner-voice drafts you can post in minutes.
            </p>
            <ul>
              <li>Connect your Google Place ID</li>
              <li>Sync a recent sample of reviews</li>
              <li>Generate a reply draft in your voice</li>
              <li>Copy, lightly edit (optional), and post manually</li>
              <li>Never auto-posts</li>
            </ul>

            <div className="card-divider" />

            <div className="card-foot">
              <div className="card-foot-title">Coming soon</div>
              <div className="card-foot-text">
                Better voice training, multilingual support, and workflows for teams and multi-location groups.
              </div>
            </div>
          </div>
        </section>

        {/* ✅ Small separation so waitlist is clearly secondary */}
        <div className="section-divider" />

        {/* Waitlist (kept as secondary CTA) */}
        <section id="waitlist" className="waitlist-section">
          <div className="waitlist-head">
            <h2>Join the beta waitlist</h2>
            <p className="section-intro" style={{ marginBottom: 0 }}>
              Not ready to create an account yet? Join the waitlist and we’ll reach out when slots open.
            </p>
          </div>

          <div className="hero-actions">
            <form onSubmit={handleWaitlistSubmit} className="waitlist-form">
              {/* ✅ Honeypot field (hidden from humans) */}
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
                  placeholder="Business name *"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="waitlist-input"
                  required
                />

                {/* ✅ Styled select wrapper + custom caret */}
                <div className="waitlist-select-wrap">
                  <select
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className="waitlist-input waitlist-select"
                    required
                    style={{
                      color: businessType ? "#f9fafb" : "rgba(209, 213, 219, 0.55)",
                    }}
                  >
                    <option value="" disabled>
                      Business type *
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
                  placeholder="Work email *"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="waitlist-input"
                  required
                />

                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="# of locations *"
                  value={locationsCount}
                  onChange={(e) => setLocationsCount(e.target.value.replace(/\D/g, ""))}
                  className="waitlist-input"
                  required
                />

                <button
                  type="submit"
                  className="primary-btn"
                  disabled={status === "loading"}
                >
                  {status === "loading" ? "Joining..." : "Join the beta waitlist"}
                </button>
              </div>

              <details className="waitlist-more">
                <summary>More (optional)</summary>

                <div className="waitlist-more-grid">
                  <input
                    type="text"
                    placeholder="Name (optional)"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="waitlist-input"
                  />

                  <input
                    type="text"
                    placeholder="Your role (optional)"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="waitlist-input"
                  />

                  <input
                    type="text"
                    placeholder="City (optional)"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="waitlist-input"
                  />

                  <input
                    type="text"
                    placeholder="Website or Instagram (optional)"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    className="waitlist-input"
                  />
                </div>
              </details>

              {status === "success" && (
                <p className="hero-note">You’re in! We’ll email you when slots open.</p>
              )}

              {status === "error" && (
                <p className="hero-note" style={{ color: "#ffb3b3" }}>
                  {errorMessage}
                </p>
              )}

              {status === "idle" && (
                <p className="hero-note">No spam. Early access invites only.</p>
              )}
            </form>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <h2>How it works</h2>
          <div className="grid-3">
            <div className="card">
              <h3>1. Create an account</h3>
              <p>Sign up in seconds. No call. No setup fees.</p>
            </div>
            <div className="card">
              <h3>2. Connect Google</h3>
              <p>Add your Google Place ID and confirm your business. Subscription enables sync.</p>
            </div>
            <div className="card">
              <h3>3. Draft &amp; post</h3>
              <p>Generate replies you can copy/paste into Google. You stay in control.</p>
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <h2>What it does (and doesn’t)</h2>
          <div className="grid-3">
            <div className="card">
              <h3>Owner-voice drafts</h3>
              <p>Short, human replies that feel like they were written by the owner — not a bot.</p>
            </div>
            <div className="card">
              <h3>Human control</h3>
              <p>Review Concierge drafts. You decide. No auto-posting, no automation that risks your reputation.</p>
            </div>
            <div className="card">
              <h3>Multilingual replies</h3>
              <p>
                Reviews come in many languages. Review Concierge drafts replies in your
                preferred language first — then translates them for the guest when needed.
              </p>
              <p>
                This preserves your voice across languages while helping you respond to
                global customers.
              </p>
              <p>
                Supported languages: English, Spanish, Portuguese, French, Italian, and
                German.
              </p>
            </div>

            <div className="card">
              <h3>Lightweight workflow</h3>
              <p>See reviews, draft replies, copy/paste. Everything else stays out of your way.</p>
            </div>
          </div>
        </section>

        <section className="section" id="pricing">
          <h2>Early-access pricing</h2>
          <p className="section-intro">
            Simple subscription to enable Google sync. Join the waitlist if you’re not ready yet.
          </p>

          <div className="pricing-card">
            <h3>Early Access</h3>
            <p className="price">
              <span>$49</span> / month
            </p>
            <ul>
              <li>Enable Google sync (recent sample)</li>
              <li>Reply drafting inside the dashboard</li>
              <li>Priority support + roadmap input</li>
              <li>Multilingual support coming soon</li>
            </ul>

            <div className="pricing-actions">
              <a className="primary-btn" href="/signup">
                Get started
              </a>
              <a className="secondary-btn" href="#waitlist">
                Join waitlist
              </a>
            </div>

            <p className="pricing-note">
              Note: today uses Google Places “recent sample”. We focus on voice fidelity first — not feature bloat.
            </p>
          </div>
        </section>

        <footer className="footer">
          <p>© {new Date().getFullYear()} Review Concierge.ai</p>

          {/* ✅ Legal / trust links */}
          <div className="footer-links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
            <a href="/refunds">Refunds</a>
            <a href="/cookies">Cookies</a>
            <a href="/security">Security</a>
            <a href="/contact">Contact</a>
          </div>

          <div className="footer-links">
            <a href="/login">Log in</a>
            <a href="/signup">Get started</a>
            <a href="#waitlist">Join waitlist</a>
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

        .hero-text h1 {
          font-size: 40px;
          line-height: 1.1;
          margin: 0 0 16px;
        }

        .accent {
          color: #60a5fa;
        }

        .hero-subtitle {
          margin: 0 0 18px;
          color: #d1d5db;
          max-width: 560px;
        }

        .hero-ctas {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 18px;
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

        .hero-micro {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 10px;
          max-width: 640px;
        }

        .micro-item {
          border: 1px solid rgba(148, 163, 184, 0.25);
          background: rgba(2, 6, 23, 0.25);
          border-radius: 14px;
          padding: 12px 12px;
        }

        .micro-title {
          font-size: 12px;
          font-weight: 700;
          color: rgba(226, 232, 240, 0.92);
          margin-bottom: 6px;
        }

        .micro-text {
          font-size: 12px;
          color: rgba(209, 213, 219, 0.85);
          line-height: 1.4;
        }

        .card-divider {
          height: 1px;
          background: rgba(148, 163, 184, 0.25);
          margin: 14px 0;
        }

        .card-foot-title {
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 6px;
          color: rgba(226, 232, 240, 0.92);
        }

        .card-foot-text {
          font-size: 12px;
          color: rgba(209, 213, 219, 0.85);
          line-height: 1.4;
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
          font-weight: 500;
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

        /* ✅ Select styling so it matches inputs on iOS/Safari */
        .waitlist-select-wrap {
          position: relative;
          min-width: 160px;
        }

        .waitlist-select {
          appearance: none;
          -webkit-appearance: none;
          -moz-appearance: none;
          padding-right: 34px; /* room for caret */
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

          .grid-3 {
            grid-template-columns: minmax(0, 1fr);
          }

          .waitlist-more-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .hero-micro {
            grid-template-columns: minmax(0, 1fr);
          }

          .page {
            padding: 24px 18px 40px;
          }

          .nav-links {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
