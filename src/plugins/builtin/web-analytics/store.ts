import { useEffect, useSyncExternalStore } from "react";
import { useCapabilityInvoker, type PluginRuntimeAccess } from "../../runtime";
import { createDemoSnapshot } from "./demo";
import { WEB_ANALYTICS_CAPABILITY_ID } from "./capability";
import { loadAnalyticsSiteSnapshot } from "./sites";
import type { AnalyticsSiteSnapshot, AnalyticsSiteSummary, AnalyticsSnapshot } from "./types";

interface AnalyticsStoreState {
  snapshot: AnalyticsSnapshot;
  sites: AnalyticsSiteSummary[];
  activeSiteId: string;
  loading: boolean;
  ready: boolean;
  cached: boolean;
  error: string | null;
}

let state: AnalyticsStoreState = {
  snapshot: createDemoSnapshot(),
  sites: [{ id: "demo", name: "Demo", domain: "Demo", googleConfigured: false, stripeConfigured: false }],
  activeSiteId: "demo",
  loading: false,
  ready: false,
  cached: false,
  error: null,
};
let request: Promise<void> | null = null;
let requestGeneration = 0;
let runtime: PluginRuntimeAccess | null = null;
const listeners = new Set<() => void>();

function emit(next: AnalyticsStoreState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AnalyticsStoreState {
  return state;
}

export function refreshAnalyticsSnapshot(force = false): Promise<void> {
  if (request && !force) return request;
  const generation = ++requestGeneration;
  const siteId = state.activeSiteId;
  emit({ ...state, loading: true, error: null });
  const loader = runtime
    ? runtime.invokeCapability<AnalyticsSiteSnapshot>(
        WEB_ANALYTICS_CAPABILITY_ID,
        "load",
        { siteId, force },
      )
    : loadAnalyticsSiteSnapshot(siteId, force);
  const current = loader
    .then((result) => {
      if (generation !== requestGeneration) return;
      emit({
        snapshot: result.snapshot,
        sites: result.sites,
        activeSiteId: result.activeSiteId,
        loading: false,
        ready: true,
        cached: result.cached,
        error: null,
      });
      if (result.cached && !force) queueMicrotask(() => void refreshAnalyticsSnapshot(true));
    })
    .catch((error) => {
      if (generation !== requestGeneration) return;
      const message = error instanceof Error ? error.message : String(error);
      emit({ ...state, loading: false, error: message });
    })
    .finally(() => {
      if (request === current) request = null;
    });
  request = current;
  return current;
}

export function selectAnalyticsSite(siteId: string): void {
  if (siteId === state.activeSiteId || !state.sites.some((site) => site.id === siteId)) return;
  request = null;
  emit({ ...state, activeSiteId: siteId, loading: true, ready: false, cached: false, error: null });
  void refreshAnalyticsSnapshot();
}

export async function addAnalyticsSite(domain: string): Promise<void> {
  if (!runtime) throw new Error("Analytics is still starting.");
  const generation = ++requestGeneration;
  emit({ ...state, loading: true, error: null });
  try {
    const result = await runtime.invokeCapability<AnalyticsSiteSnapshot>(
      WEB_ANALYTICS_CAPABILITY_ID,
      "addSite",
      { domain },
    );
    if (generation !== requestGeneration) return;
    emit({
      snapshot: result.snapshot,
      sites: result.sites,
      activeSiteId: result.activeSiteId,
      loading: false,
      ready: true,
      cached: result.cached,
      error: null,
    });
  } catch (error) {
    if (generation !== requestGeneration) return;
    emit({ ...state, loading: false, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export function useAnalyticsSnapshot(): AnalyticsStoreState {
  const capabilityRuntime = useCapabilityInvoker();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    runtime = capabilityRuntime;
    void refreshAnalyticsSnapshot();
  }, [capabilityRuntime]);
  return snapshot;
}
