const API_BASE = import.meta.env.VITE_API_BASE as string | undefined;
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const TOKEN_KEY = "lh-auth-token";
const EMAIL_KEY = "lh-auth-email";
const WORKSPACE_KEY = "lh-auth-workspace";
const SYNC_STATUS_EVENT = "lh-sync-status-change";

export const syncEnabled = Boolean(API_BASE && googleClientId);

export interface WorkspaceMeta {
  id: string;
  name: string;
  isPrimary: boolean;
}

export type SyncStatus = "local" | "syncing" | "synced" | "offline" | "unauthorized";

export interface SyncStatusState {
  status: SyncStatus;
  updatedAt: number;
}

let syncStatusState: SyncStatusState = {
  status: syncEnabled ? "syncing" : "local",
  updatedAt: Date.now(),
};

function setSyncStatus(status: SyncStatus) {
  syncStatusState = { status, updatedAt: Date.now() };
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: syncStatusState }));
}

export function getSyncStatus() {
  return syncStatusState;
}

export function subscribeSyncStatus(listener: (state: SyncStatusState) => void) {
  function handleStatusChange(event: Event) {
    listener((event as CustomEvent<SyncStatusState>).detail);
  }

  window.addEventListener(SYNC_STATUS_EVENT, handleStatusChange);
  return () => window.removeEventListener(SYNC_STATUS_EVENT, handleStatusChange);
}

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getAuthEmail(): string | null {
  try {
    return window.localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function getWorkspaceMeta(): WorkspaceMeta | null {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY);
    return raw ? (JSON.parse(raw) as WorkspaceMeta) : null;
  } catch {
    return null;
  }
}

function setSession(token: string, email: string, workspace?: WorkspaceMeta) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(EMAIL_KEY, email);
    if (workspace) window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
    cachedStatePromise = null;
  } catch {
    // Session will still work for this page load; it just won't persist.
  }
}

function currentWorkspaceId() {
  return getWorkspaceMeta()?.id;
}

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  const workspaceId = currentWorkspaceId();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
  };
}

export function getScopedStorageKey(key: string) {
  const workspace = getWorkspaceMeta();
  if (!syncEnabled || !workspace || workspace.isPrimary) return key;
  return `${workspace.id}:${key}`;
}

export function setCurrentWorkspace(workspace: WorkspaceMeta) {
  try {
    window.localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
    cachedStatePromise = null;
  } catch {
    // ignore
  }
}

function markCurrentWorkspaceInitialized() {
  try {
    window.localStorage.setItem(getScopedStorageKey("lh-workspace-initialized"), JSON.stringify(true));
  } catch {
    // ignore
  }
  void pushRemoteValue("lh-workspace-initialized", true);
}

export function clearAuthToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(EMAIL_KEY);
    window.localStorage.removeItem(WORKSPACE_KEY);
    cachedStatePromise = null;
  } catch {
    // ignore
  }
}

function statusFromResponse(res: Response): SyncStatus {
  if (res.ok) return "synced";
  if (res.status === 401 || res.status === 403) return "unauthorized";
  return "offline";
}

export async function verifySession(
  token: string,
): Promise<{ ok: true; email: string; workspace: WorkspaceMeta } | { ok: false }> {
  if (!API_BASE) return { ok: false };
  try {
    setSyncStatus("syncing");
    const res = await fetch(`${API_BASE}/api/auth/session`, {
      headers: authHeaders(),
    });
    setSyncStatus(statusFromResponse(res));
    if (!res.ok) return { ok: false };
    const body = (await res.json()) as { email?: string; workspace?: WorkspaceMeta };
    if (!body.email || !body.workspace) return { ok: false };
    setSession(token, body.email, body.workspace);
    return { ok: true, email: body.email, workspace: body.workspace };
  } catch {
    setSyncStatus("offline");
    return { ok: false };
  }
}

