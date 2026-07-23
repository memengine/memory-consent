"use client";

import { useState } from "react";

import { CorrectionForm } from "@/components/correction-form";
import { getMyMemoryHistory, type MemoryCategory, type UniversalMemoryAudit, type UniversalMemoryVersion, type UserMemoryFlagReason } from "@/lib/api";

type MemoryCardProps = {
  memory: UniversalMemoryAudit;
  label: string;
  loading?: boolean;
  onCorrect: (memoryId: string, correctedContent: string) => void | Promise<void>;
  onFlag: (memoryId: string, reason: UserMemoryFlagReason, correction?: string) => void | Promise<void>;
  onRemove: (memoryId: string) => void | Promise<void>;
  onUnflag: (memoryId: string) => void | Promise<void>;
};

const FLAG_REASONS: Array<{ value: UserMemoryFlagReason; label: string }> = [
  { value: "incorrect", label: "This is incorrect" },
  { value: "outdated", label: "This is outdated" },
  { value: "never_said_this", label: "I never said this" },
];

function trendLabel(trend: string) {
  if (trend === "rising") return "up Rising";
  if (trend === "decaying") return "down Decaying";
  return "stable Stable";
}

function trendClass(trend: string) {
  if (trend === "rising") return "trend-rising";
  if (trend === "decaying") return "trend-decaying";
  return "trend-stable";
}

function importanceLabel(score: number) {
  if (score >= 7) return "filled star High importance";
  if (score >= 4) return "half star Medium importance";
  return "empty star Low importance";
}

