import { googleAccessTokenFromServiceAccount } from "./google-auth";
import { loadAnalyticsSnapshot } from "./client";
import type { PluginPersistence } from "../../../types/plugin";
import type {
  AnalyticsCredentials,
  AnalyticsSiteProfile,
  AnalyticsSiteSnapshot,
  AnalyticsSiteSummary,
  AnalyticsSitesConfig,
  AnalyticsSnapshot,
} from "./types";

export const DEFAULT_ANALYTICS_SITES_FILE = "~/.signalbase/analytics-sites.json";

const CACHE_KIND = "snapshot";
const CACHE_SCHEMA_VERSION = 1;
const ADDED_SITES_STATE_KEY = "added-sites";
const ADDED_SITES_SCHEMA_VERSION = 1;
const CACHE_POLICY = {
  staleMs: 60_000,
  expireMs: 7 * 24 * 60 * 60 * 1000,
} as const;

let persistence: PluginPersistence | null = null;

export function attachAnalyticsPersistence(next: PluginPersistence): void {
  persistence = next;
}

export function resetAnalyticsPersistence(): void {
  persistence = null;
}

interface AnalyticsSitesSourceOptions {
  env?: Record<string, string | undefined>;
  readJson?: (path: string) => Promise<unknown | null>;
  readText?: (path: string) => Promise<string | null>;
}

function runtimeEnv(): Record<string, string | undefined> {
  return typeof process === "undefined" || !process.env ? {} : process.env;
}

function expandHome(path: string, env: Record<string, string | undefined>): string {
  if (path === "~") return env.HOME || path;
  return path.startsWith("~/") && env.HOME ? `${env.HOME}/${path.slice(2)}` : path;
}

async function runtimeReadJson(path: string): Promise<unknown | null> {
  if (typeof Bun === "undefined") return null;
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return file.json();
}

