"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { registerIdentity } from "@/lib/api";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "32px 20px",
};

const shellStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 720,
  borderRadius: 28,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(148,163,184,0.28)",
  boxShadow: "0 28px 80px rgba(15,23,42,0.12)",
  padding: 32,
  display: "grid",
  gap: 20,
};

const fieldStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 16,
  border: "1px solid #cbd5e1",
  background: "#fff",
  padding: "14px 16px",
  fontSize: 16,
  color: "#0f172a",
};

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await registerIdentity({
        email: email.trim(),
        display_name: displayName.trim() || undefined,
      });
      setSuccess(
        response.data.message ||
          "Account created. Check your email for the login code, then continue in consent or manage.",
      );
    } catch (registerError) {
      const message =
        registerError instanceof Error ? registerError.message : "Unable to create your MemoryOS account.";
      if (message.toLowerCase().includes("already exists")) {
        setError(
          "This email already has a MemoryOS account. Use the consent or manage page to sign in with email and OTP instead of registering again.",
        );
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={pageStyle}>
      <section style={shellStyle}>
        <div style={{ display: "grid", gap: 10 }}>
          <span
            style={{
              display: "inline-flex",
              width: "fit-content",
              borderRadius: 999,
              padding: "6px 12px",
              background: "#dbeafe",
              color: "#1d4ed8",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            Memory Passport
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 3.25rem)", lineHeight: 1.04 }}>
            Create your MemoryOS account
          </h1>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.65, color: "#475569" }}>
            This page is optional. New users can also create an account inline during the consent flow.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              style={fieldStyle}
            />
          </label>

          <label style={{ display: "grid", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Display name (optional)</span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="How should MemoryOS refer to you?"
              style={fieldStyle}
            />
          </label>

          {error ? (
            <div
              style={{
                borderRadius: 16,
                border: "1px solid #fecaca",
                background: "#fff1f2",
                color: "#9f1239",
                padding: 14,
              }}
            >
              {error}
            </div>
          ) : null}

          {success ? (
            <div
              style={{
                borderRadius: 16,
                border: "1px solid #bbf7d0",
                background: "#f0fdf4",
                color: "#166534",
                padding: 14,
              }}
            >
              {success}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            style={{
              borderRadius: 16,
              border: "1px solid #2563eb",
              background: "#2563eb",
              color: "#fff",
              padding: "14px 18px",
              fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => router.push("/consent")}
            style={{
              borderRadius: 16,
              border: "1px solid #cbd5e1",
              background: "#fff",
              padding: "14px 16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Go to consent
          </button>
          <button
            type="button"
            onClick={() => router.push("/manage")}
            style={{
              borderRadius: 16,
              border: "1px solid #cbd5e1",
              background: "#fff",
              padding: "14px 16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Go to manage
          </button>
        </div>
      </section>
    </main>
  );
}