export async function loginWithGoogle(
  idToken: string,
): Promise<{ ok: true; email: string; workspace: WorkspaceMeta } | { ok: false; error: string }> {
  if (!API_BASE) return { ok: false, error: "sync_not_configured" };
  try {
    setSyncStatus("syncing");
    const res = await fetch(`${API_BASE}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: idToken }),
    });
    const body = (await res.json()) as {
      token?: string;
      email?: string;
      workspace?: WorkspaceMeta;
      error?: string;
    };
    if (!res.ok || !body.token || !body.email || !body.workspace) {
      setSyncStatus(statusFromResponse(res));
      return { ok: false, error: body.error ?? "unknown_error" };
    }
    setSession(body.token, body.email, body.workspace);
    setSyncStatus("synced");
    return { ok: true, email: body.email, workspace: body.workspace };
  } catch {
    setSyncStatus("offline");
    return { ok: false, error: "network_error" };
  }
}

export async function fetchWorkspaces(): Promise<WorkspaceMeta[]> {
  if (!API_BASE) return [];
  try {
    const res = await fetch(`${API_BASE}/api/workspaces`, {
      headers: authHeaders(),
    });
    if (res.status === 401) onUnauthorized?.();
    if (!res.ok) return [];
    const body = (await res.json()) as { workspaces?: WorkspaceMeta[] };
    return body.workspaces ?? [];
  } catch {
    return [];
  }
}

export async function createRemoteWorkspace(
  name?: string,
): Promise<{ ok: true; workspace: WorkspaceMeta } | { ok: false; error: string }> {
  if (!API_BASE) return { ok: false, error: "sync_not_configured" };
  try {
    setSyncStatus("syncing");
    const res = await fetch(`${API_BASE}/api/workspaces`, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    const body = (await res.json()) as { workspace?: WorkspaceMeta; error?: string };
    if (res.status === 401) onUnauthorized?.();
    setSyncStatus(statusFromResponse(res));
    if (!res.ok || !body.workspace) {
      return { ok: false, error: body.error ?? "unknown_error" };
    }
    setCurrentWorkspace(body.workspace);
    markCurrentWorkspaceInitialized();
    return { ok: true, workspace: body.workspace };
  } catch {
    setSyncStatus("offline");
    return { ok: false, error: "network_error" };
  }
}

export async function renameRemoteWorkspace(
  workspaceId: string,
  name: string,
): Promise<
  | { ok: true; workspaces: WorkspaceMeta[]; workspace: WorkspaceMeta }
  | { ok: false; error: string }
> {
  if (!API_BASE) return { ok: false, error: "sync_not_configured" };
  try {
    setSyncStatus("syncing");
    const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    const body = (await res.json()) as {
      workspaces?: WorkspaceMeta[];
      workspace?: WorkspaceMeta;
      error?: string;
    };
    if (res.status === 401) onUnauthorized?.();
    setSyncStatus(statusFromResponse(res));
    if (!res.ok || !body.workspace) {
      return { ok: false, error: body.error ?? "unknown_error" };
    }
    setCurrentWorkspace(body.workspace);
    return { ok: true, workspaces: body.workspaces ?? [body.workspace], workspace: body.workspace };
  } catch {
    setSyncStatus("offline");
    return { ok: false, error: "network_error" };
  }
}

export async function deleteRemoteWorkspace(
  workspaceId: string,
): Promise<
  | { ok: true; workspaces: WorkspaceMeta[]; workspace: WorkspaceMeta }
  | { ok: false; error: string }
> {
  if (!API_BASE) return { ok: false, error: "sync_not_configured" };
  try {
    setSyncStatus("syncing");
    const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    const body = (await res.json()) as {
      workspaces?: WorkspaceMeta[];
      workspace?: WorkspaceMeta;
      error?: string;
    };
    if (res.status === 401) onUnauthorized?.();
    setSyncStatus(statusFromResponse(res));
    if (!res.ok || !body.workspace) {
      return { ok: false, error: body.error ?? "unknown_error" };
    }
    return { ok: true, workspaces: body.workspaces ?? [body.workspace], workspace: body.workspace };
  } catch {
    setSyncStatus("offline");
    return { ok: false, error: "network_error" };
  }
}

export function logoutRemote(): Promise<void> {
  const token = getAuthToken();
  if (!API_BASE || !token) return Promise.resolve();
  return fetch(`${API_BASE}/api/auth/session`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(() => undefined)
    .catch(() => undefined);
}

let cachedStatePromise: Promise<Record<string, unknown>> | null = null;

const REMOTE_REFRESH_EVENT = "lh-remote-refresh";
/** How long a fetched snapshot may be reused before another device's edits would go unseen. */
const STATE_CACHE_TTL_MS = 30_000;
let cachedStateAt = 0;

/**
 * Drop the cached snapshot so the next read goes to the server.
 *
 * The cache used to live for the whole page load, only cleared on login/logout. A front
 * desk leaves this open all day, so every later read replayed the morning's snapshot:
 * edits made on another machine never appeared, and worse, that stale snapshot was
 * written back to localStorage and pushed again, overwriting the other machine's work.
 */
export function invalidateRemoteState() {
  cachedStatePromise = null;
  cachedStateAt = 0;
}

/** Ask every mounted useSyncedStorage to reconcile with the server again. */
export function requestRemoteRefresh() {
  invalidateRemoteState();
  window.dispatchEvent(new CustomEvent(REMOTE_REFRESH_EVENT));
}

export function subscribeRemoteRefresh(listener: () => void) {
  window.addEventListener(REMOTE_REFRESH_EVENT, listener);
  return () => window.removeEventListener(REMOTE_REFRESH_EVENT, listener);
}

if (typeof window !== "undefined" && syncEnabled) {
  // Coming back to the tab is the moment another machine's work is most likely waiting.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestRemoteRefresh();
  });
  window.addEventListener("focus", () => requestRemoteRefresh());
  window.addEventListener("online", () => requestRemoteRefresh());
  window.setInterval(() => {
    if (document.visibilityState === "visible") requestRemoteRefresh();
  }, STATE_CACHE_TTL_MS);
}

export function fetchAllRemoteState(): Promise<Record<string, unknown>> {
  if (!syncEnabled) {
    setSyncStatus("local");
    return Promise.resolve({});
  }
  const token = getAuthToken();
  if (!token) return Promise.resolve({});
  if (cachedStatePromise && Date.now() - cachedStateAt > STATE_CACHE_TTL_MS) {
    invalidateRemoteState();
  }
  if (!cachedStatePromise) {
    cachedStateAt = Date.now();
    setSyncStatus("syncing");
    cachedStatePromise = fetch(`${API_BASE}/api/state`, {
      headers: authHeaders(),
    })
      .then((res) => {
        if (res.status === 401) onUnauthorized?.();
        setSyncStatus(statusFromResponse(res));
        return res.ok ? res.json() : {};
      })
      .catch(() => {
        setSyncStatus("offline");
        return {};
      });
  }
  return cachedStatePromise;
}

export function pushRemoteValue(key: string, value: unknown): Promise<void> {
  if (!syncEnabled) {
    setSyncStatus("local");
    return Promise.resolve();
  }
  const token = getAuthToken();
  if (!token) return Promise.resolve();
  setSyncStatus("syncing");
  return fetch(`${API_BASE}/api/state/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value }),
  })
    .then((res) => {
      if (res.status === 401) onUnauthorized?.();
      setSyncStatus(statusFromResponse(res));
      if (res.ok) {
        cachedStatePromise = (cachedStatePromise ?? Promise.resolve({})).then((state) => ({
          ...state,
          [key]: value,
        }));
      }
    })
    .catch(() => {
      setSyncStatus("offline");
    });
}
