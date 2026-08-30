import { afterEach, describe, expect, test } from "bun:test";
import type { PluginPersistence } from "../../../types/plugin";
import { createDemoSnapshot } from "./demo";
import { resetAnalyticsSnapshotCache } from "./client";
import { MemoryPluginPersistence } from "../../../test-support/plugin-persistence";
import {
  addAnalyticsSite,
  attachAnalyticsPersistence,
  loadAnalyticsSitesConfig,
  loadAnalyticsSiteSnapshot,
  parseAnalyticsSitesConfig,
  resetAnalyticsPersistence,
} from "./sites";

afterEach(() => {
  resetAnalyticsSnapshotCache();
  resetAnalyticsPersistence();
});

describe("analytics site profiles", () => {
  test("normalizes named sites and rejects duplicate IDs", () => {
    const config = parseAnalyticsSitesConfig({
      activeSiteId: "admix",
      sites: [
        { id: "admix", name: "admix.software", domain: "admix.software", googlePropertyId: "123" },
        { id: "admix", name: "Duplicate", domain: "duplicate.example" },
        { name: "Second Site", domain: "second.example" },
      ],
    });

    expect(config.activeSiteId).toBe("admix");
    expect(config.sites.map((site) => site.id)).toEqual(["admix", "second-example"]);
    expect(config.sites[1]?.name).toBe("Second Site");
  });

  test("persists a normalized website without copying credentials", async () => {
    const storage = new MemoryPluginPersistence();
    attachAnalyticsPersistence(storage);
    const options = {
      env: { HOME: "/tmp/signalbase-sites-test" },
      readJson: async () => ({ sites: [{ id: "admix", domain: "admix.software" }] }),
    };

    const result = await addAnalyticsSite("https://www.example.com/pricing", options);
    const reloaded = await loadAnalyticsSitesConfig(options);

    expect(result.activeSiteId).toBe("example-com");
    expect(result.snapshot.source).toBe("partial");
    expect(reloaded.sites.map((site) => site.domain)).toEqual(["admix.software", "example.com"]);
    expect(storage.getState("added-sites", { schemaVersion: 1 })).toEqual([
      { id: "example-com", name: "example.com", domain: "example.com" },
    ]);
  });

  test("loads a selected site without returning its credential fields", async () => {
    const config = {
      activeSiteId: "admix",
      sites: [
        { id: "admix", name: "admix.software", domain: "admix.software" },
        { id: "docs", name: "docs.admix.software", domain: "docs.admix.software" },
      ],
    };
    const result = await loadAnalyticsSiteSnapshot("docs", false, {
      env: { HOME: "/tmp/signalbase-sites-test" },
      readJson: async () => config,
    });

    expect(result.activeSiteId).toBe("docs");
    expect(result.snapshot.source).toBe("partial");
    expect(result.cached).toBeFalse();
    expect(result.sites).toEqual([
      { id: "admix", name: "admix.software", domain: "admix.software", googleConfigured: false, stripeConfigured: false },
      { id: "docs", name: "docs.admix.software", domain: "docs.admix.software", googleConfigured: false, stripeConfigured: false },
    ]);
    expect(result.sites[0]).not.toHaveProperty("stripeSecretKey");
    expect(result.sites[0]).not.toHaveProperty("googleAccessToken");
  });

  test("serves the last real snapshot before refreshing live data", async () => {
    const snapshot = { ...createDemoSnapshot(), source: "live" as const, generatedAt: "2026-08-30T00:00:00.000Z" };
    attachAnalyticsPersistence({
      getResource: () => ({ value: snapshot, fetchedAt: 1, staleAt: 2, expiresAt: 3, stale: true, expired: false }),
    } as unknown as PluginPersistence);

    const result = await loadAnalyticsSiteSnapshot("admix", false, {
      env: { HOME: "/tmp/signalbase-sites-test" },
      readJson: async () => ({ sites: [{ id: "admix", domain: "admix.software" }] }),
    });

    expect(result.cached).toBeTrue();
    expect(result.snapshot.generatedAt).toBe("2026-08-30T00:00:00.000Z");
  });
});
