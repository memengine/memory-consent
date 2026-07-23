export type MemoryCategory =
  | "preference"
  | "fact"
  | "goal"
  | "procedure"
  | "relationship"
  | "expertise";

export type GrantAccessType = "read_only" | "read_write";

export type GlobalAgentProfile = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  redirect_uri: string;
  is_verified: boolean;
  default_categories_requested: MemoryCategory[];
  owner_tenant?: {
    domain_schema?: string | null;
  } | null;
};

export type PermissionGrant = {
  id: string;
  user_uui_id: string;
  agent_id: string;
  agent_name: string | null;
  agent_logo_url: string | null;
  agent_website_url: string | null;
  agent_is_verified: boolean;
  agent_domain_schema?: string | null;
  categories_allowed: MemoryCategory[];
  access_type: GrantAccessType;
  granted_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  revoked_at: string | null;
};

export type SessionUser = {
  user_uui_id: string;
  email: string | null;
  display_name: string | null;
  memory_count: number;
  grants: PermissionGrant[];
  masked_uui_token?: string | null;
};

export type MemoryPreview = {
  content_preview: string;
  category: MemoryCategory;
  importance_score: number;
  stored_ago: string;
};

export type EdTechTopicSummary = {
  topic: string;
  severity?: string | null;
  attempts?: number | null;
  confidence?: number | null;
};

export type EdTechUserProfile = {
  grade_level: string | null;
  board: string | null;
  exam_name: string | null;
  exam_date: string | null;
  days_to_exam: number | null;
  marks_target: Record<string, unknown> | null;
  weak_topics: EdTechTopicSummary[];
  strong_topics: EdTechTopicSummary[];
  forgetting_stages: Record<string, string>;
  explanation_style: Record<string, unknown> | null;
  language_profile: Record<string, unknown> | null;
  total_edtech_memories: number;
  source_agent_count: number;
};

export type DomainProfile = {
  detected_domain: string | null;
  edtech_profile: EdTechUserProfile | null;
};

export type ClarificationItem = {
  id: string;
  question_context: string;
  created_at: string | null;
  expires_at: string | null;
  status: string;
  entity_type: string | null;
  domain?: string | null;
  field?: string | null;
  value_a: string | null;
  value_b: string | null;
  value_a_age_days?: number | null;
  value_b_age_days?: number | null;
};

export type UniversalMemoryAudit = {
  id: string;
  content: string;
  category: MemoryCategory;
  importance_score: number;
  importance_trend: "rising" | "stable" | "decaying" | string;
  is_hot: boolean;
  stored_days_ago: number;
  last_accessed_days_ago: number | null;
  source_agent_name: string | null;
  source_agent_access_revoked: boolean;
  source_type: "passport_agent" | "org_connection" | "user_correction" | "system";
  source_organisation_name: string | null;
  stored_at: string | null;
  is_flagged: boolean;
  claim_status: "active" | "disputed" | "archived" | null;
  claim_revision_status: "asserted" | "activated" | "superseded" | "disputed" | "archived" | null;
  source_access_status: "active" | "revoked" | "expired" | "not_required" | null;
  provenance_recorded_at: string | null;
  provenance_reason: string | null;
};

export type OrganisationDirectoryEntry = {
  id: string;
  display_name: string;
  logo_url: string | null;
  website_url: string | null;
  category: "ecommerce" | "banking" | "travel" | "telecom" | "edtech" | "saas" | "other";
  oauth_enabled: boolean;
  link_token_enabled: boolean;
  is_verified: boolean;
};

export type VerifiedOrganisationConnection = {
  id: string;
  organisation_id: string;
  organisation_name: string;
  organisation_logo_url: string | null;
  category: OrganisationDirectoryEntry["category"];
  organisation_is_verified: boolean;
  connection_method: "oauth" | "oidc" | "link_token";
  verified_at: string;
  last_verified_at: string;
  is_active: boolean;
  memory_count: number;
};

export type UserMemoryList = {
  data: UniversalMemoryAudit[];
  next_cursor: string | null;
  total_count: number;
  request_id: string;
  timestamp: string;
};

export type UserMemoryFlagReason = "incorrect" | "outdated" | "never_said_this";

export type UserMemorySort = "importance" | "recent" | "oldest";

export type UniversalMemoryVersion = {
  version_number: number;
  content: string;
  change_type: string;
  change_reason: string | null;
  changed_by: string;
  agent_name: string | null;
  created_at: string;
  days_ago: number;
};

