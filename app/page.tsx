"use client";

import React, { useRef, useState } from "react";

export default function Home() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
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

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          businessName,
          businessType,
          locationsCount,
          units: locationsCount, // ✅ TEMP compatibility for old backend
          role,
          city,
          website,

          // ✅ Bot-signal fields (harmless if ignored downstream)
          companyWebsite,
          formElapsedMs: elapsedMs,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error ?? "Something went wrong. Please try again.");
      }

      setStatus("success");
      setName("");
      setEmail("");
      setBusinessName("");
      setBusinessType("");
      setLocationsCount("");
      setRole("");
      setCity("");
      setWebsite("");

      // reset bot fields + timer
      setCompanyWebsite("");
      formRenderedAtRef.current = Date.now();
    } catch (err: any) {
      setStatus("error");
      setErrorMessage(err?.message || "Something went wrong. Please try again.");
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
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
          </nav>

          <a href="#waitlist" className="nav-cta">
            Get early access
          </a>
        </header>

        <section id="waitlist" className="hero">
          <div className="hero-text">
            <h1>
              Turn online reviews into
              <br />
              <span className="accent"> more bookings &amp; revenue.</span>
            </h1>

            <p className="hero-subtitle">
              Review Concierge AI monitors, responds to, and analyzes guest
              reviews across major platforms for you—so you can protect your
              reputation and focus on running your business.
            </p>

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

                  <select
                    value={businessType}
                    onChange={(e) => setBusinessType(e.target.value)}
                    className="waitlist-input"
                    required
                  >
                    <option value="">Business type *</option>
                    <option value="Winery">Winery</option>
                    <option value="Restaurant">Restaurant</option>
                    <option value="Bar">Bar</option>
                    <option value="Cafe">Cafe</option>
                    <option value="Nightclub">Nightclub</option>
                    <option value="Tour Operator">Tour Operator</option>
                  </select>

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
          </div>

          <div className="hero-card">
            <h2>Live review inbox</h2>
            <p>
              See new reviews from Booking.com, Airbnb, Google, and more in one
              place.
            </p>
            <ul>
              <li>AI-drafted responses in your tone of voice</li>
              <li>Priority alerts for negative or urgent reviews</li>
              <li>Suggested make-good offers to save at-risk guests</li>
            </ul>
          </div>
        </section>

        <section className="section" id="how-it-works">
          <h2>How it works</h2>
          <div className="grid-3">
            <div className="card">
              <h3>1. Connect your channels</h3>
              <p>
                Securely connect Airbnb, Booking.com, Google, and other OTAs in a
                few clicks—no IT team required.
              </p>
            </div>
            <div className="card">
              <h3>2. Train your tone</h3>
              <p>
                Tell Review Concierge how you like to speak with guests and upload
                a few example replies. We’ll match your style.
              </p>
            </div>
            <div className="card">
              <h3>3. Approve &amp; automate</h3>
              <p>
                Start with human-in-the-loop approvals, then automate replies for
                simple 4–5⭐ reviews once you’re confident.
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <h2>Built for busy hospitality operators</h2>
          <div className="grid-3">
            <div className="card">
              <h3>Unified review inbox</h3>
              <p>
                Stop hopping between tabs. See every review across platforms in a
                single, clean queue.
              </p>
            </div>
            <div className="card">
              <h3>AI reply assistant</h3>
              <p>
                Smart, on-brand drafts you can approve with one click—no robotic
                copy, no generic templates.
              </p>
            </div>
            <div className="card">
              <h3>Reputation analytics</h3>
              <p>
                Spot patterns in guest feedback: cleaning issues, check-in
                friction, amenity gaps, and more.
              </p>
            </div>
          </div>
        </section>

        <section className="section" id="pricing">
          <h2>Early-access pricing</h2>
          <p className="section-intro">
            We’re inviting a small group of hosts &amp; operators into our private
            beta.
          </p>
          <div className="pricing-card">
            <h3>Founding Partner</h3>
            <p className="price">
              From <span>$49</span> / month
            </p>
            <ul>
              <li>Includes up to 10 listings / locations</li>
              <li>Unlimited review monitoring &amp; AI replies</li>
              <li>Priority feature requests &amp; roadmap input</li>
              <li>Founding-partner pricing locked in for life</li>
            </ul>
            <a className="primary-btn" href="#waitlist">
              Join the waitlist
            </a>
            <p className="pricing-note">
              No credit card today. We’ll reach out to learn about your portfolio
              before inviting you in.
            </p>
          </div>
        </section>

        <footer className="footer">
          <p>© {new Date().getFullYear()} Review Concierge.ai</p>
          <p className="footer-note">
            Built for hosts, hotel operators, and property managers who care about
            their guests.
          </p>
        </footer>
      </main>

      <style jsx global>{`
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

        .nav-cta {
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

        .hero {
          display: grid;
          grid-template-columns: minmax(0, 1.9fr) minmax(360px, 1.1fr);
          gap: 48px;
          align-items: center;
          margin-bottom: 64px;
        }

        .hero-text {
          position: relative;
          z-index: 2;
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
          margin: 0 0 24px;
          color: #d1d5db;
          max-width: 520px;
        }

        .hero-actions {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          position: relative;
        }

        .primary-btn {
          height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 22px;
          border-radius: 999px;
          white-space: nowrap;
          min-width: 210px;
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

        .hero-note {
          font-size: 12px;
          color: #9ca3af;
        }

        .hero-card h2 {
          margin-top: 0;
          margin-bottom: 6px;
          font-size: 18px;
        }

        .hero-card p {
          margin-top: 0;
          margin-bottom: 10px;
          color: #d1d5db;
        }

        .hero-card ul {
          padding-left: 18px;
          margin: 0;
          color: #9ca3af;
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
          max-width: 420px;
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
          font-size: 22px;
          font-weight: 600;
          color: #f9fafb;
        }

        .pricing-card ul {
          padding-left: 18px;
          margin: 0 0 14px;
          color: #d1d5db;
        }

        .pricing-note {
          font-size: 12px;
          color: #9ca3af;
        }

        .footer {
          border-top: 1px solid rgba(31, 41, 55, 0.9);
          padding-top: 18px;
          margin-top: 24px;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: space-between;
          font-size: 12px;
          color: #9ca3af;
        }

        .footer-note {
          margin: 0;
        }

        @media (max-width: 900px) {
          .hero {
            grid-template-columns: minmax(0, 1fr);
          }

          .hero-card {
            order: -1;
          }

          .grid-3 {
            grid-template-columns: minmax(0, 1fr);
          }

          .page {
            padding: 24px 18px 40px;
          }
        }
      `}</style>
    </>
  );
}
