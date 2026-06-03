"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

type ApiStatus = "idle" | "loading" | "success" | "error";

type MessageRole = "user" | "assistant" | "system";
type ContextFormat = "bullets" | "json" | "xml";

type PlaygroundResponse = {
  label: string;
  status: ApiStatus;
  data: unknown;
};

type MemorySearchResult = {
  id: string;
  content: string;
  category: string;
  importance_score: number;
  relevance_score: number;
};

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
const PLAYGROUND_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEVELOPER_PLAYGROUND === "true";
const MANAGE_UUI_TOKEN_KEY = "memoryos_manage_uui_token";

function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }
  return body as T;
}

function universalHeaders(agentApiKey: string, uuiToken: string): HeadersInit {
  return {
    Authorization: `ApiKey ${agentApiKey.trim()}`,
    "X-MemoryOS-UUI": uuiToken.trim(),
  };
}

function PlaygroundDisabled() {
  return (
    <main className="landing-page playground-page">
      <section className="landing-shell playground-shell">
        <div className="landing-copy playground-hero">
          <span className="pill">Developer playground</span>
          <h1>Playground is disabled</h1>
          <p>This environment is configured for production. Use the permission center to manage Memory Passport access.</p>
          <Link href="/manage" className="landing-link">
            Open permission center
          </Link>
        </div>
      </section>
    </main>
  );
}

function PlaygroundEnabled() {
  const [agentId, setAgentId] = useState("");
  const [agentApiKey, setAgentApiKey] = useState("");
  const [uuiToken, setUuiToken] = useState("");
  const [role, setRole] = useState<MessageRole>("user");
  const [message, setMessage] = useState("I prefer Hinglish explanations and I am preparing for NEET.");
  const [query, setQuery] = useState("What should this AI remember about my learning preferences?");
  const [format, setFormat] = useState<ContextFormat>("bullets");
  const [limit, setLimit] = useState(5);
  const [metadataDomain, setMetadataDomain] = useState("edtech");
  const [status, setStatus] = useState<ApiStatus>("idle");
  const [response, setResponse] = useState<PlaygroundResponse | null>(null);
  const [lastJobId, setLastJobId] = useState("");
  const readyForUniversal = agentApiKey.trim().length > 0 && uuiToken.trim().length > 0;
  const consentUrl = useMemo(() => {
    if (!agentId.trim()) return "/consent";
    const params = new URLSearchParams({
      agent_id: agentId.trim(),
      categories: "expertise,preference,fact,goal",
      redirect_uri: "https://example.com/memoryos-callback",
    });
    return `/consent?${params.toString()}`;
  }, [agentId]);

  return (
    <PlaygroundBody
      agentId={agentId}
      setAgentId={setAgentId}
      agentApiKey={agentApiKey}
      setAgentApiKey={setAgentApiKey}
      uuiToken={uuiToken}
      setUuiToken={setUuiToken}
      role={role}
      setRole={setRole}
      message={message}
      setMessage={setMessage}
      query={query}
      setQuery={setQuery}
      format={format}
      setFormat={setFormat}
      limit={limit}
      setLimit={setLimit}
      metadataDomain={metadataDomain}
      setMetadataDomain={setMetadataDomain}
      status={status}
      setStatus={setStatus}
      response={response}
      setResponse={setResponse}
      lastJobId={lastJobId}
      setLastJobId={setLastJobId}
      readyForUniversal={readyForUniversal}
      consentUrl={consentUrl}
    />
  );
}

export default function ConsentPlaygroundPage() {
  if (!PLAYGROUND_ENABLED) {
    return <PlaygroundDisabled />;
  }

  return <PlaygroundEnabled />;
}

