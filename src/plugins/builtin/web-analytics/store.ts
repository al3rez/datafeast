import { useEffect, useSyncExternalStore } from "react";
import { loadAnalyticsSnapshot } from "./client";
import { createDemoSnapshot } from "./demo";
import type { AnalyticsSnapshot } from "./types";

interface AnalyticsStoreState {
  snapshot: AnalyticsSnapshot;
  loading: boolean;
  error: string | null;
}

let state: AnalyticsStoreState = {
  snapshot: createDemoSnapshot(),
  loading: false,
  error: null,
};
let request: Promise<void> | null = null;
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
  emit({ ...state, loading: true, error: null });
  const current = loadAnalyticsSnapshot({ force })
    .then((snapshot) => emit({ snapshot, loading: false, error: null }))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      emit({ ...state, loading: false, error: message });
    })
    .finally(() => {
      if (request === current) request = null;
    });
  request = current;
  return current;
}

export function useAnalyticsSnapshot(): AnalyticsStoreState {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => {
    void refreshAnalyticsSnapshot();
  }, []);
  return snapshot;
}
