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
  const [success, setSuccess] = useState<string>("");

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) throw error;

      setSuccess("Account created. You can log in now.");
      router.push("/login");
    } catch (err: any) {
      setError(err?.message || "Signup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 6 }}>Create account</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Start replying to reviews with confidence.
      </p>

      <form onSubmit={onSignup} style={{ display: "grid", gap: 10, marginTop: 16 }}>
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

        <button disabled={loading} style={buttonStyle}>
          {loading ? "Creating…" : "Create account"}
        </button>

        {error && <div style={{ color: "#ffb3b3" }}>{error}</div>}
        {success && <div style={{ color: "green" }}>{success}</div>}

        <div style={{ fontSize: 14, opacity: 0.9 }}>
          <a href="/login">Back to login</a>
        </div>
      </form>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.15)",
};

const buttonStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(0,0,0,0.12)",
  cursor: "pointer",
  fontWeight: 600,
};