function storedText(days: number) {
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function changeTypeLabel(changeType: string) {
  const labels: Record<string, string> = {
    created: "Created",
    user_corrected: "You corrected",
    user_removed: "You removed",
    conflict_resolved: "Auto-resolved",
    agent_updated: "Agent updated",
    importance_decay: "Importance decayed",
    archived: "Archived",
  };
  return labels[changeType] || changeType.replace(/_/g, " ");
}

function changeTypeClass(changeType: string) {
  if (changeType === "created") return "version-created";
  if (changeType === "user_corrected") return "version-corrected";
  if (changeType === "user_removed") return "version-removed";
  if (changeType === "conflict_resolved") return "version-conflict";
  if (changeType === "agent_updated") return "version-agent";
  return "version-muted";
}

export function MemoryCard({ memory, label, loading = false, onCorrect, onFlag, onRemove, onUnflag }: MemoryCardProps) {
  const [mode, setMode] = useState<"idle" | "correct" | "flag" | "remove" | "history">("idle");
  const [showMore, setShowMore] = useState(false);
  const [showProvenance, setShowProvenance] = useState(false);
  const [flagReason, setFlagReason] = useState<UserMemoryFlagReason>("incorrect");
  const [flagCorrection, setFlagCorrection] = useState("");
  const [history, setHistory] = useState<UniversalMemoryVersion[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [expandedVersions, setExpandedVersions] = useState<Set<number>>(new Set());
  const isLong = memory.content.length > 200;
  const visibleContent = isLong && !showMore ? `${memory.content.slice(0, 200)}...` : memory.content;
  const source =
    memory.source_type === "org_connection" && memory.source_organisation_name
      ? `via ${memory.source_organisation_name} (verified connection)`
      : memory.source_type === "user_correction"
        ? "corrected by you"
        : memory.source_type === "system"
          ? "via MemoryOS"
          : memory.source_agent_name
            ? `via ${memory.source_agent_name}${memory.source_agent_access_revoked ? " (access revoked)" : ""}`
            : "source unknown";
  const sourceAccess =
    memory.source_access_status === "active"
      ? "The source still has an active grant."
      : memory.source_access_status === "revoked"
        ? "The source grant was revoked. This memory remains under your control."
        : memory.source_access_status === "expired"
          ? "The source grant expired. This memory remains under your control."
          : memory.source_access_status === "not_required"
            ? "No agent grant was needed for this user-controlled change."
            : "Grant status is unavailable for this older memory.";

  async function toggleHistory() {
    if (mode === "history") {
      setMode("idle");
      return;
    }
    setMode("history");
    if (history !== null) return;
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await getMyMemoryHistory(memory.id);
      setHistory(response.data);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Unable to load memory history.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleVersion(versionNumber: number) {
    setExpandedVersions((current) => {
      const next = new Set(current);
      if (next.has(versionNumber)) {
        next.delete(versionNumber);
      } else {
        next.add(versionNumber);
      }
      return next;
    });
  }

  return (
    <article className={`memory-card ${memory.is_flagged ? "is-flagged" : ""}`}>
      <div className="memory-card-header">
        <div className="memory-card-badges">
          <span className="memory-category-pill">{label}</span>
          <span className="importance-pill">{importanceLabel(Number(memory.importance_score || 0))}</span>
          {memory.is_hot ? <span className="hot-pill">flame Hot</span> : null}
          {memory.is_flagged ? <span className="flag-pill">Flagged</span> : null}
          {memory.claim_status === "disputed" ? <span className="disputed-pill">Source disagreement</span> : null}
        </div>
        <div className="memory-card-meta">
          <span
            className={[
              memory.source_agent_access_revoked ? "revoked-source" : "",
              memory.source_type === "org_connection" ? "organisation-source" : "",
              memory.source_type === "user_correction" ? "user-source" : "",
            ].filter(Boolean).join(" ")}
          >
            {source}
          </span>
          <span>Stored {storedText(memory.stored_days_ago)}</span>
        </div>
      </div>

      <p className="memory-card-content">{visibleContent}</p>
      {isLong ? (
        <button type="button" className="link-button" onClick={() => setShowMore((current) => !current)}>
          {showMore ? "Show less" : "Show more"}
        </button>
      ) : null}

      <div className="memory-provenance-control">
        <button type="button" className="link-button" onClick={() => setShowProvenance((current) => !current)}>
          {showProvenance ? "Hide source details" : "Why this is known"}
        </button>
      </div>
      {showProvenance ? (
        <div className="memory-provenance-panel">
          <strong>Why this is known</strong>
          <dl>
            <div><dt>Source</dt><dd>{source}</dd></div>
            <div><dt>Access</dt><dd>{sourceAccess}</dd></div>
            <div><dt>Claim state</dt><dd>{memory.claim_status === "disputed" ? "Another source reported a different value. Agents receive only the current winner." : "Current"}</dd></div>
            {memory.provenance_recorded_at ? <div><dt>Recorded</dt><dd>{new Date(memory.provenance_recorded_at).toLocaleString()}</dd></div> : null}
            {memory.provenance_reason ? <div><dt>Reason</dt><dd>{memory.provenance_reason}</dd></div> : null}
          </dl>
        </div>
      ) : null}

      <div className={`memory-trend ${trendClass(memory.importance_trend)}`} title="This memory's importance changes based on how often it is used to help AI responses.">
        {trendLabel(memory.importance_trend)}
      </div>

      {memory.is_flagged && mode === "idle" ? (
        <div className="memory-action-row">
          <span className="pending-review-text">Pending review</span>
          <button type="button" className="quiet-button compact" disabled={loading} onClick={() => void toggleHistory()}>
            Clock History
          </button>
          <button type="button" className="quiet-button compact" disabled={loading} onClick={() => void onUnflag(memory.id)}>
            Unflag
          </button>
        </div>
      ) : null}

      {!memory.is_flagged && mode === "idle" ? (
        <div className="memory-action-row">
          <button type="button" className="quiet-button compact" onClick={() => setMode("correct")}>
            Correct
          </button>
          <button type="button" className="amber-outline-button compact" onClick={() => setMode("flag")}>
            Flag
          </button>
          <button type="button" className="quiet-button compact" onClick={() => void toggleHistory()}>
            Clock History
          </button>
          <button type="button" className="danger-outline-button compact" onClick={() => setMode("remove")}>
            Remove
          </button>
        </div>
      ) : null}

      {mode === "history" ? (
        <div className="memory-history-panel">
          <div className="memory-history-header">
            <strong>Memory history</strong>
            <button type="button" className="link-button" onClick={() => setMode("idle")}>
              Close
            </button>
          </div>
          {historyLoading ? <p>Loading history...</p> : null}
          {historyError ? <div className="alert alert-danger">{historyError}</div> : null}
          {!historyLoading && !historyError && history?.length === 0 ? (
            <p>No changes - this memory has not been modified.</p>
          ) : null}
          {!historyLoading && !historyError && history && history.length > 0 ? (
            <div className="version-timeline">
              {history.map((version) => {
                const expanded = expandedVersions.has(version.version_number);
                return (
                  <article className="version-row" key={`${memory.id}-${version.version_number}`}>
                    <div className="version-topline">
                      <strong>V{version.version_number}</strong>
                      <span className={`version-badge ${changeTypeClass(version.change_type)}`}>
                        {changeTypeLabel(version.change_type)}
                      </span>
                      <span>{version.changed_by === "agent" ? `via ${version.agent_name || "agent"}` : version.changed_by === "user" ? "by you" : "by system"}</span>
                      <span>{storedText(version.days_ago)}</span>
                    </div>
                    {version.change_reason ? <p className="version-reason">Reason: {version.change_reason}</p> : null}
                    <button type="button" className="link-button" onClick={() => toggleVersion(version.version_number)}>
                      {expanded ? "Hide" : "Show"} content
                    </button>
                    {expanded ? <p className="version-content">{version.content}</p> : null}
                  </article>
                );
              })}
              {history.length === 1 ? <p className="version-note">No changes - this memory has not been modified.</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {mode === "correct" ? (
        <CorrectionForm
          initialContent={memory.content}
          loading={loading}
          onCancel={() => setMode("idle")}
          onSave={(correctedContent) => onCorrect(memory.id, correctedContent)}
        />
      ) : null}

      {mode === "flag" ? (
        <div className="inline-form">
          <strong>Why does this memory look wrong?</strong>
          <div className="radio-stack">
            {FLAG_REASONS.map((reason) => (
              <label key={reason.value}>
                <input
                  type="radio"
                  checked={flagReason === reason.value}
                  onChange={() => setFlagReason(reason.value)}
                />
                <span>{reason.label}</span>
              </label>
            ))}
          </div>
          <label className="field">
            <span>What should it say? Optional.</span>
            <input
              type="text"
              value={flagCorrection}
              onChange={(event) => setFlagCorrection(event.target.value)}
              placeholder="Add the correct version if you know it"
            />
          </label>
          <div className="button-row">
            <button
              type="button"
              className="amber-outline-button"
              disabled={loading}
              onClick={() => void onFlag(memory.id, flagReason, flagCorrection.trim() || undefined)}
            >
              Flag
            </button>
            <button type="button" className="quiet-button" disabled={loading} onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {mode === "remove" ? (
        <div className="inline-confirm">
          <strong>Remove this memory?</strong>
          <p>The AI will no longer know this about you.</p>
          <div className="button-row">
            <button type="button" className="danger-button" disabled={loading} onClick={() => void onRemove(memory.id)}>
              Yes, remove
            </button>
            <button type="button" className="quiet-button" disabled={loading} onClick={() => setMode("idle")}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export type MemoryCardCategory = MemoryCategory;
