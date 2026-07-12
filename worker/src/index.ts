import { verifyGoogleIdToken } from "./googleAuth";

export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  /** Comma-separated list of allowed emails, e.g. "alice@gmail.com,bob@hotmail.com" */
  ALLOWED_EMAILS: string;
  /** Optional. Keep false by default so Lake Hills stays private until public trials are intentional. */
  PUBLIC_SIGNUPS?: string;
  /** Optional. Existing Lake Hills data remains in the legacy kv_store under this primary workspace. */
  PRIMARY_WORKSPACE_ID?: string;
  PRIMARY_WORKSPACE_NAME?: string;
}

const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days
const DEFAULT_PRIMARY_WORKSPACE_ID = "lake-hills";
const DEFAULT_PRIMARY_WORKSPACE_NAME = "Lake Hills OA";

const ALLOWED_ORIGINS = [
  "https://boxsbraindump.github.io",
  "http://127.0.0.1:5185",
  "http://localhost:5185",
  "http://localhost:5173",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Workspace-Id",
    Vary: "Origin",
  };
}

function json(data: unknown, headers: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function bearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice("Bearer ".length);
}

async function getSessionEmail(request: Request, env: Env): Promise<string | null> {
  const token = bearerToken(request);
  if (!token) return null;
  const row = await env.DB.prepare("SELECT email, expires_at FROM sessions WHERE token = ?1")
    .bind(token)
    .first<{ email: string; expires_at: number }>();
  if (!row || row.expires_at < Date.now()) return null;
  return row.email;
}

interface WorkspaceInfo {
  id: string;
  name: string;
  isPrimary: boolean;
}

function normalizedAllowedEmails(env: Env) {
  return env.ALLOWED_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function primaryWorkspace(env: Env): WorkspaceInfo {
  return {
    id: env.PRIMARY_WORKSPACE_ID?.trim() || DEFAULT_PRIMARY_WORKSPACE_ID,
    name: env.PRIMARY_WORKSPACE_NAME?.trim() || DEFAULT_PRIMARY_WORKSPACE_NAME,
    isPrimary: true,
  };
}

function personalWorkspace(email: string): WorkspaceInfo {
  const slug = email
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return {
    id: `personal-${slug || crypto.randomUUID()}`,
    name: "My Admin Workspace",
    isPrimary: false,
  };
}

function defaultWorkspaceForEmail(email: string, env: Env): WorkspaceInfo {
  const allowed = normalizedAllowedEmails(env);
  if (allowed.includes(email.toLowerCase())) return primaryWorkspace(env);
  return personalWorkspace(email);
}

function workspacesForEmail(email: string, env: Env): WorkspaceInfo[] {
  const allowed = normalizedAllowedEmails(env);
  const workspaces = [personalWorkspace(email)];
  if (allowed.includes(email.toLowerCase())) return [primaryWorkspace(env), ...workspaces];
  return workspaces;
}

function requestedWorkspaceForEmail(request: Request, email: string, env: Env): WorkspaceInfo {
  const requestedId = request.headers.get("X-Workspace-Id");
  const workspaces = workspacesForEmail(email, env);
  return workspaces.find((workspace) => workspace.id === requestedId) ?? defaultWorkspaceForEmail(email, env);
}

async function ensureWorkspaceTables(env: Env) {
  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    ),
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS workspace_kv_store (
        workspace_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, key)
      )`,
    ),
  ]);
}

async function ensureWorkspace(env: Env, workspace: WorkspaceInfo) {
  await env.DB.prepare(
    `INSERT INTO workspaces (id, name, created_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
  )
    .bind(workspace.id, workspace.name, Date.now())
    .run();
}

