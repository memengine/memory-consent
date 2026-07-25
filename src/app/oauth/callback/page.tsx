"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

function OAuthCallbackContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const callback = new URL(`${API_BASE}/v1/uui/oauth/callback`, window.location.origin);
    for (const key of ["code", "state", "error"]) {
      const value = searchParams.get(key);
      if (value) callback.searchParams.set(key, value);
    }
    window.location.replace(callback.toString());
  }, [searchParams]);

  return (
    <main className="consent-page">
      <section className="compact-status-shell">
        <span className="status-spinner" aria-hidden="true" />
        <div>
          <h1>Verifying your account</h1>
          <p>MemoryOS is completing the secure handoff with the organisation.</p>
        </div>
      </section>
    </main>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackContent />
    </Suspense>
  );
}
