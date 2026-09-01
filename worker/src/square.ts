/**
 * Sending one payment link at a time was the actual bottleneck in chasing balances — UP can
 * print a statement per patient and Square can bill a patient, but both are one-at-a-time, so
 * a list of thirty never got worked through.
 *
 * Square's own batch invoicing only sends the *same* invoice to many customers, which is no
 * use when every balance differs, and it has no CSV import. So the Invoices API it is: for
 * each patient, find or create the customer, build an order from their charges, raise an
 * invoice against it and publish. Square sends the email, hosts the payment page, chases with
 * reminders, and — the part that closes the loop — will tell us later who actually paid.
 *
 * The token lives here in the Worker and never reaches the browser.
 */

export interface SquareEnv {
  SQUARE_ACCESS_TOKEN?: string;
  /** "production" opts in to real emails. Anything else, including unset, stays in sandbox. */
  SQUARE_ENV?: string;
  /** Optional: the first location on the account is used when this is not set. */
  SQUARE_LOCATION_ID?: string;
}

const SQUARE_VERSION = "2026-08-19";

/**
 * Defaulting to sandbox matters: a deploy that is half-configured must not be able to email
 * real patients asking for money.
 */
function squareBase(env: SquareEnv): string {
  return env.SQUARE_ENV === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

export function squareConfigured(env: SquareEnv): boolean {
  return Boolean(env.SQUARE_ACCESS_TOKEN);
}

export function squareMode(env: SquareEnv): "sandbox" | "production" {
  return env.SQUARE_ENV === "production" ? "production" : "sandbox";
}

interface SquareError {
  detail?: string;
  code?: string;
  field?: string;
}

class SquareRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SquareRequestError";
  }
}

async function squareFetch<T>(
  env: SquareEnv,
  path: string,
  init: { method: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${squareBase(env)}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
      "Square-Version": SQUARE_VERSION,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new SquareRequestError(`Square returned unreadable output (${response.status})`);
  }

  if (!response.ok) {
    const errors = (parsed as { errors?: SquareError[] }).errors ?? [];
    // Square's detail strings are written for humans, so they are worth surfacing verbatim
    // rather than replacing with a generic failure.
    const detail = errors.map((e) => e.detail ?? e.code).filter(Boolean).join("; ");
    throw new SquareRequestError(detail || `Square request failed (${response.status})`);
  }

  return parsed as T;
}

async function resolveLocationId(env: SquareEnv): Promise<string> {
  if (env.SQUARE_LOCATION_ID) return env.SQUARE_LOCATION_ID;
  const body = await squareFetch<{ locations?: { id: string; status?: string }[] }>(
    env,
    "/v2/locations",
    { method: "GET" },
  );
  const active = body.locations?.find((location) => location.status !== "INACTIVE");
  if (!active) throw new SquareRequestError("No active Square location on this account");
  return active.id;
}

/** "Alvarez, Marisol" and "Marisol Alvarez" both have to land the right way round. */
export function splitName(full: string): { given: string; family: string } {
  const name = full.trim();
  if (!name) return { given: "", family: "" };
  if (name.includes(",")) {
    const [family, given] = name.split(",", 2);
    return { given: (given ?? "").trim(), family: family.trim() };
  }
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { given: parts[0], family: "" };
  return { given: parts.slice(0, -1).join(" "), family: parts[parts.length - 1] };
}

async function findOrCreateCustomer(
  env: SquareEnv,
  email: string,
  name: string,
  idempotencyKey: string,
): Promise<string> {
  const found = await squareFetch<{ customers?: { id: string }[] }>(env, "/v2/customers/search", {
    method: "POST",
    body: { query: { filter: { email_address: { exact: email } } }, limit: 1 },
  });
  const existing = found.customers?.[0]?.id;
  if (existing) return existing;

  const { given, family } = splitName(name);
  const created = await squareFetch<{ customer?: { id: string } }>(env, "/v2/customers", {
    method: "POST",
    body: {
      idempotency_key: idempotencyKey,
      given_name: given || undefined,
      family_name: family || undefined,
      email_address: email,
    },
  });
  const id = created.customer?.id;
  if (!id) throw new SquareRequestError("Square did not return a customer id");
  return id;
}

export interface InvoiceLineInput {
  /** yyyy-mm-dd, when the export carried one. */
  serviceDate?: string;
  description?: string;
  amountCents: number;
}

