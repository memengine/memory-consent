import Link from "next/link";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  padding: "32px 20px 48px",
};

const shellStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 980,
  borderRadius: 28,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(148,163,184,0.28)",
  boxShadow: "0 28px 80px rgba(15,23,42,0.12)",
  padding: 32,
  display: "grid",
  gap: 24,
};

const cardStyle: React.CSSProperties = {
  borderRadius: 24,
  border: "1px solid #dbeafe",
  background: "#f8fbff",
  padding: 24,
  display: "grid",
  gap: 12,
};

const linkStyle: React.CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 16,
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#fff",
  padding: "14px 18px",
  fontWeight: 700,
  textDecoration: "none",
};

export default function HomePage() {
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
            MemoryOS Consent
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(2.2rem, 5vw, 4rem)", lineHeight: 1.04 }}>
            Control how apps access your AI memory
          </h1>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.65, color: "#475569" }}>
            Apps should normally send you here with a consent link. If you want to review or revoke access,
            use the permission center.
          </p>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          <section style={cardStyle}>
            <strong style={{ fontSize: 22 }}>Grant access from an app link</strong>
            <p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>
              Open the full consent URL from the app that is requesting access. It should look like
              <code style={{ marginLeft: 6 }}>/consent?agent_id=...&amp;redirect_uri=...</code>.
            </p>
            <Link href="/manage" style={linkStyle}>
              Open permission center
            </Link>
          </section>

          <section style={cardStyle}>
            <strong style={{ fontSize: 22 }}>Already using MemoryOS?</strong>
            <p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>
              Sign in with email and OTP to view active permissions, revoke access, or delete your data.
            </p>
            <Link href="/manage" style={linkStyle}>
              Go to manage
            </Link>
          </section>
        </div>
      </section>
    </main>
  );
}
