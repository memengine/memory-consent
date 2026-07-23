import Link from "next/link";

const trustPoints = ["Category-level access", "Read-only by default", "Revoke anytime"];

export default function HomePage() {
  const showDeveloperPlayground = process.env.NEXT_PUBLIC_ENABLE_DEVELOPER_PLAYGROUND === "true";

  return (
    <main className="landing-page consent-entry-page">
      <section className="consent-entry-shell">
        <header className="consent-entry-header">
          <div className="consent-entry-brand" aria-label="MemoryOS Consent Center">
            <span className="consent-entry-mark">M</span>
            <span>
              <strong>MemoryOS</strong>
              <small>Consent Center</small>
            </span>
          </div>
          <div className="consent-entry-status">
            <span aria-hidden="true" />
            User-controlled access
          </div>
        </header>

        <div className="consent-entry-hero">
          <div className="consent-entry-copy">
            <span className="consent-entry-eyebrow">Memory Passport permissions</span>
            <h1>Your memory.<br />Your decision.</h1>
            <p>
              Review which AI apps can use your saved context, choose exactly what they can read,
              and take access back whenever you want.
            </p>

            <div className="consent-entry-actions">
              <Link href="/manage" className="landing-link primary consent-entry-primary">
                Open permission center <span aria-hidden="true">→</span>
              </Link>
              {showDeveloperPlayground ? (
                <Link href="/playground" className="landing-link secondary">
                  Developer playground
                </Link>
              ) : null}
            </div>

            <ul className="consent-entry-trust" aria-label="Consent protections">
              {trustPoints.map((point) => (
                <li key={point}><span aria-hidden="true">✓</span>{point}</li>
              ))}
            </ul>
          </div>

          <aside className="permission-preview" aria-label="Example permission request">
            <div className="permission-preview-topbar">
              <span><i /> Permission request</span>
              <small>MemoryOS verified</small>
            </div>

            <div className="permission-preview-app">
              <span className="permission-preview-logo">SB</span>
              <span>
                <small>Study Buddy is requesting access</small>
                <strong>Help me personalize learning</strong>
              </span>
              <b>Verified</b>
            </div>

            <div className="permission-preview-section">
              <span className="permission-preview-label">Requested categories</span>
              <div className="permission-preview-categories">
                <span className="is-allowed">Preferences <b>✓</b></span>
                <span className="is-allowed">Goals <b>✓</b></span>
                <span>Facts <b>−</b></span>
              </div>
            </div>

            <div className="permission-preview-note">
              <span aria-hidden="true">◆</span>
              <p><strong>Nothing is shared yet.</strong><small>You approve before this app can read anything.</small></p>
            </div>

            <div className="permission-preview-actions" aria-hidden="true">
              <span>Not now</span>
              <strong>Approve selected access</strong>
            </div>
          </aside>
        </div>

        <section className="consent-entry-flow" aria-label="How MemoryOS consent works">
          <div className="consent-entry-flow-heading">
            <span>How it works</span>
            <strong>One clear decision between your memory and every AI app.</strong>
          </div>
          <ol>
            <li>
              <span>01</span>
              <div><strong>An app asks</strong><p>You arrive through a secure consent link with the app identity and requested categories.</p></div>
            </li>
            <li>
              <span>02</span>
              <div><strong>You choose</strong><p>Review the request, remove categories, and decide how long access should last.</p></div>
            </li>
            <li>
              <span>03</span>
              <div><strong>You stay in control</strong><p>Inspect, edit, or revoke permissions later from your Memory Passport.</p></div>
            </li>
          </ol>
        </section>
      </section>
    </main>
  );
}
