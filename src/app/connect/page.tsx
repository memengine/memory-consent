"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

function ConnectContent() {
  const searchParams = useSearchParams();
  const orgId = searchParams.get("org_id");
  const agentId = searchParams.get("agent_id");
  const linkToken = searchParams.get("link_token");
  const consentHref = useMemo(() => {
    if (!agentId || !linkToken) return null;
    const params = new URLSearchParams({ agent_id: agentId, link_token: linkToken });
    return `/consent?${params.toString()}`;
  }, [agentId, linkToken]);

  return (
    <main className="consent-page">
      <section className="hosted-connect-shell">
        <div className="hosted-connect-brand">
          <span className="completion-mark">M</span>
          <div>
            <strong>MemoryOS</strong>
            <small>Memory Passport connection</small>
          </div>
        </div>
        <div className="section-heading">
          <span className="section-kicker">User-controlled connection</span>
          <h1>Connect without sharing a password</h1>
          <p>
            MemoryOS verifies the account handoff and keeps your organisation connection separate
            from the AI agents you approve.
          </p>
        </div>
        {consentHref ? (
          <>
            <div className="connection-safety-list">
              <span>The secure link is single-use and expires automatically.</span>
              <span>You sign in to MemoryOS with email and a one-time code.</span>
              <span>You choose the memory categories the requesting agent can read.</span>
            </div>
            <a className="primary-button hosted-connect-action" href={consentHref}>
              Review connection
            </a>
          </>
        ) : (
          <div className="alert alert-warning">
            This organisation has not supplied a valid one-time connection link. Return to its
            account settings and choose Connect Memory Passport again.
            {orgId ? <small> Organisation reference: {orgId}</small> : null}
          </div>
        )}
        <a className="quiet-button hosted-connect-action" href="/manage?tab=connections">
          Open my permission center
        </a>
      </section>
    </main>
  );
}

export default function ConnectPage() {
  return (
    <Suspense fallback={null}>
      <ConnectContent />
    </Suspense>
  );
}
