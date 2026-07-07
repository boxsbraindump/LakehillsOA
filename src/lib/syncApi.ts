const API_BASE = import.meta.env.VITE_API_BASE as string | undefined;
export const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const TOKEN_KEY = "lh-auth-token";
const EMAIL_KEY = "lh-auth-email";

/** Cloud sync is opt-in — with no backend + Google client configured the app works exactly as before, local-only. */
export const syncEnabled = Boolean(API_BASE && googleClientId);

let onUnauthorized: (() => void) | null = null;

/** Called once by AuthProvider so a rejected/expired session can force the login screen back up. */
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

function setSession(token: string, email: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(EMAIL_KEY, email);
  } catch {
    // storage unavailable — session just won't persist across reloads
  }
}

export function clearAuthToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(EMAIL_KEY);
  } catch {
    // ignore
  }
}

/** Verifies a stored session token is still valid, without touching stored state. */
export async function verifySession(token: string): Promise<boolean> {
  if (!API_BASE) return false;
  try {
    const res = await fetch(`${API_BASE}/api/state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Exchanges a Google ID token for a Lake Hills OA session — used by the login button. */
export async function loginWithGoogle(
  idToken: string,
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  if (!API_BASE) return { ok: false, error: "sync_not_configured" };
  try {
    const res = await fetch(`${API_BASE}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: idToken }),
    });
    const body = (await res.json()) as { token?: string; email?: string; error?: string };
    if (!res.ok || !body.token || !body.email) {
      return { ok: false, error: body.error ?? "unknown_error" };
    }
    setSession(body.token, body.email);
    return { ok: true, email: body.email };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

/** Best-effort server-side session revocation — logout proceeds locally regardless. */
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

export function fetchAllRemoteState(): Promise<Record<string, unknown>> {
  if (!syncEnabled) return Promise.resolve({});
  const token = getAuthToken();
  if (!token) return Promise.resolve({});
  if (!cachedStatePromise) {
    cachedStatePromise = fetch(`${API_BASE}/api/state`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401) onUnauthorized?.();
        return res.ok ? res.json() : {};
      })
      .catch(() => ({}));
  }
  return cachedStatePromise;
}

export function pushRemoteValue(key: string, value: unknown): Promise<void> {
  if (!syncEnabled) return Promise.resolve();
  const token = getAuthToken();
  if (!token) return Promise.resolve();
  return fetch(`${API_BASE}/api/state/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value }),
  })
    .then((res) => {
      if (res.status === 401) onUnauthorized?.();
      if (res.ok) {
        cachedStatePromise = (cachedStatePromise ?? Promise.resolve({})).then((state) => ({
          ...state,
          [key]: value,
        }));
      }
    })
    .catch(() => undefined);
}