async function runtimeReadText(path: string): Promise<string | null> {
  if (typeof Bun === "undefined") return null;
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  return file.text();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function siteId(value: unknown, fallback: string): string {
  const candidate = optionalString(value) ?? fallback;
  const normalized = candidate
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function parseSite(value: unknown, index: number): AnalyticsSiteProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const domain = optionalString(candidate.domain) ?? optionalString(candidate.name) ?? `site-${index + 1}`;
  return {
    id: siteId(candidate.id, siteId(domain, `site-${index + 1}`)),
    name: optionalString(candidate.name) ?? domain,
    domain,
    googlePropertyId: optionalString(candidate.googlePropertyId),
    googleAccessToken: optionalString(candidate.googleAccessToken),
    googleAccessTokenEnv: optionalString(candidate.googleAccessTokenEnv),
    googleServiceAccountFile: optionalString(candidate.googleServiceAccountFile),
    stripeSecretKey: optionalString(candidate.stripeSecretKey),
    stripeSecretKeyEnv: optionalString(candidate.stripeSecretKeyEnv),
    stripeSecretKeyFile: optionalString(candidate.stripeSecretKeyFile),
  };
}

export function parseAnalyticsSitesConfig(value: unknown): AnalyticsSitesConfig {
  const root = Array.isArray(value)
    ? { sites: value }
    : value && typeof value === "object"
      ? value as Record<string, unknown>
      : {};
  const rawSites = Array.isArray(root.sites) ? root.sites : [];
  const seen = new Set<string>();
  const sites = rawSites.flatMap((entry, index) => {
    const site = parseSite(entry, index);
    if (!site || seen.has(site.id)) return [];
    seen.add(site.id);
    return [site];
  });
  const requestedActive = optionalString(root.activeSiteId);
  return {
    activeSiteId: requestedActive && seen.has(requestedActive) ? requestedActive : sites[0]?.id,
    sites,
  };
}

function addedSites(): AnalyticsSiteProfile[] {
  if (!persistence?.getState) return [];
  const saved = persistence.getState<unknown>(ADDED_SITES_STATE_KEY, {
    schemaVersion: ADDED_SITES_SCHEMA_VERSION,
  });
  return parseAnalyticsSitesConfig({ sites: Array.isArray(saved) ? saved : [] }).sites;
}

function withAddedSites(config: AnalyticsSitesConfig): AnalyticsSitesConfig {
  const savedSites = addedSites();
  const configuredSites = config.sites.length === 1 && config.sites[0]?.id === "demo" && savedSites.length
    ? []
    : config.sites;
  const ids = new Set(configuredSites.map((site) => site.id));
  const domains = new Set(configuredSites.map((site) => site.domain.toLowerCase()));
  const additions = savedSites.flatMap((site) => {
    const domain = site.domain.toLowerCase();
    if (ids.has(site.id) || domains.has(domain)) return [];
    ids.add(site.id);
    domains.add(domain);
    return [site];
  });
  const sites = [...configuredSites, ...additions];
  return {
    activeSiteId: sites.some((site) => site.id === config.activeSiteId) ? config.activeSiteId : sites[0]?.id,
    sites,
  };
}

function legacySite(env: Record<string, string | undefined>): AnalyticsSiteProfile | null {
  const googlePropertyId = optionalString(env.GOOGLE_ANALYTICS_PROPERTY_ID);
  const googleAccessToken = optionalString(env.GOOGLE_ANALYTICS_ACCESS_TOKEN);
  const stripeSecretKey = optionalString(env.STRIPE_SECRET_KEY);
  if (!googlePropertyId && !googleAccessToken && !stripeSecretKey) return null;
  const domain = optionalString(env.SIGNALBASE_ANALYTICS_SITE) ?? "Default site";
  return {
    id: siteId(domain, "default"),
    name: domain,
    domain,
    googlePropertyId,
    googleAccessToken,
    stripeSecretKey,
  };
}

export async function loadAnalyticsSitesConfig(
  options: AnalyticsSitesSourceOptions = {},
): Promise<AnalyticsSitesConfig> {
  const env = options.env ?? runtimeEnv();
  const inline = optionalString(env.SIGNALBASE_ANALYTICS_SITES);
  if (inline) {
    try {
      return withAddedSites(parseAnalyticsSitesConfig(JSON.parse(inline)));
    } catch (error) {
      throw new Error(`SIGNALBASE_ANALYTICS_SITES is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const path = expandHome(
    optionalString(env.SIGNALBASE_ANALYTICS_SITES_FILE) ?? DEFAULT_ANALYTICS_SITES_FILE,
    env,
  );
  const fileValue = await (options.readJson ?? runtimeReadJson)(path);
  if (fileValue !== null) return withAddedSites(parseAnalyticsSitesConfig(fileValue));

  const legacy = legacySite(env);
  return withAddedSites(legacy
    ? { activeSiteId: legacy.id, sites: [legacy] }
    : { activeSiteId: "demo", sites: [{ id: "demo", name: "Demo", domain: "Demo" }] });
}

function normalizeSiteDomain(value: string): string {
  const candidate = value.trim();
  if (!candidate) throw new Error("Enter a website domain.");
  let url: URL;
  try {
    url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
  } catch {
    throw new Error("Enter a valid website such as example.com.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Website URLs must use HTTP or HTTPS.");
  }
  const domain = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!domain) throw new Error("Enter a valid website such as example.com.");
  return domain;
}

function emptySnapshot(message: string): AnalyticsSnapshot {
  return {
    source: "partial",
    generatedAt: new Date().toISOString(),
    totals: { visitors: 0, sessions: 0, pageViews: 0, checkouts: 0, revenue: 0, bounceRate: 0, averageSessionDuration: 0 },
    daily: [],
    referrers: [],
    countries: [],
    pages: [],
    devices: [],
    checkouts: [],
    warnings: [message],
  };
}

export async function addAnalyticsSite(
  domainInput: string,
  options: AnalyticsSitesSourceOptions = {},
): Promise<AnalyticsSiteSnapshot> {
  if (!persistence) throw new Error("Analytics storage is not ready.");
  const domain = normalizeSiteDomain(domainInput);
  const config = await loadAnalyticsSitesConfig(options);
  const existing = config.sites.find((site) => site.domain.toLowerCase() === domain);
  if (existing) return loadAnalyticsSiteSnapshot(existing.id, false, options);

  const baseId = siteId(domain, "site");
  let id = baseId;
  for (let suffix = 2; config.sites.some((site) => site.id === id); suffix += 1) id = `${baseId}-${suffix}`;
  persistence.setState(
    ADDED_SITES_STATE_KEY,
    [...addedSites(), { id, name: domain, domain }],
    { schemaVersion: ADDED_SITES_SCHEMA_VERSION },
  );
  return loadAnalyticsSiteSnapshot(id, false, options);
}

function envSecret(name: string | undefined, env: Record<string, string | undefined>): string | undefined {
  return name ? optionalString(env[name]) : undefined;
}

async function credentialsForSite(
  site: AnalyticsSiteProfile,
  env: Record<string, string | undefined>,
  readJson: (path: string) => Promise<unknown | null>,
  readText: (path: string) => Promise<string | null>,
): Promise<AnalyticsCredentials> {
  let googleAccessToken = site.googleAccessToken ?? envSecret(site.googleAccessTokenEnv, env);
  if (!googleAccessToken && site.googlePropertyId && site.googleServiceAccountFile) {
    const path = expandHome(site.googleServiceAccountFile, env);
    const account = await readJson(path);
    if (account === null) throw new Error(`Google service account file not found: ${path}`);
    googleAccessToken = await googleAccessTokenFromServiceAccount(account);
  }
  let stripeSecretKey = site.stripeSecretKey ?? envSecret(site.stripeSecretKeyEnv, env);
  if (!stripeSecretKey && site.stripeSecretKeyFile) {
    stripeSecretKey = optionalString(await readText(expandHome(site.stripeSecretKeyFile, env)));
  }
  return {
    googlePropertyId: site.googlePropertyId,
    googleAccessToken,
    stripeSecretKey,
  };
}

function summarizeSite(site: AnalyticsSiteProfile, env: Record<string, string | undefined>): AnalyticsSiteSummary {
  return {
    id: site.id,
    name: site.name,
    domain: site.domain,
    googleConfigured: !!site.googlePropertyId && !!(
      site.googleAccessToken
      || envSecret(site.googleAccessTokenEnv, env)
      || site.googleServiceAccountFile
    ),
    stripeConfigured: !!(
      site.stripeSecretKey
      || envSecret(site.stripeSecretKeyEnv, env)
      || site.stripeSecretKeyFile
    ),
  };
}

function isAnalyticsSnapshot(value: unknown): value is AnalyticsSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<AnalyticsSnapshot>;
  return (snapshot.source === "demo" || snapshot.source === "live" || snapshot.source === "partial")
    && typeof snapshot.generatedAt === "string"
    && !!snapshot.totals && typeof snapshot.totals === "object"
    && Array.isArray(snapshot.daily)
    && Array.isArray(snapshot.referrers)
    && Array.isArray(snapshot.countries)
    && Array.isArray(snapshot.pages)
    && Array.isArray(snapshot.devices)
    && Array.isArray(snapshot.checkouts)
    && Array.isArray(snapshot.warnings);
}

function readCachedSnapshot(siteId: string, allowExpired = false): AnalyticsSnapshot | null {
  // ponytail: a site ID is the cache identity; use a new ID if the account behind it changes.
  const record = persistence?.getResource<AnalyticsSnapshot>(CACHE_KIND, siteId, {
    schemaVersion: CACHE_SCHEMA_VERSION,
    allowExpired,
  });
  return record && isAnalyticsSnapshot(record.value) ? record.value : null;
}

function writeCachedSnapshot(siteId: string, snapshot: AnalyticsSnapshot): void {
  if (snapshot.source === "demo") return;
  persistence?.setResource(CACHE_KIND, siteId, snapshot, {
    schemaVersion: CACHE_SCHEMA_VERSION,
    cachePolicy: CACHE_POLICY,
  });
}

export async function loadAnalyticsSiteSnapshot(
  siteId: string | undefined,
  force = false,
  options: AnalyticsSitesSourceOptions = {},
): Promise<AnalyticsSiteSnapshot> {
  const env = options.env ?? runtimeEnv();
  const readJson = options.readJson ?? runtimeReadJson;
  const readText = options.readText ?? runtimeReadText;
  const config = await loadAnalyticsSitesConfig({ env, readJson });
  const active = config.sites.find((site) => site.id === siteId)
    ?? config.sites.find((site) => site.id === config.activeSiteId)
    ?? config.sites[0];
  if (!active) throw new Error("No analytics sites are configured.");
  const base = {
    activeSiteId: active.id,
    sites: config.sites.map((site) => summarizeSite(site, env)),
  };
  const cached = readCachedSnapshot(active.id);
  if (!force && cached) return { ...base, snapshot: cached, cached: true };

  const fallback = cached ?? readCachedSnapshot(active.id, true);
  try {
    const credentials = await credentialsForSite(active, env, readJson, readText);
    if (!credentials.googleAccessToken && !credentials.stripeSecretKey) {
      return {
        ...base,
        snapshot: emptySnapshot(`Connect Google Analytics or Stripe for ${active.domain}.`),
        cached: false,
      };
    }
    const snapshot = await loadAnalyticsSnapshot({
      credentials,
      force,
      cacheKey: active.id,
    });
    if (snapshot.source === "demo" && fallback && (credentials.googleAccessToken || credentials.stripeSecretKey)) {
      return { ...base, snapshot: fallback, cached: true };
    }
    writeCachedSnapshot(active.id, snapshot);
    return { ...base, snapshot, cached: false };
  } catch (error) {
    if (fallback) return { ...base, snapshot: fallback, cached: true };
    throw error;
  }
}
