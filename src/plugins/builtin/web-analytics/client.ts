import { createDemoSnapshot } from "./demo";
import type {
  AnalyticsBreakdownRow,
  AnalyticsCheckout,
  AnalyticsCredentials,
  AnalyticsDailyPoint,
  AnalyticsSnapshot,
  AnalyticsTotals,
} from "./types";

type Fetcher = typeof fetch;

interface GoogleReportRow {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
}

interface GoogleReport {
  rows?: GoogleReportRow[];
  totals?: GoogleReportRow[];
}

interface GoogleReports {
  summary: GoogleReport;
  daily: GoogleReport;
  referrers: GoogleReport;
  countries: GoogleReport;
  pages: GoogleReport;
  devices: GoogleReport;
}

interface StripeSession {
  id?: string;
  amount_total?: number | null;
  currency?: string | null;
  created?: number;
  mode?: string;
  payment_status?: string;
  status?: string;
  customer?: string | { id?: string } | null;
  subscription?: string | { id?: string } | null;
  customer_details?: {
    name?: string | null;
    email?: string | null;
    address?: { country?: string | null } | null;
  } | null;
  shipping_details?: { address?: { country?: string | null } | null } | null;
  collected_information?: {
    shipping_details?: { address?: { country?: string | null } | null } | null;
  } | null;
  metadata?: Record<string, string> | null;
}

interface StripeInvoice {
  id?: string;
  amount_paid?: number;
  currency?: string | null;
  created?: number;
  billing_reason?: string | null;
  customer?: string | {
    id?: string;
    address?: { country?: string | null } | null;
    shipping?: { address?: { country?: string | null } | null } | null;
  } | null;
  customer_address?: { country?: string | null } | null;
  customer_shipping?: { address?: { country?: string | null } | null } | null;
  subscription?: string | { id?: string } | null;
  parent?: { type?: string; subscription_details?: { subscription?: string | { id?: string } | null } } | null;
  metadata?: Record<string, string> | null;
}

interface StripeListResponse<T> {
  data?: T[];
  has_more?: boolean;
}

interface GoogleAnalyticsResult {
  totals: Omit<AnalyticsTotals, "checkouts" | "revenue">;
  daily: Array<Omit<AnalyticsDailyPoint, "checkouts" | "revenue">>;
  referrers: AnalyticsBreakdownRow[];
  countries: AnalyticsBreakdownRow[];
  pages: AnalyticsBreakdownRow[];
  devices: AnalyticsBreakdownRow[];
}

interface StripeResult {
  checkouts: AnalyticsCheckout[];
  daily: Map<string, { checkouts: number; revenue: number }>;
  revenueBySource: Map<string, number>;
  revenueByCountry: Map<string, number>;
}

const GOOGLE_REPORT_URL = "https://analyticsdata.googleapis.com/v1beta";
const STRIPE_SESSIONS_URL = "https://api.stripe.com/v1/checkout/sessions";
const STRIPE_INVOICES_URL = "https://api.stripe.com/v1/invoices";
const STRIPE_ATTRIBUTION_LOOKBACK_DAYS = 365;
const CACHE_TTL_MS = 60_000;
const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

const cached = new Map<string, { at: number; snapshot: AnalyticsSnapshot }>();
const inFlight = new Map<string, Promise<AnalyticsSnapshot>>();