export type UserMemoryListParams = {
  category?: MemoryCategory | null;
  categories?: MemoryCategory[];
  cursor?: string | null;
  limit?: number;
  sort?: UserMemorySort;
};

export type LegacyMemoryAudit = {
  id: string;
  content: string;
  category: MemoryCategory;
  importance_score: number;
  stored_at: string | null;
  stored_ago: string;
  importance_trend: "rising" | "stable" | "decaying" | string;
  last_accessed_by_agent: string | null;
};

type Envelope<T> = {
  data: T;
  request_id: string;
  timestamp: string;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
const SESSION_ROUTE = "/__memoryos/session";
export const MANAGE_UUI_TOKEN_KEY = "memoryos_manage_uui_token";

function manageUuiTokenOverride(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(MANAGE_UUI_TOKEN_KEY);
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tokenOverride = manageUuiTokenOverride();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(tokenOverride ? { "X-MemoryOS-UUI": tokenOverride } : {}),
      ...(init.headers || {}),
    },
    credentials: "include",
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detailsMessage =
      body &&
      typeof body === "object" &&
      "details" in body &&
      body.details &&
      typeof body.details === "object" &&
      "message" in body.details
        ? String((body.details as { message: unknown }).message)
        : null;
    const message =
      detailsMessage ||
      (body && typeof body === "object" && "message" in body && String((body as { message: unknown }).message)) ||
      (body && typeof body === "object" && "error" in body && String((body as { error: unknown }).error)) ||
      "Request failed.";
    throw new Error(message);
  }

  return body as T;
}

export async function persistSessionToken(sessionToken: string): Promise<void> {
  const response = await fetch(SESSION_ROUTE, {
    method: "POST",
    headers: {
      "x-memoryos-session-token": sessionToken,
    },
    credentials: "include",
  });
  if (!response.ok) {
    throw new Error("Unable to persist your MemoryOS session.");
  }
}

export async function clearSessionToken(): Promise<void> {
  await fetch(SESSION_ROUTE, {
    method: "DELETE",
    credentials: "include",
  });
}

