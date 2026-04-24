"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  deleteMyData,
  getCurrentSessionUser,
  listMyGrants,
  persistSessionToken,
  revokeGrant,
  sendLoginCode,
  verifyLoginCode,
  type PermissionGrant,
} from "@/lib/api";

type AuthStep = "checking" | "email" | "otp" | "ready";

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

type LoadedState = {
  grants: PermissionGrant[];
  memoryCount: number;
  displayName: string | null;
};

function formatRelativeDate(value: string | null) {
  if (!value) {
    return "just now";
  }
  const diffMs = Date.now() - new Date(value).getTime();
  const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) {
    return "today";
  }
  if (diffDays === 1) {
    return "1 day ago";
  }
  return `${diffDays} days ago`;
}

function formatExpiry(value: string | null) {
  if (!value) {
    return "Never";
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function initials(name: string | null) {
  return (name || "App")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function ManagePageContent() {
  const searchParams = useSearchParams();
  const revokeId = searchParams.get("revoke");

  const [authStep, setAuthStep] = useState<AuthStep>("checking");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState("");
  const submittedOtpRef = useRef<string | null>(null);

  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<PermissionGrant | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteSummary, setDeleteSummary] = useState("");

  const emptyState = useMemo(
    () =>
      loaded && loaded.grants.length === 0 ? (
        <div
          style={{
            borderRadius: 24,
            border: "1px dashed #cbd5e1",
            background: "#fff",
            padding: 24,
            color: "#475569",
            lineHeight: 1.7,
          }}
        >
          <strong style={{ display: "block", marginBottom: 8, color: "#0f172a" }}>
            No apps currently have access to your memories.
          </strong>
          When an app requests access, it will appear here.
        </div>
      ) : null,
    [loaded],
  );

  async function loadPermissions() {
    const response = await listMyGrants();
    setLoaded({
      grants: response.data.grants,
      memoryCount: response.data.memory_count,
      displayName: response.data.display_name,
    });
    setAuthStep("ready");
  }

  async function hydrateSession() {
    try {
      await getCurrentSessionUser();
      await loadPermissions();
      setError("");
    } catch {
      setAuthStep("email");
    }
  }

  useEffect(() => {
    void hydrateSession();
  }, []);

  useEffect(() => {
    if (!loaded || !revokeId) {
      return;
    }
    const grant = loaded.grants.find((item) => item.id === revokeId);
    if (grant) {
      setRevokeTarget(grant);
    }
  }, [loaded, revokeId]);

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
      setError("Enter your email to continue.");
      return;
    }
    setAuthLoading(true);
    setError("");
    try {
      const response = await sendLoginCode(email.trim());
      if (!response.data.sent) {
        setError(
          response.data.reason === "rate_limited"
            ? "Too many login code requests. Try again soon."
            : "We could not send a login code right now.",
        );
        return;
      }
      setAuthStep("otp");
      setOtp("");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to send a login code.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleVerify() {
    if (otp.length !== 6 || authLoading) {
      return;
    }
    setAuthLoading(true);
    setError("");
    try {
      const response = await verifyLoginCode({
        email: email.trim(),
        otp,
      });
      await persistSessionToken(response.data.session_token);
      submittedOtpRef.current = null;
      setOtp("");
      await loadPermissions();
    } catch (authError) {
      submittedOtpRef.current = null;
      setOtp("");
      setError(authError instanceof Error ? authError.message : "The login code was invalid.");
    } finally {
      setAuthLoading(false);
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) {
      return;
    }
    try {
      await revokeGrant(revokeTarget.id);
      setLoaded((current) =>
        current
          ? {
              ...current,
              grants: current.grants.filter((grant) => grant.id !== revokeTarget.id),
            }
          : current,
      );
      setRevokeTarget(null);
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Unable to revoke access.");
    }
  }

  async function confirmDeleteAllData() {
    if (deleteConfirmation !== "DELETE") {
      setError('Type "DELETE" to confirm data deletion.');
      return;
    }
    setDeleteLoading(true);
    setError("");
    try {
      const response = await deleteMyData();
      setLoaded({
        grants: [],
        memoryCount: 0,
        displayName: loaded?.displayName ?? null,
      });
      setDeleteSummary(
        `Your Memory Passport was deleted. ${response.data.memories_removed} memories were removed.`,
      );
      setDeleteModalOpen(false);
      setDeleteConfirmation("");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete your data.");
    } finally {
      setDeleteLoading(false);
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
            Permission center
          </span>
          <h1 style={{ margin: 0, fontSize: "clamp(2.2rem, 5vw, 4rem)", lineHeight: 1.04 }}>
            Your Memory Permissions
          </h1>
          <p style={{ margin: 0, fontSize: 18, lineHeight: 1.65, color: "#475569" }}>
            These apps can access your MemoryOS memories.
          </p>
        </div>

        {authStep !== "ready" ? (
          <section
            style={{
              borderRadius: 24,
              border: "1px solid #dbeafe",
              background: "#f8fbff",
              padding: 24,
              display: "grid",
              gap: 16,
            }}
          >
            <strong style={{ fontSize: 24 }}>Sign in to continue</strong>
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
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
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
              <button
                type="button"
                onClick={() => void handleSendCode()}
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
                {authLoading ? "Sending login code..." : "Send login code"}
              </button>
            )}
          </section>
        ) : null}

        {error ? (
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
            {error}
          </div>
        ) : null}

        {deleteSummary ? (
          <div
            style={{
              borderRadius: 18,
              border: "1px solid #bbf7d0",
              background: "#f0fdf4",
              color: "#166534",
              padding: 16,
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            {deleteSummary}
          </div>
        ) : null}

        {authStep === "ready" && loaded ? (
          <div style={{ display: "grid", gap: 20 }}>
            <div
              style={{
                borderRadius: 24,
                border: "1px solid #bfdbfe",
                background: "#fff",
                padding: 24,
                display: "grid",
                gap: 8,
              }}
            >
              <strong style={{ fontSize: 24 }}>Memory stats</strong>
              <div style={{ fontSize: 40, fontWeight: 800 }}>{loaded.memoryCount}</div>
              <div style={{ color: "#475569", fontSize: 15 }}>
                Total memories stored across all agents{loaded.displayName ? ` for ${loaded.displayName}` : ""}.
              </div>
            </div>

            {emptyState}

            {loaded.grants.length > 0 ? (
              <div style={{ display: "grid", gap: 16 }}>
                {loaded.grants.map((grant) => (
                  <article
                    key={grant.id}
                    style={{
                      borderRadius: 24,
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      padding: 24,
                      display: "grid",
                      gap: 16,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                        <div
                          style={{
                            width: 56,
                            height: 56,
                            borderRadius: 18,
                            overflow: "hidden",
                            background: "#dbeafe",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "#1d4ed8",
                            fontWeight: 800,
                          }}
                        >
                          {grant.agent_logo_url ? (
                            <img
                              src={grant.agent_logo_url}
                              alt={`${grant.agent_name ?? "App"} logo`}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : (
                            initials(grant.agent_name)
                          )}
                        </div>
                        <div style={{ display: "grid", gap: 4 }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <strong style={{ fontSize: 22 }}>{grant.agent_name ?? "Unknown app"}</strong>
                            {grant.agent_is_verified ? (
                              <span
                                style={{
                                  borderRadius: 999,
                                  padding: "6px 12px",
                                  background: "#dcfce7",
                                  color: "#166534",
                                  fontSize: 13,
                                  fontWeight: 700,
                                }}
                              >
                                Verified
                              </span>
                            ) : null}
                          </div>
                          {grant.agent_website_url ? (
                            <a
                              href={grant.agent_website_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#64748b", fontSize: 14, textDecoration: "none" }}
                            >
                              {grant.agent_website_url}
                            </a>
                          ) : null}
                          <span style={{ color: "#64748b", fontSize: 14 }}>
                            Granted {formatRelativeDate(grant.granted_at)} • Expires {formatExpiry(grant.expires_at)}
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setRevokeTarget(grant)}
                        style={{
                          borderRadius: 16,
                          border: "1px solid #fecaca",
                          background: "#fff",
                          color: "#be123c",
                          padding: "12px 16px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Revoke
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {grant.categories_allowed.map((category) => (
                        <span
                          key={`${grant.id}-${category}`}
                          style={{
                            borderRadius: 999,
                            background: "#dbeafe",
                            color: "#1d4ed8",
                            padding: "8px 12px",
                            fontWeight: 700,
                            fontSize: 13,
                          }}
                        >
                          {category}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              style={{
                width: "fit-content",
                border: "none",
                background: "transparent",
                color: "#be123c",
                fontWeight: 700,
                textDecoration: "underline",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Delete all my data
            </button>
          </div>
        ) : null}

        {revokeTarget ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              zIndex: 30,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 520,
                borderRadius: 24,
                background: "#fff",
                padding: 24,
                display: "grid",
                gap: 18,
                boxShadow: "0 24px 60px rgba(15,23,42,0.18)",
              }}
            >
              <strong style={{ fontSize: 22 }}>
                Revoke access for {revokeTarget.agent_name ?? "this app"}?
              </strong>
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>
                They will immediately lose access to your memories.
              </p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setRevokeTarget(null)}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    borderRadius: 16,
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    padding: "14px 16px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmRevoke()}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    borderRadius: 16,
                    border: "1px solid #fecaca",
                    background: "#be123c",
                    color: "#fff",
                    padding: "14px 16px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Revoke Access
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {deleteModalOpen ? (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(15,23,42,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 20,
              zIndex: 30,
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 560,
                borderRadius: 24,
                background: "#fff",
                padding: 24,
                display: "grid",
                gap: 18,
                boxShadow: "0 24px 60px rgba(15,23,42,0.18)",
              }}
            >
              <strong style={{ fontSize: 22 }}>Delete all my data</strong>
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.7 }}>
                Type DELETE to confirm. This will permanently delete your Memory Passport, revoke all active grants, and remove your universal memories.
              </p>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder="DELETE"
                style={fieldStyle}
              />
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    borderRadius: 16,
                    border: "1px solid #cbd5e1",
                    background: "#fff",
                    padding: "14px 16px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDeleteAllData()}
                  disabled={deleteLoading}
                  style={{
                    flex: 1,
                    minWidth: 160,
                    borderRadius: 16,
                    border: "1px solid #fecaca",
                    background: "#be123c",
                    color: "#fff",
                    padding: "14px 16px",
                    fontWeight: 700,
                    cursor: deleteLoading ? "not-allowed" : "pointer",
                    opacity: deleteLoading ? 0.65 : 1,
                  }}
                >
                  {deleteLoading ? "Deleting..." : "Delete all my data"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default function ManagePage() {
  return (
    <Suspense
      fallback={
        <main style={pageStyle}>
          <section style={shellStyle}>Loading permission center...</section>
        </main>
      }
    >
      <ManagePageContent />
    </Suspense>
  );
}
