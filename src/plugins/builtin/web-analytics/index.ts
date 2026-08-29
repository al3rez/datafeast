import type { AppSessionSnapshot } from "../../../core/state/session-persistence";
import type { LayoutConfig } from "../../../types/config";
import { cloneLayout } from "../../../types/config";
import type { CliLaunchRequest, GloomPlugin } from "../../../types/plugin";
import { RevenueOverviewPane, StripeCheckoutsPane, TrafficBreakdownsPane } from "./panes";

const OVERVIEW_INSTANCE_ID = "web-analytics-overview:main";
const BREAKDOWNS_INSTANCE_ID = "web-analytics-breakdowns:main";
const CHECKOUTS_INSTANCE_ID = "web-analytics-checkouts:main";

export const WEB_ANALYTICS_LAYOUT: LayoutConfig = {
  dockRoot: {
    kind: "split",
    axis: "vertical",
    ratio: 0.58,
    first: { kind: "pane", instanceId: OVERVIEW_INSTANCE_ID },
    second: {
      kind: "split",
      axis: "horizontal",
      ratio: 0.5,
      first: { kind: "pane", instanceId: BREAKDOWNS_INSTANCE_ID },
      second: { kind: "pane", instanceId: CHECKOUTS_INSTANCE_ID },
    },
  },
  instances: [
    { instanceId: OVERVIEW_INSTANCE_ID, paneId: "web-analytics-overview", binding: { kind: "none" } },
    { instanceId: BREAKDOWNS_INSTANCE_ID, paneId: "web-analytics-breakdowns", binding: { kind: "none" } },
    { instanceId: CHECKOUTS_INSTANCE_ID, paneId: "web-analytics-checkouts", binding: { kind: "none" } },
  ],
  floating: [],
  detached: [],
};

function analyticsSession(snapshot: AppSessionSnapshot | null | undefined): AppSessionSnapshot {
  return {
    paneState: {},
    focusedPaneId: OVERVIEW_INSTANCE_ID,
    activePanel: snapshot?.activePanel === "right" ? "right" : "left",
    statusBarVisible: snapshot?.statusBarVisible !== false,
    openPaneIds: [OVERVIEW_INSTANCE_ID, BREAKDOWNS_INSTANCE_ID, CHECKOUTS_INSTANCE_ID],
    hydrationTargets: [],
    exchangeCurrencies: [],
    savedAt: Date.now(),
  };
}

export function createWebAnalyticsLaunchRequest(): CliLaunchRequest {
  return {
    applyConfig(config) {
      const layout = cloneLayout(WEB_ANALYTICS_LAYOUT);
      return {
        config: {
          ...config,
          layout,
          layouts: [
            ...config.layouts.filter((entry) => entry.name !== "Analytics"),
            { name: "Analytics", layout: cloneLayout(layout), paneState: {} },
          ],
        },
      };
    },
    applySessionSnapshot(_config, snapshot) {
      return analyticsSession(snapshot);
    },
  };
}

export const webAnalyticsPlugin: GloomPlugin = {
  id: "web-analytics",
  name: "Web Analytics",
  version: "1.0.0",
  description: "Google Analytics traffic, Stripe checkouts, and revenue attribution.",
  toggleable: true,
  cliCommands: [{
    name: "analytics",
    aliases: ["ga", "signalbase"],
    description: "Launch the Google Analytics and Stripe dashboard",
    help: { usage: ["analytics"] },
    execute: () => ({ kind: "launch-ui", request: createWebAnalyticsLaunchRequest() }),
  }],
  panes: [
    {
      id: "web-analytics-overview",
      name: "Traffic + Stripe",
      icon: "A",
      component: RevenueOverviewPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 116, height: 28 },
    },
    {
      id: "web-analytics-breakdowns",
      name: "Traffic Breakdown",
      icon: "B",
      component: TrafficBreakdownsPane,
      defaultPosition: "left",
      defaultMode: "floating",
      defaultFloatingSize: { width: 72, height: 22 },
    },
    {
      id: "web-analytics-checkouts",
      name: "Stripe Checkouts",
      icon: "$",
      component: StripeCheckoutsPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 100, height: 24 },
      tableExport: true,
    },
  ],
  paneTemplates: [
    {
      id: "web-analytics-overview-pane",
      paneId: "web-analytics-overview",
      label: "Traffic + Stripe",
      description: "Google Analytics traffic with Stripe checkout columns.",
      keywords: ["analytics", "traffic", "stripe", "revenue", "google"],
      shortcut: { prefix: "WEB" },
    },
    {
      id: "web-analytics-breakdowns-pane",
      paneId: "web-analytics-breakdowns",
      label: "Traffic Breakdown",
      description: "Referrers, countries, pages, and devices.",
      keywords: ["referrer", "country", "page", "device", "acquisition"],
      shortcut: { prefix: "REF" },
    },
    {
      id: "web-analytics-checkouts-pane",
      paneId: "web-analytics-checkouts",
      label: "Stripe Checkouts",
      description: "Recent completed Stripe Checkout Sessions.",
      keywords: ["stripe", "checkout", "customer", "payment"],
      shortcut: { prefix: "CKO" },
    },
  ],
};