function PlaygroundBody({
  agentId,
  setAgentId,
  agentApiKey,
  setAgentApiKey,
  uuiToken,
  setUuiToken,
  role,
  setRole,
  message,
  setMessage,
  query,
  setQuery,
  format,
  setFormat,
  limit,
  setLimit,
  metadataDomain,
  setMetadataDomain,
  status,
  setStatus,
  response,
  setResponse,
  lastJobId,
  setLastJobId,
  readyForUniversal,
  consentUrl,
}: {
  agentId: string;
  setAgentId: (value: string) => void;
  agentApiKey: string;
  setAgentApiKey: (value: string) => void;
  uuiToken: string;
  setUuiToken: (value: string) => void;
  role: MessageRole;
  setRole: (value: MessageRole) => void;
  message: string;
  setMessage: (value: string) => void;
  query: string;
  setQuery: (value: string) => void;
  format: ContextFormat;
  setFormat: (value: ContextFormat) => void;
  limit: number;
  setLimit: (value: number) => void;
  metadataDomain: string;
  setMetadataDomain: (value: string) => void;
  status: ApiStatus;
  setStatus: (value: ApiStatus) => void;
  response: PlaygroundResponse | null;
  setResponse: (value: PlaygroundResponse | null) => void;
  lastJobId: string;
  setLastJobId: (value: string) => void;
  readyForUniversal: boolean;
  consentUrl: string;
}) {

  function record(label: string, nextStatus: ApiStatus, data: unknown) {
    setResponse({ label, status: nextStatus, data });
    setStatus(nextStatus);
  }

  async function run(label: string, fn: () => Promise<unknown>) {
    setStatus("loading");
    setResponse({ label, status: "loading", data: { message: "Running request..." } });
    try {
      const data = await fn();
      record(label, "success", data);
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Unknown error";
      const isFetchFailure = rawMessage.toLowerCase().includes("failed to fetch");
      record(label, "error", {
        error: rawMessage,
        ...(isFetchFailure
          ? {
              hint: "The browser could not reach the API. Check CORS_ALLOWED_ORIGINS, API_BASE, and whether the API is running.",
              api_base: API_BASE,
              page_origin: typeof window !== "undefined" ? window.location.origin : null,
            }
          : {}),
      });
    }
  }

  async function handleAgentLookup(event: FormEvent) {
    event.preventDefault();
    if (!agentId.trim()) {
      record("Agent profile", "error", { error: "Enter a global agent ID first." });
      return;
    }
    await run("Agent profile", () => requestJson(`/v1/agents/global/${agentId.trim()}`));
  }

  async function handleUserLookup() {
    if (!uuiToken.trim()) {
      record("UUI user", "error", { error: "Enter a UUI token first." });
      return;
    }
    await run("UUI user", () =>
      requestJson("/v1/uui/me", {
        method: "GET",
        headers: {
          "X-MemoryOS-UUI": uuiToken.trim(),
        },
      }),
    );
  }

  async function handleDomainProfile() {
    if (!uuiToken.trim()) {
      record("Domain profile", "error", { error: "Enter a UUI token first." });
      return;
    }
    await run("Domain profile", () =>
      requestJson("/v1/uui/me/domain-profile", {
        method: "GET",
        headers: {
          "X-MemoryOS-UUI": uuiToken.trim(),
        },
      }),
    );
  }

  async function handleListMemories() {
    if (!uuiToken.trim()) {
      record("My memories", "error", { error: "Enter a UUI token first." });
      return;
    }
    await run("My memories", () =>
      requestJson("/v1/uui/me/memories?limit=10&sort=recent", {
        method: "GET",
        headers: {
          "X-MemoryOS-UUI": uuiToken.trim(),
        },
      }),
    );
  }

  async function handleListGrants() {
    if (!uuiToken.trim()) {
      record("My grants", "error", { error: "Enter a UUI token first." });
      return;
    }
    await run("My grants", () =>
      requestJson("/v1/uui/me/grants", {
        method: "GET",
        headers: {
          "X-MemoryOS-UUI": uuiToken.trim(),
        },
      }),
    );
  }

  async function handleOpenManageWithToken() {
    if (!uuiToken.trim()) {
      record("Open manage", "error", { error: "Enter a UUI token first." });
      return;
    }
    window.localStorage.setItem(MANAGE_UUI_TOKEN_KEY, uuiToken.trim());
    await fetch("/__memoryos/session", {
      method: "DELETE",
      credentials: "include",
    }).catch(() => undefined);
    window.location.href = "/manage?tab=memories";
  }

  async function handleAddMemory(event: FormEvent) {
    event.preventDefault();
    if (!readyForUniversal) {
      record("Add universal memory", "error", { error: "Enter both UUI token and global-agent API key." });
      return;
    }
    if (!message.trim()) {
      record("Add universal memory", "error", { error: "Write a message to store." });
      return;
    }
    await run("Add universal memory", () =>
      requestJson("/v1/universal/memories/add", {
        method: "POST",
        headers: universalHeaders(agentApiKey, uuiToken),
        body: JSON.stringify({
          messages: [{ role, content: message.trim() }],
          metadata: metadataDomain.trim() ? { playground: true, domain: metadataDomain.trim() } : { playground: true },
        }),
      }).then((data) => {
        if (data && typeof data === "object" && "job_id" in data && (data as { job_id?: unknown }).job_id) {
          setLastJobId(String((data as { job_id: unknown }).job_id));
        }
        return data;
      }),
    );
  }

  async function handleRetrieve(event: FormEvent) {
    event.preventDefault();
    if (!readyForUniversal) {
      record("Retrieve universal memory", "error", { error: "Enter both UUI token and global-agent API key." });
      return;
    }
    if (!query.trim()) {
      record("Retrieve universal memory", "error", { error: "Write a retrieval query." });
      return;
    }
    await run("Retrieve universal memory", () =>
      requestJson("/v1/universal/memories/retrieve", {
        method: "POST",
        headers: universalHeaders(agentApiKey, uuiToken),
        body: JSON.stringify({
          query: query.trim(),
          limit,
          format,
          context_max_tokens: 500,
        }),
      }),
    );
  }

  async function handleCheckJob() {
    if (!readyForUniversal) {
      record("Universal job status", "error", { error: "Enter both UUI token and global-agent API key." });
      return;
    }
    if (!lastJobId.trim()) {
      record("Universal job status", "error", { error: "Queue a memory first, or paste a job ID." });
      return;
    }
    await run("Universal job status", () =>
      requestJson(`/v1/universal/memories/jobs/${lastJobId.trim()}`, {
        method: "GET",
        headers: universalHeaders(agentApiKey, uuiToken),
      }),
    );
  }

  const retrieved = response?.data as { data?: MemorySearchResult[]; system_prompt_addition?: string } | null;

  return (
    <main className="landing-page playground-page">
      <section className="landing-shell playground-shell">
        <div className="landing-copy playground-hero">
          <span className="pill">Developer Playground</span>
          <h1>Test cross-agent memory without curl</h1>
          <p>
            Paste a UUI token and a global-agent API key, then add or retrieve universal memories using the same
            headers your app will use in production.
          </p>
          <div className="playground-warning">
            Developer testing only. Do not paste production user tokens into shared screens or recordings.
          </div>
        </div>

        <section className="playground-grid">
          <div className="playground-card">
            <h2>1. Identity and agent</h2>
            <p>Use this to verify the token, agent profile, and consent URL before testing add/retrieve.</p>

            <form className="playground-form" onSubmit={(event) => void handleAgentLookup(event)}>
              <label className="field">
                <span>Global agent ID</span>
                <input value={agentId} onChange={(event) => setAgentId(event.target.value)} placeholder="agent uuid" />
              </label>
              <button type="submit" className="quiet-button" disabled={status === "loading"}>
                Check agent profile
              </button>
            </form>

            <div className="playground-form">
              <label className="field">
                <span>UUI token</span>
                <input
                  value={uuiToken}
                  onChange={(event) => setUuiToken(event.target.value)}
                  placeholder="uui_..."
                  autoComplete="off"
                />
              </label>
              <button type="button" className="quiet-button" disabled={status === "loading"} onClick={() => void handleUserLookup()}>
                Check UUI token
              </button>
            </div>

            <label className="field">
              <span>Global-agent API key</span>
              <input
                type="password"
                value={agentApiKey}
                onChange={(event) => setAgentApiKey(event.target.value)}
                placeholder="mag_... or agent key"
                autoComplete="off"
              />
            </label>

            <div className="playground-actions">
              <Link className="quiet-button" href={consentUrl}>
                Open consent URL
              </Link>
              <Link className="quiet-button" href="/manage">
                Open manage page
              </Link>
            </div>
          </div>

          <div className="playground-card">
            <h2>2. Add a universal memory</h2>
            <p>This queues the real universal extraction job for the selected user and agent.</p>
            <form className="playground-form" onSubmit={(event) => void handleAddMemory(event)}>
              <label className="field">
                <span>Role</span>
                <select value={role} onChange={(event) => setRole(event.target.value as MessageRole)}>
                  <option value="user">user</option>
                  <option value="assistant">assistant</option>
                  <option value="system">system</option>
                </select>
              </label>
              <label className="field">
                <span>Metadata domain</span>
                <input value={metadataDomain} onChange={(event) => setMetadataDomain(event.target.value)} placeholder="edtech" />
              </label>
              <label className="field wide">
                <span>Message to remember</span>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={6} />
              </label>
              <button type="submit" className="primary-button" disabled={status === "loading"}>
                Queue memory extraction
              </button>
            </form>
            <div className="playground-form">
              <label className="field">
                <span>Last job ID</span>
                <input value={lastJobId} onChange={(event) => setLastJobId(event.target.value)} placeholder="queued job id" />
              </label>
              <button type="button" className="quiet-button" disabled={status === "loading"} onClick={() => void handleCheckJob()}>
                Check job status
              </button>
            </div>
          </div>

          <div className="playground-card">
            <h2>3. Retrieve memory</h2>
            <p>Retrieval only returns categories the user granted to this agent.</p>
            <form className="playground-form" onSubmit={(event) => void handleRetrieve(event)}>
              <label className="field wide">
                <span>Query</span>
                <textarea value={query} onChange={(event) => setQuery(event.target.value)} rows={4} />
              </label>
              <label className="field">
                <span>Format</span>
                <select value={format} onChange={(event) => setFormat(event.target.value as ContextFormat)}>
                  <option value="bullets">bullets</option>
                  <option value="json">json</option>
                  <option value="xml">xml</option>
                </select>
              </label>
              <label className="field">
                <span>Limit</span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={limit}
                  onChange={(event) => setLimit(Number(event.target.value))}
                />
              </label>
              <button type="submit" className="primary-button" disabled={status === "loading"}>
                Retrieve context
              </button>
            </form>
          </div>

          <div className="playground-card">
            <h2>4. Inspect user state</h2>
            <p>These use only the UUI token, so they are useful when the agent key is the thing you are debugging.</p>
            <div className="playground-actions">
              <button type="button" className="quiet-button" disabled={status === "loading"} onClick={() => void handleListMemories()}>
                List my memories
              </button>
              <button type="button" className="quiet-button" disabled={status === "loading"} onClick={() => void handleListGrants()}>
                List my grants
              </button>
              <button type="button" className="quiet-button" disabled={status === "loading"} onClick={() => void handleDomainProfile()}>
                View domain profile
              </button>
              <button type="button" className="primary-button" disabled={status === "loading"} onClick={() => void handleOpenManageWithToken()}>
                Open Manage with this token
              </button>
            </div>
          </div>
        </section>

        <section className={`playground-response playground-response-${response?.status || "idle"}`}>
          <div className="playground-response-header">
            <div>
              <span className="eyebrow">Latest response</span>
              <h2>{response?.label || "No request yet"}</h2>
            </div>
            <span className="response-status">{response?.status || "idle"}</span>
          </div>

          {retrieved?.system_prompt_addition ? (
            <div className="context-preview">
              <strong>system_prompt_addition</strong>
              <pre>{retrieved.system_prompt_addition}</pre>
            </div>
          ) : null}

          <pre className="response-json">{response ? compactJson(response.data) : "Run a request to see JSON here."}</pre>
        </section>
      </section>
    </main>
  );
}
