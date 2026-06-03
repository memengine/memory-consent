import Link from "next/link";

export default function HomePage() {
  const showDeveloperPlayground = process.env.NEXT_PUBLIC_ENABLE_DEVELOPER_PLAYGROUND === "true";

  return (
    <main className="landing-page">
      <section className="landing-shell">
        <div className="landing-copy">
          <span className="pill">MemoryOS Consent</span>
          <h1>Control how apps access your AI memory</h1>
          <p>
            Apps should normally send you here with a consent link. If you want to review or revoke access, use the
            permission center.
          </p>
        </div>

        <div className="landing-card-grid">
          <section className="landing-card">
            <strong>Grant access from an app link</strong>
            <p>
              Open the full consent URL from the app that is requesting access. It should look like{" "}
              <code className="inline-route">/consent?agent_id=...&amp;redirect_uri=...</code>.
            </p>
            <Link href="/manage" className="landing-link">
              Open permission center
            </Link>
          </section>

          <section className="landing-card">
            <strong>Already using MemoryOS?</strong>
            <p>Sign in with email and OTP to view active permissions, revoke access, or delete your data.</p>
            <Link href="/manage" className="landing-link">
              Go to manage
            </Link>
          </section>

          {showDeveloperPlayground ? (
            <section className="landing-card">
              <strong>Testing cross-agent memory?</strong>
              <p>
                Use the developer playground to add and retrieve universal memories with a UUI token and global-agent API
                key. It shows the exact headers your backend should send.
              </p>
              <Link href="/playground" className="landing-link">
                Open playground
              </Link>
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
