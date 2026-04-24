"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  createGrant,
  getCurrentSessionUser,
  getGlobalAgentProfile,
  persistSessionToken,
  registerIdentity,
  sendLoginCode,
  verifyLoginCode,
  type GlobalAgentProfile,
  type MemoryCategory,
  type SessionUser,
} from "@/lib/api";

const ALL_CATEGORIES: MemoryCategory[] = [
  "preference",
  "fact",
  "goal",
  "procedure",
  "relationship",
  "expertise",
];

const CATEGORY_META: Record<MemoryCategory, { label: string; detail: string }> = {
  preference: {
    label: "Your preferences and settings",
    detail: "Communication style, defaults, and how you like your tools to behave.",
  },
  expertise: {
    label: "Your skills and knowledge",
    detail: "Topics, tools, and domains you know well.",
  },
  goal: {
    label: "Your goals and plans",
    detail: "What you are trying to accomplish over time.",
  },
  procedure: {
    label: "Your workflows and habits",
    detail: "How you prefer to work through recurring tasks.",
  },
  fact: {
    label: "General facts about you",
    detail: "Stable profile facts that help apps personalize correctly.",
  },
  relationship: {
    label: "Your relationships and context",
    detail: "People, teams, and collaboration context you choose to share.",
  },
};

type AuthMode = "signin" | "signup";
type AuthStep = "checking" | "email" | "otp" | "ready";
type DurationChoice = "30" | "90" | "365" | "forever" | "";

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  display: "flex",
  justifyContent: "center",
  padding: "32px 20px 48px",
};

const shellStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 1080,
  borderRadius: 28,
  background: "rgba(255,255,255,0.92)",
  border: "1px solid rgba(148,163,184,0.28)",
  boxShadow: "0 28px 80px rgba(15,23,42,0.12)",
  padding: 32,
  display: "grid",
  gap: 24,
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

function parseRedirect(searchParams: URLSearchParams) {
  return {
    agentId: searchParams.get("agent_id"),
    redirectUri: searchParams.get("redirect_uri"),
    state: searchParams.get("state"),
  };
}

function buildRedirectUri(redirectUri: string | null, status: "granted" | "denied", state: string | null) {
  if (!redirectUri) {
    const fallback = new URL("/manage", window.location.origin);
    fallback.searchParams.set("status", status);
    if (state) {
      fallback.searchParams.set("state", state);
    }
    return fallback.toString();
  }

  try {
    const target = new URL(redirectUri);
    target.searchParams.set("status", status);
    if (state) {
      target.searchParams.set("state", state);
    }
    return target.toString();
  } catch {
    return redirectUri;
  }
}

function computeExpiryIso(duration: DurationChoice): string | null {
  if (!duration || duration === "forever") {
    return null;
  }
  const expires = new Date();
  expires.setUTCDate(expires.getUTCDate() + Number(duration));
  return expires.toISOString();
}

function agentInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function ConsentPageContent() {
  const searchParams = useSearchParams();
  const { agentId, redirectUri, state } = useMemo(
    () => parseRedirect(searchParams),
    [searchParams],
  );

  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const [authStep, setAuthStep] = useState<AuthStep>("checking");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [otp, setOtp] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const submittedOtpRef = useRef<string | null>(null);

  const [profile, setProfile] = useState<GlobalAgentProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<MemoryCategory[]>([]);
  const [duration, setDuration] = useState<DurationChoice>("");
  const [consentError, setConsentError] = useState("");
  const [submittingConsent, setSubmittingConsent] = useState(false);
  const [grantedTo, setGrantedTo] = useState<string | null>(null);

  async function loadSession() {
    try {
      const response = await getCurrentSessionUser();
      setSessionUser(response.data);
      setAuthStep("ready");
      setAuthError("");
    } catch {
      setSessionUser(null);
      setAuthStep("email");
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (authStep !== "ready" || !agentId) {
      return;
    }
    let active = true;
    setProfileLoading(true);
    setConsentError("");

    void getGlobalAgentProfile(agentId)
      .then((response) => {
        if (!active) {
          return;
        }
        setProfile(response.data);
      })
      .catch((error) => {
        if (!active) {
          return;
        }
        setConsentError(error instanceof Error ? error.message : "Unable to load this app.");
      })
      .finally(() => {
        if (active) {
          setProfileLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [agentId, authStep]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    setSelectedCategories(profile.default_categories_requested ?? []);
  }, [profile]);

  useEffect(() => {
    if (authStep !== "otp") {
      submittedOtpRef.current = null;
      return;
    }
    if (otp.length < 6) {
      submittedOtpRef.current = null;
      return;
    }
    if (authLoading || submittedOtpRef.current === otp) {
      return;
    }
    submittedOtpRef.current = otp;
    void handleVerify();
  }, [otp, authLoading, authStep]);

  async function handleSendCode() {
    if (!email.trim()) {
      setAuthError("Enter your email to continue.");
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    try {
      const response = await sendLoginCode(email.trim());
      if (!response.data.sent) {
        setAuthError(
          response.data.reason === "rate_limited"
            ? "Too many login code requests. Try again in a little while."
            : "We could not send a login code right now.",
        );
        return;
      }
      setAuthStep("otp");
      setOtp("");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to send a login code.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleCreateAccount() {
    if (!email.trim()) {
      setAuthError("Email is required to create a MemoryOS account.");
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    try {
      await registerIdentity({
        email: email.trim(),
        display_name: displayName.trim() || undefined,
      });
      setAuthStep("otp");
      setOtp("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create your account.";
      if (message.toLowerCase().includes("already exists")) {
        setAuthMode("signin");
        setAuthStep("email");
        setAuthError(
          "This email already has a MemoryOS account. Use email login and we will send you a fresh login code.",
        );
        return;
      }
      setAuthError(message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerify() {
    if (otp.length !== 6 || authLoading) {
      return;
    }

    setAuthLoading(true);
    setAuthError("");
    try {
      const response = await verifyLoginCode({
        email: email.trim(),
        otp,
      });
      await persistSessionToken(response.data.session_token);
      submittedOtpRef.current = null;
      setOtp("");
      await loadSession();
    } catch (error) {
      submittedOtpRef.current = null;
      setOtp("");
      setAuthError(error instanceof Error ? error.message : "The login code was invalid.");
    } finally {
      setAuthLoading(false);
    }
  }

  function toggleCategory(category: MemoryCategory) {
    setSelectedCategories((current) =>
      current.includes(category)
        ? current.filter((value) => value !== category)
        : [...current, category],
    );
  }

  async function handleAllowAccess() {
    if (!agentId || selectedCategories.length === 0 || !duration) {
      return;
    }

    setSubmittingConsent(true);
    setConsentError("");
    try {
      await createGrant({
        agent_id: agentId,
        categories_allowed: selectedCategories,
        access_type: "read_only",
        expires_at: computeExpiryIso(duration),
      });
      const grantedName = profile?.name ?? "this app";
      setGrantedTo(grantedName);
      window.setTimeout(() => {
        window.location.href = buildRedirectUri(redirectUri, "granted", state);
      }, 2000);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : "Unable to save this permission.");
      setSubmittingConsent(false);
    }
  }

  function handleDeny() {
    window.location.href = buildRedirectUri(redirectUri, "denied", state);
  }

  const deniedCategories = ALL_CATEGORIES.filter((category) => !selectedCategories.includes(category));
  const allowDisabled =
    !profile ||
    !agentId ||
    selectedCategories.length === 0 ||
    !duration ||
    submittingConsent ||
    Boolean(grantedTo);

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
            Memory permissions
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(2.2rem, 5vw, 4rem)", lineHeight: 1.04 }}>
            Review this app&apos;s request
          </h1>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.65, color: "#475569" }}>
            MemoryOS stores your AI memory across apps. You control what each app can see.
          </p>
        </div>

        {!agentId ? (
          <div
            style={{
              borderRadius: 18,
              border: "1px solid #fecaca",
              background: "#fff1f2",
              color: "#9f1239",
              padding: 16,
              fontSize: 16,
            }}
          >
            Missing agent_id in the consent link.
          </div>
        ) : null}

        {authStep !== "ready" ? (
          <section
            style={{
              borderRadius: 24,
              border: "1px solid #dbeafe",
              background: "#f8fbff",
              padding: 24,
              display: "grid",
              gap: 18,
            }}
          >
            <div style={{ display: "grid", gap: 6 }}>
              <strong style={{ fontSize: 24 }}>Sign in to continue</strong>
              <span style={{ color: "#475569", fontSize: 15, lineHeight: 1.6 }}>
                Use your MemoryOS email to continue, or create an account inline if this is your first time.
              </span>
            </div>

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

            {authMode === "signup" ? (
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
            ) : null}

            {authStep === "otp" ? (
              <div style={{ display: "grid", gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>
                  Enter the 6-digit code we sent to {email}
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={otp}
                  onChange={(event) => {
                    const numeric = event.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtp(numeric);
                  }}
                  placeholder="123456"
                  style={{
                    ...fieldStyle,
                    letterSpacing: "0.35em",
                    textAlign: "center",
                    fontSize: 24,
                  }}
                />
                <button
                  type="button"
                  onClick={() => void handleVerify()}
                  disabled={otp.length !== 6 || authLoading}
                  style={{
                    borderRadius: 16,
                    border: "1px solid #2563eb",
                    background: "#2563eb",
                    color: "#fff",
                    padding: "14px 18px",
                    fontWeight: 700,
                    cursor: otp.length !== 6 || authLoading ? "not-allowed" : "pointer",
                    opacity: otp.length !== 6 || authLoading ? 0.65 : 1,
                  }}
                >
                  {authLoading ? "Verifying..." : "Verify"}
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void (authMode === "signup" ? handleCreateAccount() : handleSendCode())}
                  disabled={authLoading || !email.trim()}
                  style={{
                    borderRadius: 16,
                    border: "1px solid #2563eb",
                    background: "#2563eb",
                    color: "#fff",
                    padding: "14px 18px",
                    fontWeight: 700,
                    cursor: authLoading || !email.trim() ? "not-allowed" : "pointer",
                    opacity: authLoading || !email.trim() ? 0.65 : 1,
                  }}
                >
                  {authLoading
                    ? authMode === "signup"
                      ? "Creating account..."
                      : "Sending login code..."
                    : authMode === "signup"
                      ? "Create account"
                      : "Send login code"}
                </button>

                <div style={{ fontSize: 15, color: "#475569" }}>
                  {authMode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode(authMode === "signin" ? "signup" : "signin");
                      setAuthError("");
                    }}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: "#2563eb",
                      fontWeight: 700,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    {authMode === "signin" ? "Create one — takes 10 seconds" : "Use email login instead"}
                  </button>
                </div>
              </>
            )}

            {authError ? (
              <div
                style={{
                  borderRadius: 18,
                  border: "1px solid #fecaca",
                  background: "#fff1f2",
                  color: "#9f1239",
                  padding: 16,
                  fontSize: 15,
                }}
              >
                {authError}
              </div>
            ) : null}
          </section>
        ) : null}

        {authStep === "ready" && grantedTo ? (
          <div
            style={{
              borderRadius: 24,
              border: "1px solid #bbf7d0",
              background: "#f0fdf4",
              color: "#166534",
              padding: 24,
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            Access granted to {grantedTo}. Redirecting you back now...
          </div>
        ) : null}

        {authStep === "ready" && !grantedTo ? (
          <>
            {profileLoading ? (
              <div
                style={{
                  borderRadius: 24,
                  border: "1px solid #dbeafe",
                  background: "#f8fbff",
                  padding: 24,
                  color: "#475569",
                }}
              >
                Loading app details...
              </div>
            ) : null}

            {profile ? (
              <>
                <section
                  style={{
                    borderRadius: 24,
                    border: "1px solid #dbeafe",
                    background: "#f8fbff",
                    padding: 24,
                    display: "grid",
                    gap: 18,
                  }}
                >
                  <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 22,
                        overflow: "hidden",
                        background: "#dbeafe",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#1d4ed8",
                        fontWeight: 800,
                        fontSize: 24,
                      }}
                    >
                      {profile.logo_url ? (
                        <img
                          src={profile.logo_url}
                          alt={`${profile.name} logo`}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        agentInitials(profile.name)
                      )}
                    </div>
                    <div style={{ display: "grid", gap: 6, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 28 }}>{profile.name}</strong>
                        <span
                          style={{
                            borderRadius: 999,
                            padding: "6px 12px",
                            background: profile.is_verified ? "#dcfce7" : "#fef3c7",
                            color: profile.is_verified ? "#166534" : "#92400e",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {profile.is_verified ? "Verified by MemoryOS" : "Unverified app"}
                        </span>
                      </div>
                      {profile.website_url ? (
                        <a
                          href={profile.website_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#64748b", fontSize: 14, textDecoration: "none" }}
                        >
                          {profile.website_url}
                        </a>
                      ) : null}
                      {profile.description ? (
                        <p style={{ margin: 0, color: "#475569", lineHeight: 1.6 }}>
                          {profile.description}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {!profile.is_verified ? (
                    <div
                      style={{
                        borderRadius: 18,
                        border: "1px solid #f59e0b",
                        background: "#fff7ed",
                        color: "#9a3412",
                        padding: 18,
                        fontSize: 15,
                        lineHeight: 1.6,
                        fontWeight: 700,
                      }}
                    >
                      This app has not been verified by MemoryOS. Only continue if you trust {profile.name}.
                    </div>
                  ) : null}
                </section>

                <section
                  style={{
                    borderRadius: 24,
                    border: "1px solid #bfdbfe",
                    background: "#fff",
                    padding: 24,
                    display: "grid",
                    gap: 18,
                  }}
                >
                  <div style={{ display: "grid", gap: 6 }}>
                    <strong style={{ fontSize: 24 }}>This app is requesting access to:</strong>
                    <span style={{ color: "#475569", fontSize: 15 }}>
                      Uncheck anything you do not want to share. If nothing is checked, access cannot be granted.
                    </span>
                  </div>

                  <div style={{ display: "grid", gap: 14 }}>
                    {profile.default_categories_requested.map((category) => {
                      const checked = selectedCategories.includes(category);
                      return (
                        <label
                          key={category}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto 1fr",
                            gap: 14,
                            alignItems: "start",
                            borderRadius: 18,
                            border: `1px solid ${checked ? "#86efac" : "#cbd5e1"}`,
                            background: checked ? "#f0fdf4" : "#fff",
                            padding: 18,
                            cursor: "pointer",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCategory(category)}
                            style={{ marginTop: 4 }}
                          />
                          <div style={{ display: "grid", gap: 4 }}>
                            <strong style={{ fontSize: 17 }}>{CATEGORY_META[category].label}</strong>
                            <span style={{ color: "#475569", fontSize: 15 }}>
                              {CATEGORY_META[category].detail}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>

                <section
                  style={{
                    borderRadius: 24,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    padding: 24,
                    display: "grid",
                    gap: 18,
                  }}
                >
                  <div style={{ display: "grid", gap: 6 }}>
                    <strong style={{ fontSize: 24 }}>This app will NOT access:</strong>
                    <span style={{ color: "#475569", fontSize: 15 }}>
                      Everything listed here stays private from this app.
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {deniedCategories.map((category) => (
                      <div
                        key={category}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "auto 1fr",
                          gap: 14,
                          borderRadius: 18,
                          border: "1px solid #e2e8f0",
                          background: "#f8fafc",
                          padding: 16,
                          color: "#64748b",
                        }}
                      >
                        <span style={{ fontWeight: 700, fontSize: 18, lineHeight: "22px" }}>x</span>
                        <div style={{ display: "grid", gap: 4 }}>
                          <strong style={{ color: "#334155", fontSize: 16 }}>{CATEGORY_META[category].label}</strong>
                          <span style={{ fontSize: 15 }}>{CATEGORY_META[category].detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section
                  style={{
                    borderRadius: 24,
                    border: "1px solid #e2e8f0",
                    background: "#fff",
                    padding: 24,
                    display: "grid",
                    gap: 14,
                  }}
                >
                  <strong style={{ fontSize: 24 }}>Permission duration</strong>
                  {[
                    ["30", "30 days"],
                    ["90", "90 days"],
                    ["365", "1 year"],
                    ["forever", "Until I revoke"],
                  ].map(([value, label]) => (
                    <label
                      key={value}
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        borderRadius: 16,
                        border: "1px solid #e2e8f0",
                        background: duration === value ? "#eff6ff" : "#fff",
                        padding: "14px 16px",
                      }}
                    >
                      <input
                        type="radio"
                        name="duration"
                        value={value}
                        checked={duration === value}
                        onChange={(event) => setDuration(event.target.value as DurationChoice)}
                      />
                      <span style={{ fontSize: 15 }}>{label}</span>
                    </label>
                  ))}
                </section>
              </>
            ) : null}

            {consentError ? (
              <div
                style={{
                  borderRadius: 18,
                  border: "1px solid #fecaca",
                  background: "#fff1f2",
                  color: "#9f1239",
                  padding: 16,
                  fontSize: 15,
                }}
              >
                {consentError}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void handleAllowAccess()}
                disabled={allowDisabled}
                style={{
                  flex: 1,
                  minWidth: 220,
                  borderRadius: 16,
                  border: "1px solid #2563eb",
                  background: "#2563eb",
                  color: "#fff",
                  padding: "15px 18px",
                  fontWeight: 700,
                  cursor: allowDisabled ? "not-allowed" : "pointer",
                  opacity: allowDisabled ? 0.65 : 1,
                }}
              >
                {submittingConsent ? "Granting access..." : "Allow Access"}
              </button>
              <button
                type="button"
                onClick={handleDeny}
                style={{
                  flex: 1,
                  minWidth: 220,
                  borderRadius: 16,
                  border: "1px solid #94a3b8",
                  background: "#fff",
                  color: "#0f172a",
                  padding: "15px 18px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Deny
              </button>
            </div>
          </>
        ) : null}

        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#64748b" }}>
          Powered by MemoryOS — You control your AI memory. Manage permissions anytime at consent.memoryos.io/manage
        </p>
      </section>
    </main>
  );
}

export default function ConsentPage() {
  return (
    <Suspense
      fallback={
        <main style={pageStyle}>
          <section style={shellStyle}>Loading consent flow...</section>
        </main>
      }
    >
      <ConsentPageContent />
    </Suspense>
  );
}
