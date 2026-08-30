import type { PluginCapability } from "../../../capabilities";
import { addAnalyticsSite, loadAnalyticsSiteSnapshot } from "./sites";

export const WEB_ANALYTICS_CAPABILITY_ID = "web-analytics.snapshot";

export const webAnalyticsSnapshotCapability: PluginCapability = {
  id: WEB_ANALYTICS_CAPABILITY_ID,
  kind: "plugin-service",
  name: "Web Analytics Snapshot",
  operations: {
    addSite: {
      kind: "action",
      rendererSafe: true,
      cli: {
        summary: "Add a website to the analytics dashboard.",
        inputShape: "{ domain: string }",
        outputShape: "{ activeSiteId, sites, snapshot }",
        sideEffectLevel: "local-write",
        safety: ["This stores only the domain; analytics credentials remain in backend configuration."],
      },
      handler(input) {
        const domain = input && typeof input === "object" && !Array.isArray(input)
          ? (input as Record<string, unknown>).domain
          : undefined;
        if (typeof domain !== "string") throw new Error("A website domain is required.");
        return addAnalyticsSite(domain);
      },
    },
    load: {
      kind: "query",
      rendererSafe: true,
      cli: {
        summary: "Load a non-secret Google Analytics and Stripe snapshot for one configured site.",
        inputShape: "{ siteId?: string, force?: boolean }",
        outputShape: "{ activeSiteId, sites, snapshot }",
        sideEffectLevel: "none",
        safety: ["Credentials remain in the backend and are never returned to the renderer."],
      },
      handler(input) {
        const request = input && typeof input === "object" && !Array.isArray(input)
          ? input as Record<string, unknown>
          : {};
        return loadAnalyticsSiteSnapshot(
          typeof request.siteId === "string" ? request.siteId : undefined,
          request.force === true,
        );
      },
    },
  },
};