export async function registerIdentity(payload: {
  email: string;
  display_name?: string;
}): Promise<Envelope<{ id: string; uui_token: string; email: string | null; message: string | null }>> {
  return apiRequest("/v1/uui/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function sendLoginCode(email: string): Promise<Envelope<{ sent: boolean; reason: string | null }>> {
  return apiRequest("/v1/uui/otp/send", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function verifyLoginCode(payload: {
  email: string;
  otp: string;
}): Promise<Envelope<{ user_uui_id: string; email: string | null; display_name: string | null; session_token: string }>> {
  return apiRequest("/v1/uui/otp/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getCurrentSessionUser(): Promise<Envelope<SessionUser>> {
  return apiRequest("/v1/uui/me", {
    method: "GET",
  });
}

export async function getGlobalAgentProfile(agentId: string): Promise<Envelope<GlobalAgentProfile>> {
  return apiRequest(`/v1/agents/global/${agentId}`, {
    method: "GET",
  });
}

export async function listMyGrants(): Promise<Envelope<{ grants: PermissionGrant[]; memory_count: number; email: string | null; display_name: string | null; masked_uui_token?: string | null }>> {
  return apiRequest("/v1/uui/me/grants", {
    method: "GET",
  });
}

export async function listOrganisations(paramsInput: {
  search?: string;
  category?: OrganisationDirectoryEntry["category"] | "";
  limit?: number;
} = {}): Promise<Envelope<OrganisationDirectoryEntry[]>> {
  const params = new URLSearchParams();
  if (paramsInput.search?.trim()) params.set("search", paramsInput.search.trim());
  if (paramsInput.category) params.set("category", paramsInput.category);
  params.set("limit", String(paramsInput.limit ?? 50));
  return apiRequest(`/v1/uui/organisations?${params.toString()}`, { method: "GET" });
}

export async function listMyConnections(): Promise<Envelope<VerifiedOrganisationConnection[]>> {
  return apiRequest("/v1/uui/me/connections", { method: "GET" });
}

export async function initiateOrganisationOAuth(
  organisationId: string,
): Promise<Envelope<{ authorization_url: string }>> {
  return apiRequest("/v1/uui/oauth/initiate", {
    method: "POST",
    body: JSON.stringify({ org_directory_id: organisationId }),
  });
}

export async function disconnectOrganisation(
  connectionId: string,
): Promise<Envelope<{ disconnected: boolean }>> {
  return apiRequest(`/v1/uui/me/connections/${connectionId}`, { method: "DELETE" });
}

export async function createGrant(payload: {
  agent_id: string;
  link_token?: string | null;
  categories_allowed: MemoryCategory[];
  access_type: GrantAccessType;
  expires_at: string | null;
}): Promise<Envelope<PermissionGrant>> {
  return apiRequest("/v1/uui/me/grants", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function revokeGrant(grantId: string): Promise<Envelope<{ revoked: boolean }>> {
  return apiRequest(`/v1/uui/me/grants/${grantId}`, {
    method: "DELETE",
  });
}

export async function updateGrantCategories(
  grantId: string,
  categoriesAllowed: MemoryCategory[],
): Promise<Envelope<PermissionGrant>> {
  return apiRequest(`/v1/uui/me/grants/${grantId}`, {
    method: "PATCH",
    body: JSON.stringify({ categories_allowed: categoriesAllowed }),
  });
}

export async function previewMemoriesForAgent(
  agentId: string,
  categories: MemoryCategory[],
): Promise<Envelope<MemoryPreview[]>> {
  const params = new URLSearchParams({
    agent_id: agentId,
    categories: categories.join(","),
  });
  return apiRequest(`/v1/uui/me/memories/preview?${params.toString()}`, {
    method: "GET",
  });
}

export async function getMyDomainProfile(): Promise<Envelope<DomainProfile>> {
  return apiRequest("/v1/uui/me/domain-profile", {
    method: "GET",
  });
}

export async function listMyMemories(paramsInput: UserMemoryListParams = {}): Promise<UserMemoryList> {
  const params = new URLSearchParams();
  if (paramsInput.categories?.length) params.set("categories", paramsInput.categories.join(","));
  if (paramsInput.category) params.set("category", paramsInput.category);
  if (paramsInput.cursor) params.set("cursor", paramsInput.cursor);
  if (paramsInput.limit) params.set("limit", String(paramsInput.limit));
  if (paramsInput.sort) params.set("sort", paramsInput.sort);
  return apiRequest(`/v1/uui/me/memories?${params.toString()}`, {
    method: "GET",
  });
}

export async function flagMyMemory(
  memoryId: string,
  payload: { reason: UserMemoryFlagReason; correction?: string | null },
): Promise<Envelope<{ flagged: boolean; memory_id: string }>> {
  return apiRequest(`/v1/uui/me/memories/${memoryId}/flag`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function unflagMyMemory(memoryId: string): Promise<Envelope<{ unflagged: boolean; memory_id: string }>> {
  return apiRequest(`/v1/uui/me/memories/${memoryId}/flag`, {
    method: "DELETE",
  });
}

export async function correctMyMemory(
  memoryId: string,
  correctedContent: string,
): Promise<Envelope<{ corrected: boolean; new_memory_id: string }>> {
  return apiRequest(`/v1/uui/me/memories/${memoryId}/correct`, {
    method: "POST",
    body: JSON.stringify({ corrected_content: correctedContent }),
  });
}

export async function deleteMyMemory(memoryId: string): Promise<Envelope<{ deleted: boolean; memory_id: string }>> {
  return apiRequest(`/v1/uui/me/memories/${memoryId}`, {
    method: "DELETE",
  });
}

export async function getMyMemoryHistory(memoryId: string): Promise<Envelope<UniversalMemoryVersion[]>> {
  return apiRequest(`/v1/uui/me/memories/${memoryId}/history`, {
    method: "GET",
  });
}

export async function listMyClarifications(): Promise<Envelope<{ clarifications: ClarificationItem[] }>> {
  return apiRequest("/v1/uui/me/clarifications", {
    method: "GET",
  });
}

export async function answerClarification(
  clarificationId: string,
  payload: { answer: "A" | "B" | "both" | "neither"; free_text?: string | null },
): Promise<Envelope<{ resolved: boolean; clarification_id: string }>> {
  return apiRequest(`/v1/uui/me/clarifications/${clarificationId}/answer`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function regenerateToken(): Promise<Envelope<{ uui_token: string; masked_uui_token: string; regenerated_at: string }>> {
  return apiRequest("/v1/uui/token/regenerate", {
    method: "POST",
  });
}

export async function deleteMyData(): Promise<Envelope<{ deleted: boolean; memories_removed: number }>> {
  return apiRequest("/v1/uui/me", {
    method: "DELETE",
  });
}
