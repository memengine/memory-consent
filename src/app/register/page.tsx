"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { registerIdentity } from "@/lib/api";

const MANAGE_URL = (process.env.NEXT_PUBLIC_MEMORYOS_MANAGE_URL || "/manage").replace(/\/$/, "");

function tokenBackupText(token: string) {
  return [
    "MemoryOS Universal User Identity Token",
    "======================================",
    `Token: ${token}`,
    `Created: ${new Date().toISOString().slice(0, 10)}`,
    "======================================",
    "KEEP THIS SAFE. This token cannot be recovered.",
    "If lost, you will need to regenerate it.",
    `Regenerate at: ${MANAGE_URL}`,
  ].join("\n");
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [savedToken, setSavedToken] = useState(false);

  const backupText = useMemo(() => (token ? tokenBackupText(token) : ""), [token]);
  const mailtoHref = useMemo(() => {
    const subject = encodeURIComponent("My MemoryOS token - keep safe");
    const body = encodeURIComponent(backupText);
    return `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
  }, [backupText, email]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    setSubmitting(true);
    setError("");
    setToken("");
    setSavedToken(false);
    try {
      const response = await registerIdentity({
        email: email.trim(),
        display_name: displayName.trim() || undefined,
      });
      setToken(response.data.uui_token);
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
    <main className="consent-page">
      <section className="consent-shell register-shell">
        <div className="consent-hero-copy">
          <span className="pill">Memory Passport</span>
          <h1>Create your MemoryOS account</h1>
          <p>One identity for the memories and permissions you carry between AI products.</p>
        </div>

        <section className="passport-mode-grid" aria-label="How Memory Passport works">
          <article>
            <span className="mode-number">01</span>
            <div>
              <h2>Use it immediately</h2>
              <p>
                Passport-enabled AI agents can remember you across sessions as soon as you approve
                them. No organisation account is required.
              </p>
            </div>
          </article>
          <article>
            <span className="mode-number">02</span>
            <div>
              <h2>Connect existing accounts</h2>
              <p>
                Link supported bank, commerce, travel, education, or SaaS accounts from your
                permission center. You initiate every connection.
              </p>
            </div>
          </article>
        </section>

        {!token ? (
          <form onSubmit={handleSubmit} className="consent-card auth-card">
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </label>

            <label className="field">
              <span>Display name (optional)</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How should MemoryOS refer to you?"
                autoComplete="name"
              />
            </label>

            {error ? <div className="alert alert-danger">{error}</div> : null}

            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>
        ) : (
          <section className="consent-card token-backup-card">
            <div className="alert alert-danger token-warning">
              <strong>This token is shown ONCE and cannot be recovered.</strong>
              <span>Save it before closing this page.</span>
            </div>

            <pre className="token-display">{token}</pre>

            <div className="button-row">
              <button type="button" className="quiet-button" onClick={() => void navigator.clipboard.writeText(token)}>
                Copy token
              </button>
              <button
                type="button"
                className="quiet-button"
                onClick={() => downloadText("memoryos-token.txt", backupText)}
              >
                Download as .txt
              </button>
              <a className="quiet-button mailto-button" href={mailtoHref}>
                Email to myself
              </a>
            </div>

            <p className="muted-text">
              Email to myself opens your email client. MemoryOS does not store your email or send anything on your behalf.
            </p>

            <label className="checkbox-line">
              <input
                type="checkbox"
                checked={savedToken}
                onChange={(event) => setSavedToken(event.target.checked)}
              />
              <span>I have saved my token</span>
            </label>

            <button
              type="button"
              className="deny-button"
              disabled={!savedToken}
              onClick={() => router.push("/manage")}
            >
              I have saved my token
            </button>
            <p className="muted-text">
              Next, open Connections in your permission center to link supported organisations.
            </p>
          </section>
        )}

        <div className="button-row">
          <button type="button" className="quiet-button" onClick={() => router.push("/consent")}>
            Go to consent
          </button>
          <button type="button" className="quiet-button" onClick={() => router.push("/manage")}>
            Go to manage
          </button>
        </div>
      </section>
    </main>
  );
}
