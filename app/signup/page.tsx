"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = supabaseBrowser();

      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      // Send user back to login after signup
      router.push("/login");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Signup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>Create account</h1>
      <p style={{ opacity: 0.8, marginBottom: 12 }}>
        Start replying to reviews with confidence.
      </p>

      <form onSubmit={onSignup} style={{ display: "grid", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          autoComplete="email"
          required
          style={inputStyle}
        />

        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete="new-password"
          required
          style={inputStyle}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(148,163,184,0.35)",
            background: "rgba(15,23,42,0.7)",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Creating…" : "Create account"}
        </button>

        {error ? <div style={{ color: "#ffb3b3" }}>{error}</div> : null}

        <div style={{ marginTop: 6, opacity: 0.85 }}>
          <a href="/login" style={{ color: "inherit", textDecoration: "underline" }}>
            Back to login
          </a>
        </div>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.7)",
  color: "inherit",
  outline: "none",
};
