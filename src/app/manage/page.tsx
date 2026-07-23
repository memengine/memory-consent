"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { EdTechProfileCard } from "@/components/edtech-profile-card";
import { ConnectionCard } from "@/components/connection-card";
import { MemoryCard } from "@/components/memory-card";
import { OrgCard } from "@/components/org-card";
import { getDomainFieldLabel, getDomainLabels } from "@/data/category-labels";
import {
  answerClarification,
  clearSessionToken,
  correctMyMemory,
  deleteMyData,
  deleteMyMemory,
  disconnectOrganisation,
  flagMyMemory,
  getCurrentSessionUser,
  getMyDomainProfile,
  listMyClarifications,
  listMyConnections,
  listMyGrants,
  listMyMemories,
  listOrganisations,
  MANAGE_UUI_TOKEN_KEY,
  persistSessionToken,
  regenerateToken,
  revokeGrant,
  sendLoginCode,
  unflagMyMemory,
  updateGrantCategories,
  verifyLoginCode,
  initiateOrganisationOAuth,
  type ClarificationItem,
  type DomainProfile,
  type MemoryCategory,
  type PermissionGrant,
  type OrganisationDirectoryEntry,
  type VerifiedOrganisationConnection,
  type UniversalMemoryAudit,
  type UserMemoryFlagReason,
  type UserMemorySort,
} from "@/lib/api";

type AuthStep = "checking" | "email" | "otp" | "ready";
type ManageTab = "grants" | "connections" | "memories" | "questions";

const ALL_CATEGORIES: MemoryCategory[] = [
  "expertise",
  "preference",
  "goal",
  "fact",
  "procedure",
  "relationship",
];

const MANAGE_URL = (process.env.NEXT_PUBLIC_MEMORYOS_MANAGE_URL || "/manage").replace(/\/$/, "");

type LoadedState = {
  grants: PermissionGrant[];
  memoryCount: number;
  email: string | null;
  displayName: string | null;
  maskedToken: string | null;
};

function formatRelativeDate(value: string | null) {
  if (!value) return "just now";
  const diffMs = Date.now() - new Date(value).getTime();
  const diffDays = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

function formatExpiry(value: string | null) {
  if (!value) return "Never";
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

function tokenBackupText(token: string) {
  return [
    "MemoryOS Universal User Identity Token",
    "======================================",
    `Token: ${token}`,
    `Created: ${new Date().toISOString()}`,
    "======================================",
    "KEEP THIS SAFE. This token cannot be recovered.",
    `If lost, regenerate it at: ${MANAGE_URL}`,
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

function expiresInDays(value: string | null) {
  if (!value) return "soon";
  const diffMs = new Date(value).getTime() - Date.now();
  const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  return `${days} day${days === 1 ? "" : "s"}`;
}

function storedText(days: number) {
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}


const MEMORY_FILTER_LABELS: Record<MemoryCategory, string> = {
  expertise: "Skills",
  preference: "Preferences",
  goal: "Goals",
  fact: "Facts",
  procedure: "Procedures",
  relationship: "People",
};

function clarificationOptions(item: ClarificationItem): { a: string; b: string } {
  if (item.value_a || item.value_b) {
    return {
      a: item.value_a || "First version",
      b: item.value_b || "Second version",
    };
  }

  const context = item.question_context || "";
  const versionsMatch = context.match(/versions?:\s*([^()]+?)(?:\s*\([^)]*\))?\s+vs\s+([^()?.]+)(?:\s*\([^)]*\))?/i);
  if (versionsMatch) {
    return {
      a: versionsMatch[1].trim(),
      b: versionsMatch[2].trim(),
    };
  }

  const simpleMatch = context.match(/([^:?.]+?)\s+vs\s+([^?.]+)/i);
  if (simpleMatch) {
    return {
      a: simpleMatch[1].trim(),
      b: simpleMatch[2].trim(),
    };
  }

  return { a: "First version", b: "Second version" };
}

function clarificationAge(value: number | null | undefined) {
  if (value === null || value === undefined) return "age unknown";
  if (value <= 0) return "today";
  if (value === 1) return "1 day ago";
  return `${value} days ago`;
}

function domainValue(value: string | null | undefined, field?: string | null) {
  if (!value) return "Unknown";
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if (field?.includes("weak_topic")) {
        return String(record.topic ?? record.name ?? record.concept ?? value);
      }
      if (field?.includes("exam")) {
        return [record.exam_name ?? record.name, record.exam_date ?? record.date].filter(Boolean).join(" ") || value;
      }
      return String(record.value ?? record.topic ?? record.name ?? record.grade_level ?? value);
    }
  } catch {
    // Plain strings are the common case.
  }
  return value;
}

