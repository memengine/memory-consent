"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

function CompletionContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "unknown";
  const state = searchParams.get("state") || "";
  const error = searchParams.get("error") || "";

  const copy = useMemo(() => {
    if (status === "granted") {
      return {
        tone: "success",
        eyebrow: "Access granted",
        title: "Memory connected",
        body: "This app can now use the memory categories you approved. You can close this page and return to the app.",
      };
    }
    if (status === "denied") {
      return {
        tone: "warning",
        eyebrow: "Access not granted",
        title: "No permission was created",
        body: "You denied or cancelled the request. The app cannot read your MemoryOS memory.",
      };
    }
    return {
      tone: "neutral",
      eyebrow: "Consent finished",
      title: "MemoryOS returned a result",
      body: error || "The consent flow finished, but the result status was not recognized.",
    };
  }, [error, status]);

  return (
    <main className="consent-page">
      <section className="completion-shell">
        <div className="completion-brand">
          <span className="completion-mark">M</span>
          <span>MemoryOS</span>
        </div>
        <div className={`completion-status ${copy.tone}`}>
          <span className="section-kicker">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
        </div>

        <div className="completion-details" aria-label="Consent result details">
          <div>
            <span>Status</span>
            <strong>{status}</strong>
          </div>
          {state ? (
            <div>
              <span>State</span>
              <strong>{state}</strong>
            </div>
          ) : null}
          {error ? (
            <div>
              <span>Error</span>
              <strong>{error}</strong>
            </div>
          ) : null}
        </div>

        <div className="button-row">
          <Link className="primary-button" href="/manage">
            Manage permissions
          </Link>
          <button className="quiet-button" type="button" onClick={() => window.close()}>
            Close page
          </button>
        </div>

        <p className="completion-note">
          If this page does not close automatically, return to the app where you started the MemoryOS connection.
        </p>
      </section>
    </main>
  );
}

export default function CompletionPage() {
  return (
    <Suspense fallback={<main className="consent-page">Loading completion result...</main>}>
      <CompletionContent />
    </Suspense>
  );
}
