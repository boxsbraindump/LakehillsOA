import { verifyGoogleIdToken } from "./googleAuth";

export interface Env {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  /** Comma-separated list of allowed emails, e.g. "alice@gmail.com,bob@hotmail.com" */
  ALLOWED_EMAILS: string;
}

const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days

const ALLOWED_ORIGINS = [
  "https://boxsbraindump.github.io",
  "http://localhost:5185",
  "http://localhost:5173",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request.headers.get("Origin"));

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/auth/google") {
      const body = await request.json<{ credential?: string }>();
      if (!body.credential) return json({ error: "missing_credential" }, headers, 400);

      const email = await verifyGoogleIdToken(body.credential, env.GOOGLE_CLIENT_ID);
      if (!email) return json({ error: "invalid_token" }, headers, 401);

      const allowed = env.ALLOWED_EMAILS.split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
      if (!allowed.includes(email)) {
        return json({ error: "not_allowed" }, headers, 403);
      }

      const token = crypto.randomUUID();
      const now = Date.now();
      await env.DB.prepare(
        "INSERT INTO sessions (token, email, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)",
      )
        .bind(token, email, now, now + SESSION_TTL_MS)
        .run();

      return json({ token, email }, headers);
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

    if (request.method === "GET" && url.pathname === "/api/state") {
      const { results } = await env.DB.prepare("SELECT key, value FROM kv_store").all<{
        key: string;
        value: string;
      }>();
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

      await env.DB.prepare(
        `INSERT INTO kv_store (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
        .bind(key, JSON.stringify(body.value ?? null), Date.now())
        .run();

      return json({ ok: true }, headers);
    }

    return json({ error: "not found" }, headers, 404);
  },
};