async function ensureWorkspaces(env: Env, workspaces: WorkspaceInfo[]) {
  for (const workspace of workspaces) {
    await ensureWorkspace(env, workspace);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request.headers.get("Origin"));

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    await ensureWorkspaceTables(env);

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/auth/google") {
      const body = await request.json<{ credential?: string }>();
      if (!body.credential) return json({ error: "missing_credential" }, headers, 400);

      const email = await verifyGoogleIdToken(body.credential, env.GOOGLE_CLIENT_ID);
      if (!email) return json({ error: "invalid_token" }, headers, 401);

      const allowed = normalizedAllowedEmails(env);
      const publicSignupsEnabled = env.PUBLIC_SIGNUPS === "true";
      if (!allowed.includes(email)) {
        if (!publicSignupsEnabled) return json({ error: "not_allowed" }, headers, 403);
      }

      const workspace = defaultWorkspaceForEmail(email, env);
      await ensureWorkspaces(env, workspacesForEmail(email, env));

      const token = crypto.randomUUID();
      const now = Date.now();
      await env.DB.prepare(
        "INSERT INTO sessions (token, email, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
      )
        .bind(token, email, now, now + SESSION_TTL_MS)
        .run();

      return json({ token, email, workspace }, headers);
    }

    if (request.method === "GET" && url.pathname === "/api/auth/session") {
      const email = await getSessionEmail(request, env);
      if (!email) return json({ error: "unauthorized" }, headers, 401);
      const workspace = requestedWorkspaceForEmail(request, email, env);
      await ensureWorkspaces(env, workspacesForEmail(email, env));
      return json({ email, workspace }, headers);
    }

    if (request.method === "GET" && url.pathname === "/api/workspaces") {
      const email = await getSessionEmail(request, env);
      if (!email) return json({ error: "unauthorized" }, headers, 401);
      const workspaces = workspacesForEmail(email, env);
      await ensureWorkspaces(env, workspaces);
      return json({ workspaces }, headers);
    }

    if (request.method === "DELETE" && url.pathname === "/api/auth/session") {
      const token = bearerToken(request);
      if (token) {
        await env.DB.prepare("DELETE FROM sessions WHERE token = ?1").bind(token).run();
      }
      return json({ ok: true }, headers);
    }

    const email = await getSessionEmail(request, env);
    if (!email) {
      return json({ error: "unauthorized" }, headers, 401);
    }
    const workspace = requestedWorkspaceForEmail(request, email, env);
    await ensureWorkspace(env, workspace);

    if (request.method === "GET" && url.pathname === "/api/state") {
      const query = workspace.isPrimary
        ? env.DB.prepare("SELECT key, value FROM kv_store")
        : env.DB.prepare("SELECT key, value FROM workspace_kv_store WHERE workspace_id = ?1").bind(
            workspace.id,
          );
      const { results } = await query.all<{ key: string; value: string }>();
      const state: Record<string, unknown> = {};
      for (const row of results) {
        try {
          state[row.key] = JSON.parse(row.value);
        } catch {
          // skip a malformed row rather than fail the whole response
        }
      }
      return json(state, headers);
    }

    const putMatch = /^\/api\/state\/([^/]+)$/.exec(url.pathname);
    if (request.method === "PUT" && putMatch) {
      const key = decodeURIComponent(putMatch[1]);
      const body = await request.json<{ value: unknown }>();

      if (workspace.isPrimary) {
        await env.DB.prepare(
          `INSERT INTO kv_store (key, value, updated_at) VALUES (?1, ?2, ?3)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        )
          .bind(key, JSON.stringify(body.value ?? null), Date.now())
          .run();
      } else {
        await env.DB.prepare(
          `INSERT INTO workspace_kv_store (workspace_id, key, value, updated_at)
           VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(workspace_id, key) DO UPDATE
           SET value = excluded.value, updated_at = excluded.updated_at`,
        )
          .bind(workspace.id, key, JSON.stringify(body.value ?? null), Date.now())
          .run();
      }

      return json({ ok: true }, headers);
    }

    return json({ error: "not found" }, headers, 404);
  },
};
