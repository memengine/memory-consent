"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  clearSessionToken,
  createGrant,
  getCurrentSessionUser,
  getMyDomainProfile,
  getGlobalAgentProfile,
  persistSessionToken,
  previewMemoriesForAgent,
  registerIdentity,
  sendLoginCode,
  verifyLoginCode,
  type GlobalAgentProfile,
  type DomainProfile,
  type MemoryPreview,
  type MemoryCategory,
  type SessionUser,
} from "@/lib/api";
import { getDomainLabels } from "@/data/category-labels";

const ALL_CATEGORIES: MemoryCategory[] = [
  "expertise",
  "preference",
  "goal",
  "fact",
  "procedure",
  "relationship",
];

const MANAGE_URL = (process.env.NEXT_PUBLIC_MEMORYOS_MANAGE_URL || "/manage").replace(/\/$/, "");

const CATEGORY_META: Record<MemoryCategory, { label: string; detail: string; short: string }> = {
  preference: {
    label: "Your preferences and settings",
    short: "Preferences",
    detail: "Communication style, defaults, and how you like your tools to behave.",
  },
  expertise: {
    label: "Your skills and knowledge",
    short: "Skills",
    detail: "Topics, tools, and domains you know well.",
  },
  goal: {
    label: "Your goals and plans",
    short: "Goals",
    detail: "What you are trying to accomplish over time.",
  },
  procedure: {
    label: "Your workflows and habits",
    short: "Workflows",
    detail: "How you prefer to work through recurring tasks.",
  },
  fact: {
    label: "General facts about you",
    short: "Facts",
    detail: "Stable profile facts that help apps personalize correctly.",
  },
  relationship: {
    label: "Your relationships and context",
    short: "People",
    detail: "People, teams, and collaboration context you choose to share.",
  },
};

const DURATION_OPTIONS: Array<{ value: DurationChoice; label: string; helper: string }> = [
  { value: "30", label: "30 days", helper: "Best for trying an app." },
  { value: "90", label: "90 days", helper: "Good for short projects." },
  { value: "365", label: "1 year", helper: "Useful for long-running workflows." },
  { value: "forever", label: "Until I revoke", helper: "You can revoke anytime." },
];

type AuthMode = "signin" | "signup";
type AuthStep = "checking" | "email" | "otp" | "ready";
type DurationChoice = "30" | "90" | "365" | "forever" | "";
type ConsentStage = "identity" | "review" | "return";

function parseRedirect(searchParams: URLSearchParams) {
  return {
    agentId: searchParams.get("agent_id"),
    redirectUri: searchParams.get("redirect_uri"),
    state: searchParams.get("state"),
    linkToken: searchParams.get("link_token"),
    categories: parseRequestedCategories(searchParams.get("categories")),
  };
}

function parseRequestedCategories(rawCategories: string | null): MemoryCategory[] {
  if (!rawCategories) {
    return [];
  }

  const available = new Set(ALL_CATEGORIES);
  const requested = rawCategories
    .split(",")
    .map((category) => category.trim())
    .filter((category): category is MemoryCategory => available.has(category as MemoryCategory));

  return Array.from(new Set(requested));
}