export interface InvoiceRequest {
  /** The app's own patient key, echoed back so results can be matched up. */
  key: string;
  name: string;
  email: string;
  amountCents: number;
  lines?: InvoiceLineInput[];
  note?: string;
  /** yyyy-mm-dd. */
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

/**
 * The balance-due report carries only a total per patient, so most invoices will have a single
 * line. When a report with dates of service is imported the lines come through and the invoice
 * itemises itself — which is what stops patients ringing up to ask what the charge is for.
 */
export function buildLineItems(request: InvoiceRequest): { name: string; quantity: string; base_price_money: { amount: number; currency: string } }[] {
  const lines = (request.lines ?? []).filter((line) => line.amountCents > 0);
  const linesTotal = lines.reduce((sum, line) => sum + line.amountCents, 0);

  // Only itemise when the parts actually add up to the balance; a mismatch would bill the
  // wrong amount, and being wrong about money is worse than being vague about dates.
  if (lines.length > 0 && linesTotal === request.amountCents) {
    return lines.map((line) => ({
      name: [line.serviceDate, line.description ?? "Acupuncture services"]
        .filter(Boolean)
        .join(" · "),
      quantity: "1",
      base_price_money: { amount: line.amountCents, currency: "USD" },
    }));
  }

  return [
    {
      name: request.note?.trim() || "Patient balance",
      quantity: "1",
      base_price_money: { amount: request.amountCents, currency: "USD" },
    },
  ];
}

async function sendOne(
  env: SquareEnv,
  locationId: string,
  batchId: string,
  request: InvoiceRequest,
): Promise<InvoiceResult> {
  try {
    const customerId = await findOrCreateCustomer(
      env,
      request.email,
      request.name,
      `${batchId}:${request.key}:customer`,
    );

    const order = await squareFetch<{ order?: { id: string } }>(env, "/v2/orders", {
      method: "POST",
      body: {
        idempotency_key: `${batchId}:${request.key}:order`,
        order: {
          location_id: locationId,
          customer_id: customerId,
          line_items: buildLineItems(request),
        },
      },
    });
    const orderId = order.order?.id;
    if (!orderId) throw new SquareRequestError("Square did not return an order id");

    const invoice = await squareFetch<{ invoice?: { id: string; version: number } }>(
      env,
      "/v2/invoices",
      {
        method: "POST",
        body: {
          idempotency_key: `${batchId}:${request.key}:invoice`,
          invoice: {
            location_id: locationId,
            order_id: orderId,
            primary_recipient: { customer_id: customerId },
            delivery_method: "EMAIL",
            payment_requests: [
              {
                request_type: "BALANCE",
                due_date: request.dueDate,
                tipping_enabled: false,
                automatic_payment_source: "NONE",
                // Square does the chasing that would otherwise be another manual pass.
                reminders: [
                  { message: "A friendly reminder that your balance is due soon.", relative_scheduled_days: -3 },
                  { message: "Your balance is now past due.", relative_scheduled_days: 7 },
                ],
              },
            ],
            accepted_payment_methods: {
              card: true,
              square_gift_card: false,
              bank_account: false,
              buy_now_pay_later: false,
              cash_app_pay: false,
            },
            title: "Patient balance",
            description: request.note?.trim() || undefined,
          },
        },
      },
    );

    const invoiceId = invoice.invoice?.id;
    const version = invoice.invoice?.version;
    if (!invoiceId || version === undefined) {
      throw new SquareRequestError("Square did not return an invoice id");
    }

    const published = await squareFetch<{
      invoice?: { id: string; invoice_number?: string; public_url?: string };
    }>(env, `/v2/invoices/${invoiceId}/publish`, {
      method: "PUT",
      body: { version, idempotency_key: `${batchId}:${request.key}:publish` },
    });

    return {
      key: request.key,
      ok: true,
      invoiceId,
      invoiceNumber: published.invoice?.invoice_number,
      publicUrl: published.invoice?.public_url,
    };
  } catch (error) {
    return {
      key: request.key,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown Square error",
    };
  }
}

/**
 * Sent one at a time on purpose. These are real emails asking real people for money, and a
 * burst of parallel writes against a rate limit would fail some of them for no reason a front
 * desk could act on. A batch is tens of patients, not thousands.
 */
export async function sendInvoices(
  env: SquareEnv,
  batchId: string,
  requests: InvoiceRequest[],
): Promise<InvoiceResult[]> {
  const locationId = await resolveLocationId(env);
  const results: InvoiceResult[] = [];
  for (const request of requests) {
    results.push(await sendOne(env, locationId, batchId, request));
  }
  return results;
}

export interface InvoiceStatus {
  invoiceId: string;
  status?: string;
  paidCents?: number;
  publicUrl?: string;
  error?: string;
}

/** Lets the app find out someone paid without waiting for them to drop off the next report. */
export async function getInvoiceStatuses(
  env: SquareEnv,
  invoiceIds: string[],
): Promise<InvoiceStatus[]> {
  const results: InvoiceStatus[] = [];
  for (const invoiceId of invoiceIds) {
    try {
      const body = await squareFetch<{
        invoice?: {
          status?: string;
          public_url?: string;
          total_completed_amount_money?: { amount?: number };
        };
      }>(env, `/v2/invoices/${encodeURIComponent(invoiceId)}`, { method: "GET" });
      results.push({
        invoiceId,
        status: body.invoice?.status,
        paidCents: body.invoice?.total_completed_amount_money?.amount,
        publicUrl: body.invoice?.public_url,
      });
    } catch (error) {
      results.push({
        invoiceId,
        error: error instanceof Error ? error.message : "Unknown Square error",
      });
    }
  }
  return results;
}
