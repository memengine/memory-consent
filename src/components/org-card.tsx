"use client";

import type { OrganisationDirectoryEntry } from "@/lib/api";

type OrgCardProps = {
  organisation: OrganisationDirectoryEntry;
  isConnected?: boolean;
  loading?: boolean;
  onConnect: (organisation: OrganisationDirectoryEntry) => void;
  onShowLinkInstructions: (organisation: OrganisationDirectoryEntry) => void;
};

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

export function OrgCard({
  organisation,
  isConnected = false,
  loading = false,
  onConnect,
  onShowLinkInstructions,
}: OrgCardProps) {
  const canUseOAuth = organisation.oauth_enabled;
  const methodLabel = canUseOAuth ? "OAuth connector" : "Secure-link connector";
  return (
    <article className="organisation-card">
      <div className="organisation-card-header">
        <div className="organisation-logo">
          {organisation.logo_url ? (
            <img src={organisation.logo_url} alt="" />
          ) : (
            initials(organisation.display_name)
          )}
        </div>
        <div>
          <div className="organisation-title-line">
            <h3>{organisation.display_name}</h3>
            <span className={`verification-label ${organisation.is_verified ? "verified" : "unverified"}`}>
              {organisation.is_verified ? "Verified" : "Not verified"}
            </span>
          </div>
          <span className="organisation-category">{organisation.category.replace("_", " ")}</span>
          <span className="connection-method-label">{methodLabel}</span>
        </div>
      </div>
      {isConnected ? (
        <p className="organisation-notice connected">
          This connector is already linked to your Passport.
        </p>
      ) : !organisation.is_verified ? (
        <p className="organisation-notice">
          MemoryOS has not yet reviewed this connector. Confirm the company identity before continuing.
        </p>
      ) : null}
      <button
        type="button"
        className={isConnected ? "quiet-button connected-button" : canUseOAuth ? "primary-button" : "quiet-button"}
        disabled={loading || isConnected}
        onClick={() =>
          canUseOAuth ? onConnect(organisation) : onShowLinkInstructions(organisation)
        }
      >
        {isConnected
          ? "Already connected"
          : loading
          ? `Opening ${organisation.display_name}...`
          : canUseOAuth
            ? "Connect now"
            : "Use from their app"}
      </button>
    </article>
  );
}