function buildRedirectUri(redirectUri: string | null, status: "granted" | "denied", state: string | null) {
  if (!redirectUri) {
    const fallback = new URL("/complete", window.location.origin);
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

function redirectHost(redirectUri: string | null) {
  if (!redirectUri) {
    return "MemoryOS completion page";
  }
  try {
    return new URL(redirectUri).host;
  } catch {
    return "the requesting app";
  }
}

function currentStage(authStep: AuthStep, grantedTo: string | null): ConsentStage {
  if (grantedTo) {
    return "return";
  }
  if (authStep === "ready") {
    return "review";
  }
  return "identity";
}

function StepRail({ stage }: { stage: ConsentStage }) {
  const steps: Array<{ id: ConsentStage; eyebrow: string; title: string }> = [
    { id: "identity", eyebrow: "Step 1", title: "Confirm identity" },
    { id: "review", eyebrow: "Step 2", title: "Review access" },
    { id: "return", eyebrow: "Step 3", title: "Return to app" },
  ];

  return (
    <ol className="consent-steps" aria-label="Consent progress">
      {steps.map((step) => (
        <li
          className={`consent-step ${stage === step.id ? "is-active" : ""}`}
          key={step.id}
          aria-current={stage === step.id ? "step" : undefined}
        >
          <span>{step.eyebrow}</span>
          <strong>{step.title}</strong>
        </li>
      ))}
    </ol>
  );
}

function TrustPanel({
  redirectUri,
  sessionUser,
  onSwitchAccount,
}: {
  redirectUri: string | null;
  sessionUser: SessionUser | null;
  onSwitchAccount: () => void;
}) {
  return (
    <aside className="consent-trust-panel" aria-label="MemoryOS trust notes">
      <div className="trust-orb">M</div>
      <div>
        <span className="section-kicker">Permission center</span>
        <h2>You stay in control.</h2>
      </div>
      <p>
        This screen is here so an app can ask clearly before reading your AI memory. Access is read-only,
        category-based, and revocable anytime.
      </p>
      <div className="trust-list">
        <div>
          <strong>Choose categories</strong>
          <span>Uncheck anything you do not want this app to see.</span>
        </div>
        <div>
          <strong>Pick an expiry</strong>
          <span>No duration is selected until you choose one.</span>
        </div>
        <div>
          <strong>Return destination</strong>
          <span>{redirectHost(redirectUri)}</span>
        </div>
        {sessionUser?.email ? (
          <div>
            <strong>Signed in as</strong>
            <span>{sessionUser.email}</span>
            <button type="button" className="link-button" onClick={onSwitchAccount}>
              Use a different Passport
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function ConsentPageContent() {
  const searchParams = useSearchParams();
  const { agentId, redirectUri, state, linkToken, categories: urlRequestedCategories } = useMemo(
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
  const [passportMissing, setPassportMissing] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const submittedOtpRef = useRef<string | null>(null);

  const [profile, setProfile] = useState<GlobalAgentProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<MemoryCategory[]>([]);
  const [duration, setDuration] = useState<DurationChoice>("");
  const [consentError, setConsentError] = useState("");
  const [submittingConsent, setSubmittingConsent] = useState(false);
  const [grantedTo, setGrantedTo] = useState<string | null>(null);
  const [memoryPreview, setMemoryPreview] = useState<MemoryPreview[] | null>(null);
  const [domainProfile, setDomainProfile] = useState<DomainProfile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const approvedRedirectUri = profile?.redirect_uri || null;

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

  async function switchPassportAccount() {
    await clearSessionToken();
    setSessionUser(null);
    setEmail("");
    setOtp("");
    setAuthError("");
    setConsentError("");
    setAuthStep("email");
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
    if (urlRequestedCategories.length > 0) {
      setSelectedCategories(urlRequestedCategories);
      return;
    }
    if (profile.default_categories_requested?.length) {
      setSelectedCategories(profile.default_categories_requested);
      return;
    }
    setSelectedCategories(ALL_CATEGORIES);
  }, [profile, urlRequestedCategories]);

  useEffect(() => {
    if (authStep !== "ready" || !profile || !agentId || selectedCategories.length === 0) {
      setMemoryPreview(null);
      setDomainProfile(null);
      return;
    }

    let active = true;
    setPreviewLoading(true);
    void previewMemoriesForAgent(agentId, selectedCategories)
      .then((response) => {
        if (active) {
          setMemoryPreview(response.data);
        }
      })
      .catch(() => {
        if (active) {
          setMemoryPreview(null);
        }
      })
      .finally(() => {
        if (active) {
          setPreviewLoading(false);
        }
      });
    void getMyDomainProfile()
      .then((response) => {
        if (active) {
          setDomainProfile(response.data);
        }
      })
      .catch(() => {
        if (active) {
          setDomainProfile(null);
        }
      });

    return () => {
      active = false;
    };
  }, [agentId, authStep, profile, selectedCategories]);

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
    setPassportMissing(false);
    try {
      const response = await sendLoginCode(email.trim());
      if (!response.data.sent) {
        if (response.data.reason === "passport_not_found") {
          setPassportMissing(true);
          setAuthError(
            "No Memory Passport exists for this email. Create one here to continue.",
          );
        } else {
          setAuthError(
            response.data.reason === "rate_limited"
              ? "Too many login code requests. Try again in a little while."
              : "Email delivery failed. Check the address and try again shortly.",
          );
        }
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
        link_token: linkToken,
        categories_allowed: selectedCategories,
        access_type: "read_only",
        expires_at: computeExpiryIso(duration),
      });
      const grantedName = profile?.name ?? "this app";
      setGrantedTo(grantedName);
      window.setTimeout(() => {
        window.location.href = buildRedirectUri(approvedRedirectUri, "granted", state);
      }, 2000);
    } catch (error) {
      setConsentError(error instanceof Error ? error.message : "Unable to save this permission.");
      setSubmittingConsent(false);
    }
  }

  function handleDeny() {
    window.location.href = buildRedirectUri(approvedRedirectUri, "denied", state);
  }

  const stage = currentStage(authStep, grantedTo);
  const domainLabels = getDomainLabels(profile?.owner_tenant?.domain_schema);
  const deniedCategories = ALL_CATEGORIES.filter((category) => !selectedCategories.includes(category));
  const requestedCategories =
    urlRequestedCategories.length > 0
      ? urlRequestedCategories
      : profile?.default_categories_requested?.length
        ? profile.default_categories_requested
        : ALL_CATEGORIES;
  const showEdTechProfilePreview =
    profile?.owner_tenant?.domain_schema === "edtech" &&
    Boolean(domainProfile?.edtech_profile) &&
    (domainProfile?.edtech_profile?.total_edtech_memories ?? 0) >= 3;
  const allowDisabled =
    !profile ||
    !agentId ||
    selectedCategories.length === 0 ||
    !duration ||
    submittingConsent ||
    Boolean(grantedTo);

  return (
    <main className="consent-page">
      <section className="consent-shell">
        <div className="consent-hero">
          <div className="consent-hero-copy">
            <span className="pill">Memory permissions</span>
            <h1>Review this app&apos;s request</h1>
            <p>
              MemoryOS stores your AI memory across apps. You decide exactly what this app can read,
              for how long, and what stays private.
            </p>
          </div>
          <StepRail stage={stage} />
        </div>

        <div className="consent-layout">
          <div className="consent-main-column">
            {!agentId ? (
              <div className="alert alert-danger" role="alert">
                Missing agent_id in the consent link.
              </div>
            ) : null}

            {authStep !== "ready" ? (
              <section className="consent-card auth-card">
                <div className="section-heading">
                  <span className="section-kicker">Secure sign in</span>
                  <h2>Sign in to continue</h2>
                  <p>
                    Enter your MemoryOS email, or create your account inline if this is your first time.
                  </p>
                </div>

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

                {authMode === "signup" ? (
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
                ) : null}

                {authStep === "otp" ? (
                  <div className="otp-panel">
                    <div>
                      <strong>Enter the 6-digit code we sent to {email}</strong>
                      <p>Verification happens automatically when all 6 digits are entered.</p>
                    </div>
                    <input
                      type="number"
                      inputMode="numeric"
                      maxLength={6}
                      autoFocus
                      value={otp}
                      onChange={(event) => {
                        const numeric = event.target.value.replace(/\D/g, "").slice(0, 6);
                        setOtp(numeric);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          void handleVerify();
                        }
                      }}
                      placeholder="123456"
                      aria-label="One-time login code"
                      className="otp-input"
                    />
                    <div className="button-row">
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => void handleVerify()}
                        disabled={otp.length !== 6 || authLoading}
                      >
                        {authLoading ? "Verifying..." : "Verify"}
                      </button>
                      <button
                        type="button"
                        className="quiet-button"
                        onClick={() => {
                          setAuthStep("email");
                          setOtp("");
                          setAuthError("");
                        }}
                      >
                        Use a different email
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => void (authMode === "signup" ? handleCreateAccount() : handleSendCode())}
                      disabled={authLoading || !email.trim()}
                    >
                      {authLoading
                        ? authMode === "signup"
                          ? "Creating account..."
                          : "Sending login code..."
                        : authMode === "signup"
                          ? "Create account"
                          : "Send login code"}
                    </button>

                    <div className="inline-switch">
                      {authMode === "signin" ? "No account yet?" : "Already have an account?"}{" "}
                      <button
                        type="button"
                        onClick={() => {
                          setAuthMode(authMode === "signin" ? "signup" : "signin");
                          setAuthError("");
                        }}
                      >
                        {authMode === "signin" ? "Create one - takes 10 seconds" : "Use email login instead"}
                      </button>
                    </div>
                  </>
                )}

                {authError ? (
                  <div className="alert alert-danger" role="alert">
                    <p>{authError}</p>
                    {passportMissing ? (
                      <button
                        type="button"
                        className="quiet-button compact inline-action"
                        onClick={() => {
                          setAuthMode("signup");
                          setAuthStep("email");
                          setAuthError("");
                          setPassportMissing(false);
                        }}
                      >
                        Create Memory Passport
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </section>
            ) : null}

            {authStep === "ready" && grantedTo ? (
              <div className="success-card" role="status">
                <span className="success-icon">OK</span>
                <div>
                  <strong>Access granted to {grantedTo}</strong>
                  <p>Redirecting you back to {redirectHost(approvedRedirectUri)}...</p>
                </div>
              </div>
            ) : null}

            {authStep === "ready" && !grantedTo ? (
              <>
                {profileLoading ? (
                  <section className="consent-card">
                    <div className="skeleton-line" />
                    <div className="skeleton-line short" />
                  </section>
                ) : null}

                {profile ? (
                  <>
                    <section className="agent-card">
                      <div className="agent-logo" aria-hidden={!profile.logo_url}>
                        {profile.logo_url ? (
                          <img src={profile.logo_url} alt={`${profile.name} logo`} />
                        ) : (
                          agentInitials(profile.name)
                        )}
                      </div>
                      <div className="agent-body">
                        <div className="agent-title-row">
                          <h2>{profile.name}</h2>
                          <span className={`verify-badge ${profile.is_verified ? "verified" : "unverified"}`}>
                            {profile.is_verified ? "Verified by MemoryOS" : "Unverified app"}
                          </span>
                        </div>
                        {profile.website_url ? (
                          <a href={profile.website_url} target="_blank" rel="noreferrer" className="agent-link">
                            {profile.website_url}
                          </a>
                        ) : null}
                        {profile.description ? <p>{profile.description}</p> : null}
                      </div>
                    </section>

                    {!profile.is_verified ? (
                      <div className="alert alert-warning strong-warning" role="alert">
                        <strong>This app has not been verified by MemoryOS.</strong>
                        <span>Only continue if you trust {profile.name}.</span>
                      </div>
                    ) : null}

                    <section className="consent-card">
                      <div className="section-heading">
                        <span className="section-kicker">Requested access</span>
                        <h2>This app is requesting access to:</h2>
                        <p>
                          We preselected the categories this app asked for. You can add or remove categories before
                          approving. Access cannot be granted with zero categories.
                        </p>
                      </div>

                      <div className="category-grid">
                        {ALL_CATEGORIES.map((category) => {
                          const checked = selectedCategories.includes(category);
                          const wasRequested = requestedCategories.includes(category);
                          return (
                            <label className={`category-card ${checked ? "selected" : ""}`} key={category}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleCategory(category)}
                              />
                              <span className="category-check" aria-hidden="true">
                                {checked ? "Allowed" : "Off"}
                              </span>
                              <strong>{domainLabels[category]}</strong>
                              <small>{CATEGORY_META[category].detail}</small>
                              <em>{wasRequested ? "Requested by this app" : "Optional"}</em>
                            </label>
                          );
                        })}
                      </div>
                    </section>

                    {memoryPreview !== null ? (
                      <section className="consent-card preview-card">
                        <button
                          type="button"
                          className="preview-toggle"
                          onClick={() => setPreviewOpen((value) => !value)}
                          disabled={previewLoading}
                        >
                          <span>
                            {previewLoading
                              ? "Checking what this app would see..."
                              : memoryPreview.length > 0
                                ? `Preview what this agent would read (${memoryPreview.length} memories)`
                                : "What this agent would see"}
                          </span>
                          <strong>{previewOpen ? "Hide" : "Show"}</strong>
                        </button>
                        {previewOpen ? (
                          showEdTechProfilePreview && domainProfile?.edtech_profile ? (
                            <div className="edtech-preview-card">
                              <span className="memory-category-pill">This agent will see your academic profile</span>
                              <strong>
                                {[domainProfile.edtech_profile.grade_level, domainProfile.edtech_profile.board]
                                  .filter(Boolean)
                                  .join(" ") || "Academic profile"}
                                {domainProfile.edtech_profile.days_to_exam !== null
                                  ? ` | Exam in ${domainProfile.edtech_profile.days_to_exam} days`
                                  : ""}
                              </strong>
                              <p>
                                Weak:{" "}
                                {domainProfile.edtech_profile.weak_topics.length > 0
                                  ? `${domainProfile.edtech_profile.weak_topics
                                      .slice(0, 2)
                                      .map((topic) => topic.topic)
                                      .join(", ")} (${domainProfile.edtech_profile.weak_topics.length} topics)`
                                  : "none recorded"}
                              </p>
                              <p>
                                Learning style:{" "}
                                {String(
                                  domainProfile.edtech_profile.explanation_style?.primary ??
                                    domainProfile.edtech_profile.language_profile?.explanation_preference ??
                                    "not recorded",
                                )}
                              </p>
                            </div>
                          ) : memoryPreview.length > 0 ? (
                            <div className="memory-preview-list">
                              {memoryPreview.map((memory, index) => (
                                <article className="memory-preview-item" key={`${memory.category}-${index}`}>
                                  <div>
                                    <span className="memory-category-pill">{domainLabels[memory.category]}</span>
                                    <span className="importance-pill">
                                      {memory.importance_score >= 7
                                        ? "High importance"
                                        : memory.importance_score >= 4
                                          ? "Medium"
                                          : "Low"}
                                    </span>
                                  </div>
                                  <p>{memory.content_preview}</p>
                                  <small>Stored {memory.stored_ago}</small>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <div className="alert alert-info">
                              You have no stored memories yet. {profile.owner_tenant?.domain_schema === "edtech" ? "This agent will build your academic profile as you use it." : "This agent will start building your memory profile as you use it."}
                            </div>
                          )
                        ) : null}
                      </section>
                    ) : null}

                    <section className="consent-card muted-card">
                      <div className="section-heading compact">
                        <span className="section-kicker">Private by default</span>
                        <h2>This app will NOT access:</h2>
                      </div>
                      <div className="denied-grid">
                        {deniedCategories.length > 0 ? (
                          deniedCategories.map((category) => (
                            <div className="denied-chip" key={category}>
                              <span aria-hidden="true">x</span>
                              <strong>{domainLabels[category]}</strong>
                            </div>
                          ))
                        ) : (
                          <p className="muted-text">
                            You currently allow all available memory categories.
                          </p>
                        )}
                      </div>
                    </section>

                    <section className="consent-card">
                      <div className="section-heading">
                        <span className="section-kicker">Duration</span>
                        <h2>How long should access last?</h2>
                        <p>No option is selected by default. Choose one to continue.</p>
                      </div>
                      <div className="duration-grid" role="radiogroup" aria-label="Permission duration">
                        {DURATION_OPTIONS.map((option) => (
                          <label className={`duration-card ${duration === option.value ? "selected" : ""}`} key={option.value}>
                            <input
                              type="radio"
                              name="duration"
                              value={option.value}
                              checked={duration === option.value}
                              onChange={(event) => setDuration(event.target.value as DurationChoice)}
                            />
                            <strong>{option.label}</strong>
                            <span>{option.helper}</span>
                          </label>
                        ))}
                      </div>
                    </section>
                  </>
                ) : null}

                {consentError ? (
                  <div className="alert alert-danger" role="alert">
                    {consentError}
                  </div>
                ) : null}

                <div className="consent-action-bar">
                  <div>
                    <strong>Ready to decide?</strong>
                    <span>
                      {selectedCategories.length} category{selectedCategories.length === 1 ? "" : "ies"} selected
                      {duration ? `, ${DURATION_OPTIONS.find((option) => option.value === duration)?.label.toLowerCase()}` : ""}
                    </span>
                  </div>
                  <div className="decision-buttons">
                    <button
                      type="button"
                      className="allow-button"
                      onClick={() => void handleAllowAccess()}
                      disabled={allowDisabled}
                    >
                      {submittingConsent ? "Granting access..." : "Allow Access"}
                    </button>
                    <button type="button" className="deny-button" onClick={handleDeny}>
                      Deny
                    </button>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <TrustPanel
            redirectUri={approvedRedirectUri}
            sessionUser={sessionUser}
            onSwitchAccount={() => void switchPassportAccount()}
          />
        </div>

        <p className="consent-footer">
          Powered by MemoryOS - You control your AI memory. Manage permissions anytime at {MANAGE_URL}
        </p>
      </section>
    </main>
  );
}

export default function ConsentPage() {
  return (
    <Suspense
      fallback={
        <main className="consent-page">
          <section className="consent-shell">Loading consent flow...</section>
        </main>
      }
    >
      <ConsentPageContent />
    </Suspense>
  );
}