function ManagePageContent() {
  const searchParams = useSearchParams();
  const revokeId = searchParams.get("revoke");
  const requestedTab = searchParams.get("tab");
  const connectionResult = searchParams.get("connection");
  const connectionOrganisation = searchParams.get("org");
  const connectionFailure = searchParams.get("reason");
  const initialTab: ManageTab =
    requestedTab === "memories" ||
    requestedTab === "questions" ||
    requestedTab === "connections" ||
    requestedTab === "grants"
      ? requestedTab
      : connectionResult
        ? "connections"
        : "grants";

  const [authStep, setAuthStep] = useState<AuthStep>("checking");
  const [activeTab, setActiveTab] = useState<ManageTab>(initialTab);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [passportMissing, setPassportMissing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tokenOverride, setTokenOverride] = useState<string | null>(null);
  const submittedOtpRef = useRef<string | null>(null);

  const [loaded, setLoaded] = useState<LoadedState | null>(null);
  const [clarifications, setClarifications] = useState<ClarificationItem[]>([]);
  const [domainProfile, setDomainProfile] = useState<DomainProfile | null>(null);
  const [dismissedClarifications, setDismissedClarifications] = useState<Set<string>>(new Set());
  const [revokeTarget, setRevokeTarget] = useState<PermissionGrant | null>(null);
  const [editingGrantId, setEditingGrantId] = useState<string | null>(null);
  const [editCategories, setEditCategories] = useState<MemoryCategory[]>([]);
  const [expandedGrantId, setExpandedGrantId] = useState<string | null>(null);
  const [grantMemories, setGrantMemories] = useState<Record<string, { memories: UniversalMemoryAudit[]; total: number }>>({});
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [exportAcknowledged, setExportAcknowledged] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [savedNewToken, setSavedNewToken] = useState(false);

  const [memoryItems, setMemoryItems] = useState<UniversalMemoryAudit[]>([]);
  const [memoryCursor, setMemoryCursor] = useState<string | null>(null);
  const [memoryTotal, setMemoryTotal] = useState(0);
  const [memoryCategory, setMemoryCategory] = useState<MemoryCategory | null>(null);
  const [memorySort, setMemorySort] = useState<UserMemorySort>("importance");
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memoryActionId, setMemoryActionId] = useState<string | null>(null);
  const [connections, setConnections] = useState<VerifiedOrganisationConnection[]>([]);
  const [organisations, setOrganisations] = useState<OrganisationDirectoryEntry[]>([]);
  const [organisationSearch, setOrganisationSearch] = useState("");
  const [organisationCategory, setOrganisationCategory] = useState<OrganisationDirectoryEntry["category"] | "">("");
  const [connectingOrganisationId, setConnectingOrganisationId] = useState<string | null>(null);
  const [disconnectingConnectionId, setDisconnectingConnectionId] = useState<string | null>(null);
  const [confirmDisconnectId, setConfirmDisconnectId] = useState<string | null>(null);
  const [linkInstructions, setLinkInstructions] = useState<OrganisationDirectoryEntry | null>(null);
  const browseOrganisationsRef = useRef<HTMLDivElement | null>(null);

  const dominantDomain = useMemo(
    () => loaded?.grants.find((grant) => grant.agent_domain_schema)?.agent_domain_schema ?? "generic",
    [loaded],
  );
  const labels = getDomainLabels(dominantDomain);

  const visibleClarifications = useMemo(
    () => clarifications.filter((item) => !dismissedClarifications.has(item.id)),
    [clarifications, dismissedClarifications],
  );
  const flaggedCount = useMemo(() => memoryItems.filter((memory) => memory.is_flagged).length, [memoryItems]);
  const sourceAgentCount = useMemo(
    () => new Set(memoryItems.map((memory) => memory.source_agent_name).filter(Boolean)).size,
    [memoryItems],
  );

  async function loadClarifications() {
    try {
      const response = await listMyClarifications();
      setClarifications(response.data.clarifications);
    } catch {
      setClarifications([]);
    }
  }

  async function loadDomainProfile() {
    try {
      const response = await getMyDomainProfile();
      setDomainProfile(response.data);
    } catch {
      setDomainProfile(null);
    }
  }

  async function loadPermissions() {
    const response = await listMyGrants();
    setLoaded({
      grants: response.data.grants,
      memoryCount: response.data.memory_count,
      email: response.data.email,
      displayName: response.data.display_name,
      maskedToken: response.data.masked_uui_token ?? null,
    });
    setAuthStep("ready");
    await loadClarifications();
    await loadDomainProfile();
    await loadConnections();
  }

  async function loadConnections() {
    try {
      const response = await listMyConnections();
      setConnections(response.data);
    } catch {
      setConnections([]);
    }
  }

  async function loadOrganisationDirectory() {
    try {
      const response = await listOrganisations({
        search: organisationSearch,
        category: organisationCategory,
        limit: 50,
      });
      setOrganisations(response.data);
    } catch (directoryError) {
      setError(directoryError instanceof Error ? directoryError.message : "Unable to load connectors.");
    }
  }

  async function loadUserMemories(reset = false) {
    setMemoryLoading(true);
    try {
      const response = await listMyMemories({
        category: memoryCategory,
        cursor: reset ? null : memoryCursor,
        limit: 20,
        sort: memorySort,
      });
      setMemoryItems((current) => (reset ? response.data : [...current, ...response.data]));
      setMemoryCursor(response.next_cursor);
      setMemoryTotal(response.total_count);
    } catch (memoryError) {
      setError(memoryError instanceof Error ? memoryError.message : "Unable to load memories.");
    } finally {
      setMemoryLoading(false);
    }
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
    setTokenOverride(window.localStorage.getItem(MANAGE_UUI_TOKEN_KEY));
    void hydrateSession();
  }, []);

  useEffect(() => {
    if (
      requestedTab === "memories" ||
      requestedTab === "questions" ||
      requestedTab === "connections" ||
      requestedTab === "grants"
    ) {
      setActiveTab(requestedTab);
    }
  }, [requestedTab]);

  useEffect(() => {
    if (!connectionResult) return;
    setActiveTab("connections");
    if (connectionResult === "success") {
      setNotice(
        `Successfully connected${connectionOrganisation ? ` to ${connectionOrganisation}` : ""}.`,
      );
      void loadConnections();
    } else if (connectionResult === "failed") {
      setError(`Connection failed: ${(connectionFailure || "unknown error").replace(/_/g, " ")}`);
    }
  }, [connectionResult, connectionOrganisation, connectionFailure]);

  useEffect(() => {
    if (authStep !== "ready") return;
    const id = window.setInterval(() => {
      void loadClarifications();
      if (activeTab === "connections") {
        void loadConnections();
      }
      if (activeTab === "memories") {
        void loadUserMemories(true);
        void loadDomainProfile();
      }
    }, activeTab === "memories" ? 120000 : 60000);

  return () => window.clearInterval(id);
  }, [authStep, activeTab, memoryCategory, memorySort]);

  useEffect(() => {
    if (authStep === "ready" && activeTab === "connections") {
      void loadConnections();
      void loadOrganisationDirectory();
    }
  }, [authStep, activeTab]);

  useEffect(() => {
    if (authStep !== "ready" || activeTab !== "connections") return;
    const timeout = window.setTimeout(() => void loadOrganisationDirectory(), 250);

  return () => window.clearTimeout(timeout);
  }, [authStep, activeTab, organisationSearch, organisationCategory]);

  useEffect(() => {
    if (authStep === "ready" && activeTab === "memories") {
      void loadUserMemories(true);
      void loadDomainProfile();
    }
  }, [authStep, activeTab, memoryCategory, memorySort]);

  useEffect(() => {
    if (!loaded || !revokeId) return;
    const grant = loaded.grants.find((item) => item.id === revokeId);
    if (grant) setRevokeTarget(grant);
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
    if (authLoading || submittedOtpRef.current === otp) return;
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
    setPassportMissing(false);
    try {
      const response = await sendLoginCode(email.trim());
      if (!response.data.sent) {
        if (response.data.reason === "passport_not_found") {
          setPassportMissing(true);
          setError(
            "No Memory Passport exists for this email. Create one first, then return here to sign in.",
          );
        } else {
          setError(
            response.data.reason === "rate_limited"
              ? "Too many login code requests. Try again soon."
              : "Email delivery failed. Check the address and try again shortly.",
          );
        }
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
    if (otp.length !== 6 || authLoading) return;
    setAuthLoading(true);
    setError("");
    try {
      const response = await verifyLoginCode({ email: email.trim(), otp });
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
    if (!revokeTarget) return;
    try {
      await revokeGrant(revokeTarget.id);
      setLoaded((current) =>
        current ? { ...current, grants: current.grants.filter((grant) => grant.id !== revokeTarget.id) } : current,
      );
      setRevokeTarget(null);
      setNotice("Access revoked.");
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Unable to revoke access.");
    }
  }

  async function connectOrganisation(organisation: OrganisationDirectoryEntry) {
    setConnectingOrganisationId(organisation.id);
    setError("");
    try {
      const response = await initiateOrganisationOAuth(organisation.id);
      window.location.assign(response.data.authorization_url);
    } catch (connectionError) {
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : "Unable to start the secure connection.",
      );
      setConnectingOrganisationId(null);
    }
  }

  async function confirmDisconnect(connectionId: string) {
    setDisconnectingConnectionId(connectionId);
    setError("");
    try {
      await disconnectOrganisation(connectionId);
      setConnections((current) => current.filter((connection) => connection.id !== connectionId));
      setConfirmDisconnectId(null);
      setNotice("Connector disconnected. Existing memories were kept.");
    } catch (connectionError) {
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : "Unable to disconnect this connector.",
      );
    } finally {
      setDisconnectingConnectionId(null);
    }
  }

  function beginEdit(grant: PermissionGrant) {
    setEditingGrantId(grant.id);
    setEditCategories([...grant.categories_allowed]);
  }

  function toggleEditCategory(category: MemoryCategory) {
    setEditCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category],
    );
  }

  async function saveGrantEdit(grant: PermissionGrant) {
    if (editCategories.length === 0) return;
    try {
      const response = await updateGrantCategories(grant.id, editCategories);
      setLoaded((current) =>
        current
          ? { ...current, grants: current.grants.map((item) => (item.id === grant.id ? response.data : item)) }
          : current,
      );
      setEditingGrantId(null);
      setNotice("Access updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update access.");
    }
  }

  async function toggleMemoryAudit(grant: PermissionGrant) {
    if (expandedGrantId === grant.id) {
      setExpandedGrantId(null);
      return;
    }
    setExpandedGrantId(grant.id);
    if (!grantMemories[grant.id]) {
      try {
        const response = await listMyMemories({ categories: grant.categories_allowed, limit: 10 });
        setGrantMemories((current) => ({
          ...current,
          [grant.id]: { memories: response.data, total: response.total_count },
        }));
      } catch (memoryError) {
        setError(memoryError instanceof Error ? memoryError.message : "Unable to load memories.");
      }
    }
  }

  async function submitClarification(item: ClarificationItem, answer: "A" | "B" | "both" | "neither") {
    try {
      await answerClarification(item.id, { answer });
      setClarifications((current) => current.filter((entry) => entry.id !== item.id));
      setNotice("Thanks - your memory has been updated.");
    } catch (clarificationError) {
      setError(clarificationError instanceof Error ? clarificationError.message : "Unable to answer clarification.");
    }
  }

  async function handleCorrectMemory(memoryId: string, correctedContent: string) {
    setMemoryActionId(memoryId);
    try {
      await correctMyMemory(memoryId, correctedContent);
      setNotice("Memory corrected. AI agents will use the updated version.");
      await loadUserMemories(true);
    } catch (memoryError) {
      setError(memoryError instanceof Error ? memoryError.message : "Unable to correct memory.");
    } finally {
      setMemoryActionId(null);
    }
  }

  async function handleFlagMemory(memoryId: string, reason: UserMemoryFlagReason, correction?: string) {
    setMemoryActionId(memoryId);
    try {
      await flagMyMemory(memoryId, { reason, correction });
      setMemoryItems((current) => current.map((memory) => (memory.id === memoryId ? { ...memory, is_flagged: true } : memory)));
      setNotice("Flagged for review.");
    } catch (memoryError) {
      setError(memoryError instanceof Error ? memoryError.message : "Unable to flag memory.");
    } finally {
      setMemoryActionId(null);
    }
  }

  async function handleUnflagMemory(memoryId: string) {
    setMemoryActionId(memoryId);
    try {
      await unflagMyMemory(memoryId);
      setMemoryItems((current) => current.map((memory) => (memory.id === memoryId ? { ...memory, is_flagged: false } : memory)));
      setNotice("Flag removed.");
    } catch (memoryError) {
      setError(memoryError instanceof Error ? memoryError.message : "Unable to unflag memory.");
    } finally {
      setMemoryActionId(null);
    }
  }

  async function handleRemoveMemory(memoryId: string) {
    setMemoryActionId(memoryId);
    try {
      await deleteMyMemory(memoryId);
      setMemoryItems((current) => current.filter((memory) => memory.id !== memoryId));
      setMemoryTotal((current) => Math.max(0, current - 1));
      setNotice("Memory removed.");
    } catch (memoryError) {
      setError(memoryError instanceof Error ? memoryError.message : "Unable to remove memory.");
    } finally {
      setMemoryActionId(null);
    }
  }

  async function confirmDeleteAllData() {
    if (deleteConfirmation !== "DELETE" || !exportAcknowledged) {
      setError('Type "DELETE" and confirm the export acknowledgement before deleting.');
      return;
    }
    setDeleteLoading(true);
    setError("");
    try {
      const response = await deleteMyData();
      setLoaded({
        grants: [],
        memoryCount: 0,
        email: loaded?.email ?? null,
        displayName: loaded?.displayName ?? null,
        maskedToken: null,
      });
      setMemoryItems([]);
      setMemoryTotal(0);
      setNotice(`Your Memory Passport was deleted. ${response.data.memories_removed} memories were removed.`);
      setDeleteModalOpen(false);
      setDeleteConfirmation("");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to delete your data.");
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleRegenerateToken() {
    const confirmed = window.confirm(
      "Generate a new token? Your current token will stop working immediately. Apps using your old token must be updated with the new token. Your memories and grants are not affected.",
    );
    if (!confirmed) return;
    try {
      const response = await regenerateToken();
      setNewToken(response.data.uui_token);
      setSavedNewToken(false);
      setLoaded((current) => (current ? { ...current, maskedToken: response.data.masked_uui_token } : current));
    } catch (tokenError) {
      setError(tokenError instanceof Error ? tokenError.message : "Unable to regenerate token.");
    }
  }


async function clearTokenOverride() {
    window.localStorage.removeItem(MANAGE_UUI_TOKEN_KEY);
    setTokenOverride(null);
    setLoaded(null);
    setMemoryItems([]);
    setMemoryTotal(0);
    setAuthStep("checking");
    await hydrateSession();
  }

  async function switchPassportAccount() {
    await clearSessionToken();
    window.localStorage.removeItem(MANAGE_UUI_TOKEN_KEY);
    setTokenOverride(null);
    setLoaded(null);
    setConnections([]);
    setMemoryItems([]);
    setMemoryTotal(0);
    setEmail("");
    setOtp("");
    setError("");
    setNotice("Signed out. Enter the email for the Passport you want to manage.");
    setAuthStep("email");
  }


  const grantCount = loaded?.grants.length ?? 0;
  const connectionCount = connections.length;
  const questionCount = visibleClarifications.length;
  const passportName = loaded?.displayName || loaded?.email || "your Passport";
  const nextAction = questionCount > 0
    ? {
        tab: "questions" as ManageTab,
        label: "Answer pending questions",
        text: `${questionCount} memory conflict${questionCount === 1 ? "" : "s"} need your decision.`,
      }
    : grantCount === 0
      ? {
          tab: "grants" as ManageTab,
          label: "Connect an AI app",
          text: "No AI apps can read your Memory Passport yet.",
        }
      : {
          tab: "memories" as ManageTab,
          label: "Review remembered facts",
          text: "Check what approved AI apps can use before your next session.",
        };
  const tabItems: Array<{
    id: ManageTab;
    step: string;
    title: string;
    description: string;
    count: string;
  }> = [
    {
      id: "grants",
      step: "01",
      title: "Apps with access",
      description: "Edit or revoke AI agents that can read selected memory categories.",
      count: String(grantCount),
    },
    {
      id: "connections",
      step: "02",
      title: "Connected accounts",
      description: "Link or disconnect organisations that verified an account handoff.",
      count: String(connectionCount),
    },
    {
      id: "memories",
      step: "03",
      title: "What is remembered",
      description: "Correct, flag, inspect provenance, or remove individual memories.",
      count: String(memoryTotal || loaded?.memoryCount || 0),
    },
    {
      id: "questions",
      step: "04",
      title: "Needs your decision",
      description: "Resolve personal conflicts that MemoryOS should not guess.",
      count: String(questionCount),
    },
  ];
  return (
    <main className="consent-page">
      <section className="consent-shell">
        <div className="consent-hero-copy permission-hero-copy">
          <span className="pill">Memory Passport</span>
          <h1>Your AI memory control center</h1>
          <p>
            See who can access your memory, connect verified accounts, inspect what is stored,
            and resolve conflicts before AI agents use the wrong context.
          </p>
        </div>

        {authStep !== "ready" ? (
          <section className="consent-card auth-card">
            <div className="section-heading">
              <span className="section-kicker">Secure sign in</span>
              <h2>Sign in to continue</h2>
            </div>
            <label className="field">
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
            </label>

            {authStep === "otp" ? (
              <div className="otp-panel">
                <strong>Enter the 6-digit code we sent to {email}</strong>
                <input
                  type="number"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="123456"
                  className="otp-input"
                />
                <button type="button" className="primary-button" onClick={() => void handleVerify()} disabled={otp.length !== 6 || authLoading}>
                  {authLoading ? "Verifying..." : "Verify"}
                </button>
              </div>
            ) : (
              <button type="button" className="primary-button" onClick={() => void handleSendCode()} disabled={authLoading || !email.trim()}>
                {authLoading ? "Sending login code..." : "Send login code"}
              </button>
            )}
          </section>
        ) : null}

        {error ? (
          <div className="alert alert-danger">
            <p>{error}</p>
            {passportMissing ? (
              <a className="quiet-button compact inline-action" href="/register">
                Create Memory Passport
              </a>
            ) : null}
          </div>
        ) : null}
        {notice ? <div className="alert alert-info">{notice}</div> : null}
        {tokenOverride ? (
          <div className="alert alert-info token-override-alert">
            <div>
              <strong>Using playground UUI token</strong>
              <p>
                Manage is reading memories for <code>{`${tokenOverride.slice(0, 8)}...${tokenOverride.slice(-4)}`}</code>.
              </p>
            </div>
            <button type="button" className="quiet-button compact" onClick={() => void clearTokenOverride()}>
              Return to email login
            </button>
          </div>
        ) : null}

        {authStep === "ready" && loaded ? (
          <div className="manage-grid">

            <section className="passport-overview-panel" aria-label="Memory Passport overview">
              <div className="passport-status-card primary">
                <span className="section-kicker">Signed in as</span>
                <h2>{passportName}</h2>
                <p>{loaded.email || "This Passport is active on this device."}</p>
                <button
                  type="button"
                  className="quiet-button compact"
                  onClick={() => void switchPassportAccount()}
                >
                  Switch Passport account
                </button>
              </div>
              <div className="passport-status-card action">
                <span className="section-kicker">Recommended next step</span>
                <h2>{nextAction.label}</h2>
                <p>{nextAction.text}</p>
                <button type="button" className="primary-button compact" onClick={() => setActiveTab(nextAction.tab)}>
                  Go there
                </button>
              </div>
              <div className="passport-score-strip">
                <div>
                  <strong>{grantCount}</strong>
                  <span>apps</span>
                </div>
                <div>
                  <strong>{connectionCount}</strong>
                  <span>connections</span>
                </div>
                <div>
                  <strong>{memoryTotal || loaded.memoryCount}</strong>
                  <span>memories</span>
                </div>
                <div className={questionCount > 0 ? "needs-attention" : ""}>
                  <strong>{questionCount}</strong>
                  <span>questions</span>
                </div>
              </div>
            </section>

            <nav className="permission-stepper" role="tablist" aria-label="Memory Passport sections">
              {tabItems.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={activeTab === item.id ? "active" : ""}
                  onClick={() => setActiveTab(item.id)}
                  aria-selected={activeTab === item.id}
                >
                  <span className="step-number">{item.step}</span>
                  <span className="step-copy">
                    <strong>{item.title}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span className="step-count">{item.count}</span>
                </button>
              ))}
            </nav>

            {activeTab === "grants" ? (
              <section className="manage-tab-panel grants-panel">
                <div className="grant-summary-grid">
                  <section className="consent-card stat-card grant-summary-card">
                    <strong>Memory stats</strong>
                    <span>{loaded.memoryCount}</span>
                    <p>Total memories stored across all agents{loaded.displayName ? ` for ${loaded.displayName}` : ""}.</p>
                  </section>

                  <section className="consent-card security-card grant-token-card">
                    <div className="section-heading">
                      <span className="section-kicker">Security</span>
                      <h2>Your MemoryOS Token</h2>
                      <p>Only shown in full when first created or regenerated.</p>
                    </div>
                    <code>{loaded.maskedToken || "uui_****"}</code>
                    <button type="button" className="danger-outline-button" onClick={() => void handleRegenerateToken()}>
                      Regenerate token
                    </button>
                  </section>
                </div>

                {loaded.grants.length === 0 ? (
                  <div className="empty-card">
                    <strong>No apps currently have access to your memories.</strong>
                    <p>When an app requests access, it will appear here.</p>
                  </div>
                ) : (
                  <div className="grant-list">
                    {loaded.grants.map((grant) => {
                      const audit = grantMemories[grant.id];

                      return (
                        <article className="grant-card" key={grant.id}>
                          <div className="grant-header">
                            <div className="agent-logo small">
                              {grant.agent_logo_url ? <img src={grant.agent_logo_url} alt={`${grant.agent_name ?? "App"} logo`} /> : initials(grant.agent_name)}
                            </div>
                            <div>
                              <div className="agent-title-row">
                                <h2>{grant.agent_name ?? "Unknown app"}</h2>
                                {grant.agent_is_verified ? <span className="verify-badge verified">Verified</span> : null}
                              </div>
                              {grant.agent_website_url ? (
                                <a href={grant.agent_website_url} target="_blank" rel="noreferrer" className="agent-link">
                                  {grant.agent_website_url}
                                </a>
                              ) : null}
                              <p>Granted {formatRelativeDate(grant.granted_at)}. Expires {formatExpiry(grant.expires_at)}.</p>
                            </div>
                          </div>

                          <div className="denied-grid">
                            {grant.categories_allowed.map((category) => (
                              <span className="memory-category-pill" key={`${grant.id}-${category}`}>
                                {labels[category]}
                              </span>
                            ))}
                          </div>

                          <div className="button-row">
                            <button type="button" className="quiet-button" onClick={() => beginEdit(grant)}>
                              Edit access
                            </button>
                            <button type="button" className="quiet-button" onClick={() => void toggleMemoryAudit(grant)}>
                              {audit ? `${audit.total} memories this agent can read` : "View memories"}
                            </button>
                            <button type="button" className="danger-outline-button" onClick={() => setRevokeTarget(grant)}>
                              Revoke
                            </button>
                          </div>

                          {editingGrantId === grant.id ? (
                            <div className="edit-panel">
                              <h3>Adjust what {grant.agent_name ?? "this app"} can access</h3>
                              <div className="category-grid">
                                {ALL_CATEGORIES.map((category) => {
                                  const checked = editCategories.includes(category);
                                  const wasGranted = grant.categories_allowed.includes(category);

                                  return (
                                    <label className={`category-card ${checked ? "selected" : ""}`} key={category}>
                                      <input type="checkbox" checked={checked} onChange={() => toggleEditCategory(category)} />
                                      <span className="category-check">{checked ? "Allowed" : "Off"}</span>
                                      <strong>{labels[category]}</strong>
                                      {!checked && wasGranted ? <small>This agent will lose access immediately.</small> : null}
                                    </label>
                                  );
                                })}
                              </div>
                              {editCategories.length === 0 ? (
                                <div className="alert alert-warning">You must allow at least one category. To remove all access, use Revoke.</div>
                              ) : null}
                              <div className="button-row">
                                <button type="button" className="primary-button" disabled={editCategories.length === 0} onClick={() => void saveGrantEdit(grant)}>
                                  Save changes
                                </button>
                                <button type="button" className="quiet-button" onClick={() => setEditingGrantId(null)}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {expandedGrantId === grant.id && audit ? (
                            <div className="memory-preview-list">
                              {audit.memories.map((memory) => (
                                <article className="memory-preview-item" key={memory.id}>
                                  <div>
                                    <span className="memory-category-pill">{labels[memory.category]}</span>
                                    <span className="importance-pill">{memory.importance_trend}</span>
                                  </div>
                                  <p>{memory.content.length > 120 ? `${memory.content.slice(0, 120)}...` : memory.content}</p>
                                  <small>
                                    Stored {storedText(memory.stored_days_ago)}
                                    {memory.last_accessed_days_ago !== null ? `. Last accessed ${storedText(memory.last_accessed_days_ago)}` : ""}
                                  </small>
                                </article>
                              ))}
                              {audit.total > audit.memories.length ? <button type="button" className="link-button" onClick={() => setActiveTab("memories")}>See all</button> : null}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}

                <button type="button" className="link-button danger-link" onClick={() => setDeleteModalOpen(true)}>
                  Delete all my data
                </button>
              </section>
            ) : null}

            {activeTab === "connections" ? (
              <section className="manage-tab-panel connections-panel">
                <div className="section-heading">
                  <span className="section-kicker">Connectors</span>
                  <h2>Your connected services</h2>
                  <p>
                    You control every connector. Companies cannot add themselves, and connectors
                    do not decide which AI agents can read your Passport.
                  </p>
                </div>

                {connections.length === 0 ? (
                  <div className="empty-card connection-empty-state">
                    <strong>No connectors yet</strong>
                    <p>
                      Passport-enabled agents already work without connectors. Add one only when
                      you want context from an existing service account linked to your Passport.
                    </p>
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => browseOrganisationsRef.current?.scrollIntoView({ behavior: "smooth" })}
                    >
                      Browse connectors
                    </button>
                  </div>
                ) : (
                  <div className="connection-list">
                    {connections.map((connection) => (
                      <ConnectionCard
                        key={connection.id}
                        connection={connection}
                        confirming={confirmDisconnectId === connection.id}
                        loading={disconnectingConnectionId === connection.id}
                        onAskDisconnect={() => setConfirmDisconnectId(connection.id)}
                        onCancelDisconnect={() => setConfirmDisconnectId(null)}
                        onDisconnect={() => void confirmDisconnect(connection.id)}
                      />
                    ))}
                  </div>
                )}

                <div className="directory-section" ref={browseOrganisationsRef}>
                  <div className="section-heading">
                    <span className="section-kicker">Connector directory</span>
                    <h2>Connect a service account</h2>
                    <p>
                      OAuth connectors start here. Secure-link connectors start inside that
                      company&apos;s app after you sign in there. MemoryOS stores only a verified
                      reference, never your password or raw account ID.
                    </p>
                  </div>
                  <div className="directory-toolbar">
                    <input
                      type="search"
                      value={organisationSearch}
                      onChange={(event) => setOrganisationSearch(event.target.value)}
                      placeholder="Search connectors"
                      aria-label="Search connectors"
                    />
                    <div className="category-pills">
                      {[
                        ["", "All"],
                        ["banking", "Banking"],
                        ["ecommerce", "E-commerce"],
                        ["travel", "Travel"],
                        ["telecom", "Telecom"],
                        ["edtech", "EdTech"],
                        ["saas", "SaaS"],
                      ].map(([value, label]) => (
                        <button
                          type="button"
                          key={value || "all"}
                          className={organisationCategory === value ? "active" : ""}
                          onClick={() =>
                            setOrganisationCategory(value as OrganisationDirectoryEntry["category"] | "")
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {organisations.length === 0 ? (
                    <div className="empty-card">
                      <strong>No matching connectors</strong>
                      <p>
                        The connector directory is curated. Secure-link connectors are opened
                        from the service&apos;s own account settings.
                      </p>
                    </div>
                  ) : (
                    <div className="organisation-grid">
                      {organisations.map((organisation) => (
                        <OrgCard
                          key={organisation.id}
                          organisation={organisation}
                          isConnected={connections.some(
                            (connection) => connection.organisation_id === organisation.id,
                          )}
                          loading={connectingOrganisationId === organisation.id}
                          onConnect={(entry) => void connectOrganisation(entry)}
                          onShowLinkInstructions={setLinkInstructions}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            {activeTab === "memories" ? (
              <section className="manage-tab-panel">
                <div className="section-heading">
                  <span className="section-kicker">Memory profile</span>
                  <h2>Stored memories</h2>
                  <p>Review, correct, or remove the context approved agents can use.</p>
                </div>
{domainProfile?.detected_domain === "edtech" && domainProfile.edtech_profile ? (
                  <EdTechProfileCard
                    profile={domainProfile.edtech_profile}
                    defaultExpanded={
                      Object.values(domainProfile.edtech_profile.forgetting_stages).filter((stage) =>
                        ["forgotten", "critical"].includes(stage),
                      ).length > 3
                    }
                  />
                ) : domainProfile?.detected_domain ? (
                  <div className="domain-profile-card collapsed">
                    <div>
                      <span className="section-kicker">Domain profile</span>
                      <h3>{domainProfile.detected_domain} profile coming soon.</h3>
                      <p>Your memories are stored and accessible - a structured profile view is being built.</p>
                    </div>
                  </div>
                ) : null}

                <div className="memory-toolbar">
                  <div className="category-pills">
                    <button type="button" className={memoryCategory === null ? "active" : ""} onClick={() => setMemoryCategory(null)}>
                      All
                    </button>
                    {ALL_CATEGORIES.map((category) => (
                      <button
                        type="button"
                        key={category}
                        className={memoryCategory === category ? "active" : ""}
                        onClick={() => setMemoryCategory(category)}
                      >
                        {MEMORY_FILTER_LABELS[category]}
                      </button>
                    ))}
                  </div>
                  <label className="sort-control">
                    <span>Sort</span>
                    <select value={memorySort} onChange={(event) => setMemorySort(event.target.value as UserMemorySort)}>
                      <option value="importance">Most Important</option>
                      <option value="recent">Most Recent</option>
                      <option value="oldest">Oldest</option>
                    </select>
                  </label>
                </div>

                <div className="memory-stats-line">
                  <span>{memoryTotal} memories across {sourceAgentCount || 0} agents</span>
                  {flaggedCount > 0 ? <span>{flaggedCount} flagged for review</span> : null}
                </div>

                {memoryItems.length === 0 && !memoryLoading ? (
                  <div className="empty-card compact-empty">
                    <strong>No memories yet</strong>
                    <p>New memories will appear here after approved AI apps start using your Passport.</p>
                  </div>
                ) : (
                  <div className="memory-card-list" id="flat-memory-list">
                    {memoryItems.map((memory) => (
                      <MemoryCard
                        key={memory.id}
                        memory={memory}
                        label={labels[memory.category]}
                        loading={memoryActionId === memory.id}
                        onCorrect={handleCorrectMemory}
                        onFlag={handleFlagMemory}
                        onRemove={handleRemoveMemory}
                        onUnflag={handleUnflagMemory}
                      />
                    ))}
                  </div>
                )}

                {memoryCursor ? (
                  <button type="button" className="quiet-button load-more-button" disabled={memoryLoading} onClick={() => void loadUserMemories(false)}>
                    {memoryLoading ? "Loading..." : "Load more memories"}
                  </button>
                ) : null}
              </section>
            ) : null}

            {activeTab === "questions" ? (
              <section className="manage-tab-panel">
                <div className="section-heading">
                  <span className="section-kicker">Pending confirmations</span>
                  <h2>Questions MemoryOS needs you to answer</h2>
                  <p>These help resolve conflicting information that only you can confirm.</p>
                </div>
                {visibleClarifications.length === 0 ? (
                  <div className="empty-card">
                    <strong>No pending questions.</strong>
                    <p>If MemoryOS needs your help resolving a personal memory conflict, it will appear here.</p>
                  </div>
                ) : (
                  visibleClarifications.map((item) => {
                    const options = clarificationOptions(item);
                    const fieldLabel = getDomainFieldLabel(item.domain, item.field);
                    const valueA = domainValue(options.a, item.field);
                    const valueB = domainValue(options.b, item.field);
                    if (fieldLabel) {

  return (
                        <article className="clarification-card domain-aware" key={item.id}>
                          <div className="clarification-card-header">
                            <span className="clarification-icon" aria-hidden="true">
                              {fieldLabel.icon}
                            </span>
                            <div>
                              <strong>{fieldLabel.context}</strong>
                              <p>We have two versions of this information.</p>
                            </div>
                          </div>
                          <div className="clarification-value-grid">
                            <button type="button" onClick={() => void submitClarification(item, "A")}>
                              <strong>{valueA}</strong>
                              <span>{clarificationAge(item.value_a_age_days)}</span>
                            </button>
                            <button type="button" onClick={() => void submitClarification(item, "B")}>
                              <strong>{valueB}</strong>
                              <span>{clarificationAge(item.value_b_age_days)}</span>
                            </button>
                          </div>
                          <p className="clarification-question">{fieldLabel.question}</p>
                          <small>Expires in {expiresInDays(item.expires_at)} if not answered.</small>
                          <button type="button" className="link-button" onClick={() => setDismissedClarifications((current) => new Set([...current, item.id]))}>
                            Skip for now
                          </button>
                        </article>
                      );
                    }

  return (
                      <article className="clarification-card" key={item.id}>
                        <div className="clarification-card-header">
                          <span className="clarification-icon" aria-hidden="true">
                            ?
                          </span>
                          <div>
                            <strong>We need to confirm something with you</strong>
                            <p>
                              Your {item.entity_type || "memory"} - {item.question_context}. Which is correct?
                            </p>
                          </div>
                        </div>
                        <div className="button-row">
                          <button type="button" className="quiet-button" onClick={() => void submitClarification(item, "A")}>
                            {options.a}
                          </button>
                          <button type="button" className="quiet-button" onClick={() => void submitClarification(item, "B")}>
                            {options.b}
                          </button>
                          <button type="button" className="quiet-button" onClick={() => void submitClarification(item, "both")}>
                            Both are correct
                          </button>
                          <button type="button" className="quiet-button" onClick={() => void submitClarification(item, "neither")}>
                            Neither is correct
                          </button>
                        </div>
                        <small>Expires in {expiresInDays(item.expires_at)} if not answered.</small>
                        <button type="button" className="link-button" onClick={() => setDismissedClarifications((current) => new Set([...current, item.id]))}>
                          Skip for now
                        </button>
                      </article>
                    );
                  })
                )}
              </section>
            ) : null}
          </div>
        ) : null}

        {revokeTarget ? (
          <div className="modal-backdrop">
            <div className="modal-card">
              <h2>Revoke access for {revokeTarget.agent_name ?? "this app"}?</h2>
              <p>They will immediately lose access to your memories.</p>
              <div className="button-row">
                <button type="button" className="quiet-button" onClick={() => setRevokeTarget(null)}>
                  Cancel
                </button>
                <button type="button" className="danger-button" onClick={() => void confirmRevoke()}>
                  Revoke Access
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {deleteModalOpen ? (
          <div className="modal-backdrop">
            <div className="modal-card">
              <h2>Delete all my data</h2>
              <p>Have you exported this user&apos;s data first? This cannot be undone. Type DELETE to confirm.</p>
              <label className="field">
                <span>Confirmation</span>
                <input type="text" value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="DELETE" />
              </label>
              <label className="checkbox-line">
                <input type="checkbox" checked={exportAcknowledged} onChange={(event) => setExportAcknowledged(event.target.checked)} />
                <span>I have exported or do not need the data</span>
              </label>
              <div className="button-row">
                <button type="button" className="quiet-button" onClick={() => setDeleteModalOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => void confirmDeleteAllData()}
                  disabled={deleteLoading || deleteConfirmation !== "DELETE" || !exportAcknowledged}
                >
                  {deleteLoading ? "Deleting..." : "Delete all my data"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {newToken ? (
          <div className="modal-backdrop">
            <div className="modal-card">
              <h2>Your new token</h2>
              <p>This is shown once. Save it before closing this dialog.</p>
              <pre className="token-display">{newToken}</pre>
              <div className="button-row">
                <button type="button" className="quiet-button" onClick={() => void navigator.clipboard.writeText(newToken)}>
                  Copy token
                </button>
                <button type="button" className="quiet-button" onClick={() => downloadText("memoryos-token.txt", tokenBackupText(newToken))}>
                  Download as .txt
                </button>
              </div>
              <label className="checkbox-line">
                <input type="checkbox" checked={savedNewToken} onChange={(event) => setSavedNewToken(event.target.checked)} />
                <span>I have saved my new token</span>
              </label>
              <button type="button" className="primary-button" disabled={!savedNewToken} onClick={() => setNewToken("")}>
                Close
              </button>
            </div>
          </div>
        ) : null}

        {linkInstructions ? (
          <div className="modal-backdrop">
            <div className="modal-card">
              <span className="section-kicker">Secure link connection</span>
              <h2>Open this connector from {linkInstructions.display_name}</h2>
              <p>
                This connector uses secure-link handoff instead of OAuth. Sign in to{" "}
                {linkInstructions.display_name}, choose <strong>Connect Memory Passport</strong>,
                and MemoryOS will open through a one-time link for your account.
              </p>
              <div className="alert alert-info">
                Never paste your permanent Passport token into another company&apos;s website. A
                real secure-link connector opens MemoryOS with a short-lived link.
              </div>
              <button type="button" className="primary-button" onClick={() => setLinkInstructions(null)}>
                Done
              </button>
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
        <main className="consent-page">
          <section className="consent-shell">Loading permission center...</section>
        </main>
      }
    >
      <ManagePageContent />
    </Suspense>
  );
}