function numberAt(row: GoogleReportRow | undefined, index: number): number {
  const value = Number(row?.metricValues?.[index]?.value ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function labelAt(row: GoogleReportRow | undefined): string {
  const value = row?.dimensionValues?.[0]?.value?.trim();
  return value && value !== "(not set)" ? value : "Unknown";
}

function normalizeGoogleDate(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return null;
  const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  return Number.isFinite(new Date(`${date}T12:00:00Z`).getTime()) ? date : null;
}

function breakdown(report: GoogleReport): AnalyticsBreakdownRow[] {
  return (report.rows ?? [])
    .map((row) => ({ label: labelAt(row), visitors: Math.round(numberAt(row, 0)), revenue: 0 }))
    .filter((row) => row.visitors > 0)
    .sort((left, right) => right.visitors - left.visitors || left.label.localeCompare(right.label))
    .slice(0, 12);
}

export function parseGoogleAnalyticsReports(reports: GoogleReports): GoogleAnalyticsResult {
  const summary = reports.summary.rows?.[0] ?? reports.summary.totals?.[0];
  const daily = (reports.daily.rows ?? []).flatMap((row) => {
    const date = normalizeGoogleDate(labelAt(row));
    if (!date) return [];
    return [{
      date,
      visitors: Math.round(numberAt(row, 0)),
      sessions: Math.round(numberAt(row, 1)),
    }];
  }).sort((left, right) => left.date.localeCompare(right.date));

  return {
    totals: {
      visitors: Math.round(numberAt(summary, 0)),
      sessions: Math.round(numberAt(summary, 1)),
      pageViews: Math.round(numberAt(summary, 2)),
      bounceRate: numberAt(summary, 3),
      averageSessionDuration: numberAt(summary, 4),
    },
    daily,
    referrers: breakdown(reports.referrers),
    countries: breakdown(reports.countries),
    pages: breakdown(reports.pages),
    devices: breakdown(reports.devices),
  };
}

function amountInMajorUnits(amount: number, currency: string): number {
  return amount / (ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase()) ? 1 : 100);
}

function stripeDateLabel(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function isSubscriptionInvoice(invoice: StripeInvoice): boolean {
  return invoice.billing_reason?.startsWith("subscription") === true
    || !!invoice.subscription
    || invoice.parent?.type === "subscription_details"
    || !!invoice.parent?.subscription_details?.subscription;
}

function stripeObjectId(value: string | { id?: string } | null | undefined): string | undefined {
  return typeof value === "string" ? value : value?.id;
}

function stripeSessionCountry(session: StripeSession): string {
  return session.customer_details?.address?.country
    || session.shipping_details?.address?.country
    || session.collected_information?.shipping_details?.address?.country
    || session.metadata?.country
    || "Unknown";
}

function countryLabel(country: string): string {
  const code = country.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? REGION_NAMES.of(code) || code : country;
}

export function parseStripeSessions(
  sessions: StripeSession[],
  subscriptionInvoices: StripeInvoice[] = [],
  attributionSessions: StripeSession[] = sessions,
): StripeResult {
  const recurringInvoices = subscriptionInvoices.filter(isSubscriptionInvoice);
  const daily = new Map<string, { checkouts: number; revenue: number }>();
  const revenueBySource = new Map<string, number>();
  const revenueByCountry = new Map<string, number>();
  const countryBySubscription = new Map<string, string>();
  const countryByCustomer = new Map<string, string>();
  for (const session of attributionSessions) {
    const country = stripeSessionCountry(session);
    if (country === "Unknown") continue;
    const subscriptionId = stripeObjectId(session.subscription);
    const customerId = stripeObjectId(session.customer);
    if (subscriptionId) countryBySubscription.set(subscriptionId, country);
    if (customerId) countryByCustomer.set(customerId, country);
  }
  const checkouts = sessions.flatMap((session): AnalyticsCheckout[] => {
    if (!session.id || !session.created) return [];
    const currency = session.currency?.toLowerCase() || "usd";
    const amount = amountInMajorUnits(session.amount_total ?? 0, currency);
    const date = new Date(session.created * 1000).toISOString().slice(0, 10);
    const current = daily.get(date) ?? { checkouts: 0, revenue: 0 };
    current.checkouts += 1;
    // Paid subscription invoices are the source of truth for recurring
    // revenue. Exclude subscription-mode Checkout value when invoice data is
    // present so the first payment is not counted twice.
    const checkoutRevenue = session.mode === "subscription" && recurringInvoices.length > 0 ? 0 : amount;
    current.revenue += checkoutRevenue;
    daily.set(date, current);

    // Stripe does not receive GA attribution automatically. Keep absent
    // metadata distinct from GA's real "Direct / None" traffic bucket.
    const source = session.metadata?.source || session.metadata?.utm_source || "Unattributed";
    const country = stripeSessionCountry(session);
    revenueBySource.set(source, (revenueBySource.get(source) ?? 0) + checkoutRevenue);
    const revenueCountry = countryLabel(country);
    revenueByCountry.set(revenueCountry, (revenueByCountry.get(revenueCountry) ?? 0) + checkoutRevenue);

    return [{
      id: session.id,
      customer: session.customer_details?.name || "Anonymous customer",
      email: session.customer_details?.email || "—",
      amount,
      currency,
      status: session.payment_status || session.status || "complete",
      source,
      country,
      createdAt: stripeDateLabel(session.created),
    }];
  });

  for (const invoice of recurringInvoices) {
    if (!invoice.id || !invoice.created) continue;
    const currency = invoice.currency?.toLowerCase() || "usd";
    const amount = amountInMajorUnits(invoice.amount_paid ?? 0, currency);
    if (amount <= 0) continue;
    const date = new Date(invoice.created * 1000).toISOString().slice(0, 10);
    const current = daily.get(date) ?? { checkouts: 0, revenue: 0 };
    current.revenue += amount;
    daily.set(date, current);
    const source = invoice.metadata?.source || invoice.metadata?.utm_source || "Subscriptions";
    const expandedCustomer = typeof invoice.customer === "object" ? invoice.customer : null;
    const subscriptionId = stripeObjectId(
      invoice.subscription ?? invoice.parent?.subscription_details?.subscription,
    );
    const customerId = stripeObjectId(invoice.customer);
    const country = invoice.customer_address?.country
      || invoice.customer_shipping?.address?.country
      || expandedCustomer?.address?.country
      || expandedCustomer?.shipping?.address?.country
      || (subscriptionId ? countryBySubscription.get(subscriptionId) : undefined)
      || (customerId ? countryByCustomer.get(customerId) : undefined)
      || invoice.metadata?.country
      || "Unknown";
    revenueBySource.set(source, (revenueBySource.get(source) ?? 0) + amount);
    const revenueCountry = countryLabel(country);
    revenueByCountry.set(revenueCountry, (revenueByCountry.get(revenueCountry) ?? 0) + amount);
  }

  return {
    // Stripe returns Checkout Sessions newest-first. Preserve that API order;
    // the localized display label is intentionally not used as a sortable date.
    checkouts: checkouts.slice(0, 100),
    daily,
    revenueBySource,
    revenueByCountry,
  };
}

function nativeCredentials(): AnalyticsCredentials {
  if (typeof process === "undefined" || !process.env) return {};
  return {
    googlePropertyId: process.env.GOOGLE_ANALYTICS_PROPERTY_ID?.trim() || undefined,
    googleAccessToken: process.env.GOOGLE_ANALYTICS_ACCESS_TOKEN?.trim() || undefined,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() || undefined,
  };
}

async function googleReport(
  fetcher: Fetcher,
  propertyId: string,
  accessToken: string,
  dimension: string | null,
  metrics: string[],
  limit = 100,
): Promise<GoogleReport> {
  const response = await fetcher(`${GOOGLE_REPORT_URL}/properties/${encodeURIComponent(propertyId)}:runReport`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      dateRanges: [{ startDate: "29daysAgo", endDate: "today" }],
      dimensions: dimension ? [{ name: dimension }] : [],
      metrics: metrics.map((name) => ({ name })),
      limit,
      keepEmptyRows: false,
      ...(dimension ? { orderBys: [{ metric: { metricName: metrics[0] }, desc: true }] } : {}),
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google Analytics ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  return response.json() as Promise<GoogleReport>;
}

async function fetchGoogleAnalytics(fetcher: Fetcher, propertyId: string, accessToken: string): Promise<GoogleAnalyticsResult> {
  const summaryMetrics = ["totalUsers", "sessions", "screenPageViews", "bounceRate", "averageSessionDuration"];
  const [summary, daily, referrers, countries, pages, devices] = await Promise.all([
    googleReport(fetcher, propertyId, accessToken, null, summaryMetrics, 1),
    googleReport(fetcher, propertyId, accessToken, "date", ["totalUsers", "sessions"], 31),
    googleReport(fetcher, propertyId, accessToken, "sessionSourceMedium", ["totalUsers"], 12),
    googleReport(fetcher, propertyId, accessToken, "country", ["totalUsers"], 12),
    googleReport(fetcher, propertyId, accessToken, "pagePath", ["screenPageViews"], 12),
    googleReport(fetcher, propertyId, accessToken, "deviceCategory", ["totalUsers"], 12),
  ]);
  return parseGoogleAnalyticsReports({ summary, daily, referrers, countries, pages, devices });
}

async function fetchStripeList<T>(
  fetcher: Fetcher,
  url: string,
  secretKey: string,
  params: URLSearchParams,
): Promise<T[]> {
  const values: T[] = [];
  let startingAfter: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const pageParams = new URLSearchParams(params);
    if (startingAfter) pageParams.set("starting_after", startingAfter);
    const response = await fetcher(`${url}?${pageParams}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Stripe ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
    }
    const body = await response.json() as StripeListResponse<T>;
    const pageValues = body.data ?? [];
    values.push(...pageValues);
    if (!body.has_more || pageValues.length === 0) break;
    const last = pageValues.at(-1) as { id?: string } | undefined;
    startingAfter = last?.id;
    if (!startingAfter) break;
  }
  return values;
}

async function fetchStripe(fetcher: Fetcher, secretKey: string): Promise<StripeResult> {
  const createdAfter = Math.floor(Date.now() / 1000) - 30 * 86_400;
  // ponytail: one year covers current accounts; persist the Checkout mapping if older renewals become common.
  const attributionAfter = Math.floor(Date.now() / 1000) - STRIPE_ATTRIBUTION_LOOKBACK_DAYS * 86_400;
  const invoiceParams = new URLSearchParams({
    limit: "100",
    status: "paid",
    "created[gte]": String(createdAfter),
  });
  invoiceParams.append("expand[]", "data.customer");
  const [attributionSessions, invoices] = await Promise.all([
    fetchStripeList<StripeSession>(fetcher, STRIPE_SESSIONS_URL, secretKey, new URLSearchParams({
      limit: "100",
      status: "complete",
      "created[gte]": String(attributionAfter),
    })),
    fetchStripeList<StripeInvoice>(fetcher, STRIPE_INVOICES_URL, secretKey, invoiceParams),
  ]);
  const sessions = attributionSessions.filter((session) => (session.created ?? 0) >= createdAfter);

  return parseStripeSessions(sessions, invoices, attributionSessions);
}

function emptyDaily(now = new Date()): AnalyticsDailyPoint[] {
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now);
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (29 - index));
    return { date: date.toISOString().slice(0, 10), visitors: 0, sessions: 0, checkouts: 0, revenue: 0 };
  });
}

function withAttributedRevenue(rows: AnalyticsBreakdownRow[], revenue: Map<string, number>): AnalyticsBreakdownRow[] {
  return rows.map((row) => ({ ...row, revenue: revenue.get(row.label) ?? 0 }));
}

async function fetchSnapshot(fetcher: Fetcher, credentials: AnalyticsCredentials): Promise<AnalyticsSnapshot> {
  const hasGoogle = !!credentials.googlePropertyId && !!credentials.googleAccessToken;
  const hasStripe = !!credentials.stripeSecretKey;
  if (!hasGoogle && !hasStripe) return createDemoSnapshot();

  const [googleResult, stripeResult] = await Promise.allSettled([
    hasGoogle
      ? fetchGoogleAnalytics(fetcher, credentials.googlePropertyId!, credentials.googleAccessToken!)
      : Promise.resolve(null),
    hasStripe ? fetchStripe(fetcher, credentials.stripeSecretKey!) : Promise.resolve(null),
  ]);
  const google = googleResult.status === "fulfilled" ? googleResult.value : null;
  const stripe = stripeResult.status === "fulfilled" ? stripeResult.value : null;
  const warnings: string[] = [];
  if (!hasGoogle) warnings.push("Google Analytics is not configured.");
  else if (googleResult.status === "rejected") warnings.push(googleResult.reason instanceof Error ? googleResult.reason.message : "Google Analytics request failed.");
  if (!hasStripe) warnings.push("Stripe is not configured.");
  else if (stripeResult.status === "rejected") warnings.push(stripeResult.reason instanceof Error ? stripeResult.reason.message : "Stripe request failed.");

  if (!google && !stripe) {
    const demo = createDemoSnapshot();
    return { ...demo, warnings };
  }

  const byDate = new Map(emptyDaily().map((point) => [point.date, point]));
  for (const point of google?.daily ?? []) {
    const current = byDate.get(point.date);
    if (current) Object.assign(current, point);
  }
  for (const [date, value] of stripe?.daily ?? []) {
    const current = byDate.get(date);
    if (current) Object.assign(current, value);
  }
  const daily = [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
  const revenue = daily.reduce((total, point) => total + point.revenue, 0);
  const checkoutCount = daily.reduce((total, point) => total + point.checkouts, 0);
  const totals: AnalyticsTotals = {
    visitors: google?.totals.visitors ?? 0,
    sessions: google?.totals.sessions ?? 0,
    pageViews: google?.totals.pageViews ?? 0,
    bounceRate: google?.totals.bounceRate ?? 0,
    averageSessionDuration: google?.totals.averageSessionDuration ?? 0,
    checkouts: checkoutCount,
    revenue,
  };

  return {
    source: google && stripe ? "live" : "partial",
    generatedAt: new Date().toISOString(),
    totals,
    daily,
    referrers: withAttributedRevenue(google?.referrers ?? [], stripe?.revenueBySource ?? new Map()),
    countries: withAttributedRevenue(
      (google?.countries ?? []).filter((row) => row.label !== "Unknown"),
      stripe?.revenueByCountry ?? new Map(),
    ),
    pages: google?.pages ?? [],
    devices: google?.devices ?? [],
    checkouts: stripe?.checkouts ?? [],
    warnings,
  };
}

export async function loadAnalyticsSnapshot(options: {
  fetcher?: Fetcher;
  credentials?: AnalyticsCredentials;
  force?: boolean;
  cacheKey?: string;
} = {}): Promise<AnalyticsSnapshot> {
  const now = Date.now();
  const cacheKey = options.cacheKey ?? "default";
  const cachedEntry = cached.get(cacheKey);
  if (!options.force && cachedEntry && now - cachedEntry.at < CACHE_TTL_MS) return cachedEntry.snapshot;
  const pending = inFlight.get(cacheKey);
  if (!options.force && pending) return pending;
  const credentials = options.credentials ?? nativeCredentials();
  const request = fetchSnapshot(options.fetcher ?? fetch, credentials)
    .then((snapshot) => {
      cached.set(cacheKey, { at: Date.now(), snapshot });
      return snapshot;
    })
    .finally(() => {
      if (inFlight.get(cacheKey) === request) inFlight.delete(cacheKey);
    });
  inFlight.set(cacheKey, request);
  return request;
}

export function resetAnalyticsSnapshotCache(): void {
  cached.clear();
  inFlight.clear();
}
