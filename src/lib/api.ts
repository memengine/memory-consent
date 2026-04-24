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
  is_verified: boolean;
  default_categories_requested: MemoryCategory[];
};

export type PermissionGrant = {
  id: string;
  user_uui_id: string;
  agent_id: string;
  agent_name: string | null;
  agent_logo_url: string | null;
  agent_website_url: string | null;
  agent_is_verified: boolean;
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
};

type Envelope<T> = {
  data: T;
  request_id: string;
  timestamp: string;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/$/, "");
const SESSION_ROUTE = "/__memoryos/session";

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
}): Promise<Envelope<{ id: string; email: string | null; message: string | null }>> {
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

export async function listMyGrants(): Promise<Envelope<{ grants: PermissionGrant[]; memory_count: number; email: string | null; display_name: string | null }>> {
  return apiRequest("/v1/uui/me/grants", {
    method: "GET",
  });
}

export async function createGrant(payload: {
  agent_id: string;
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

export async function deleteMyData(): Promise<Envelope<{ deleted: boolean; memories_removed: number }>> {
  return apiRequest("/v1/uui/me", {
    method: "DELETE",
  });
}
