"use client";

import type { VerifiedOrganisationConnection } from "@/lib/api";

type ConnectionCardProps = {
  connection: VerifiedOrganisationConnection;
  confirming: boolean;
  loading: boolean;
  onAskDisconnect: () => void;
  onCancelDisconnect: () => void;
  onDisconnect: () => void;
};

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function relativeDate(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function ConnectionCard({
  connection,
  confirming,
  loading,
  onAskDisconnect,
  onCancelDisconnect,
  onDisconnect,
}: ConnectionCardProps) {
  return (
    <article className="connection-card">
      <div className="connection-main">
        <div className="organisation-logo">
          {connection.organisation_logo_url ? (
            <img src={connection.organisation_logo_url} alt="" />
          ) : (
            initials(connection.organisation_name)
          )}
        </div>
        <div>
          <div className="organisation-title-line">
            <h3>{connection.organisation_name}</h3>
            <span className="organisation-category">{connection.category}</span>
            <span className={`verify-badge ${connection.organisation_is_verified ? "verified" : "unverified"}`}>
              {connection.organisation_is_verified ? "MemoryOS verified" : "Review pending"}
            </span>
          </div>
          <p>
            Connected via{" "}
            {connection.connection_method === "link_token"
              ? "secure link"
              : connection.connection_method.toUpperCase()}
            {" · "}connected {relativeDate(connection.verified_at)}
          </p>
          <small>{connection.memory_count} Passport memories attributed to this connection</small>
        </div>
      </div>
      {confirming ? (
        <div className="disconnect-confirm">
          <p>
            Disconnect {connection.organisation_name}? Existing memories stay until you remove them.
            Future sync from this organisation stops.
          </p>
          <div className="button-row">
            <button type="button" className="danger-button" disabled={loading} onClick={onDisconnect}>
              {loading ? "Disconnecting..." : "Disconnect"}
            </button>
            <button type="button" className="quiet-button" disabled={loading} onClick={onCancelDisconnect}>
              Keep connected
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="danger-outline-button" onClick={onAskDisconnect}>
          Disconnect
        </button>
      )}
    </article>
  );
}
