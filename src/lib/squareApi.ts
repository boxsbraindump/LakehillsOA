/**
 * Talks to the Worker's Square endpoints. The access token lives on the Worker; nothing here
 * ever sees it, and the browser cannot bill anyone on its own.
 */
import { getAuthToken, getWorkspaceMeta, syncEnabled } from "./syncApi";
export { isSendableEmail, toCents } from "./billing";

const API_BASE = import.meta.env.VITE_API_BASE as string | undefined;

function headers(): HeadersInit {
  const token = getAuthToken();
  const workspaceId = getWorkspaceMeta()?.id;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(workspaceId ? { "X-Workspace-Id": workspaceId } : {}),
  };
}

export interface SquareConfig {
  configured: boolean;
  /** "sandbox" until the Worker is explicitly set to production — no accidental real emails. */
  mode: "sandbox" | "production";
}

export async function fetchSquareConfig(): Promise<SquareConfig> {
  if (!syncEnabled || !API_BASE) return { configured: false, mode: "sandbox" };
  try {
    const response = await fetch(`${API_BASE}/api/square/config`, { headers: headers() });
    if (!response.ok) return { configured: false, mode: "sandbox" };
    return (await response.json()) as SquareConfig;
  } catch {
    return { configured: false, mode: "sandbox" };
  }
}

export interface InvoiceLinePayload {
  serviceDate?: string;
  description?: string;
  amountCents: number;
}

export interface InvoicePayload {
  key: string;
  name: string;
  email: string;
  amountCents: number;
  lines?: InvoiceLinePayload[];
  note?: string;
  dueDate?: string;
}

export interface InvoiceResult {
  key: string;
  ok: boolean;
  invoiceId?: string;
  invoiceNumber?: string;
  publicUrl?: string;
  error?: string;
}

export interface SendInvoicesResponse {
  ok: boolean;
  mode?: "sandbox" | "production";
  results: InvoiceResult[];
  error?: string;
}

export async function sendSquareInvoices(
  batchId: string,
  patients: InvoicePayload[],
): Promise<SendInvoicesResponse> {
  if (!syncEnabled || !API_BASE) {
    return { ok: false, results: [], error: "sync_not_configured" };
  }
  try {
    const response = await fetch(`${API_BASE}/api/square/invoices`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ batchId, patients }),
    });
    const body = (await response.json()) as SendInvoicesResponse & { error?: string };
    if (!response.ok) return { ok: false, results: [], error: body.error ?? "request_failed" };
    return { ok: true, mode: body.mode, results: body.results ?? [] };
  } catch {
    return { ok: false, results: [], error: "network_error" };
  }
}

export interface InvoiceStatus {
  invoiceId: string;
  status?: string;
  paidCents?: number;
  publicUrl?: string;
  error?: string;
}

export async function fetchInvoiceStatuses(invoiceIds: string[]): Promise<InvoiceStatus[]> {
  if (!syncEnabled || !API_BASE || invoiceIds.length === 0) return [];
  try {
    const response = await fetch(`${API_BASE}/api/square/invoice-status`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ invoiceIds }),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { statuses?: InvoiceStatus[] };
    return body.statuses ?? [];
  } catch {
    return [];
  }
}

