import { describe, expect, test } from "bun:test";
import { createDefaultConfig } from "../../../types/config";
import { createWebAnalyticsLaunchRequest, WEB_ANALYTICS_LAYOUT, webAnalyticsPlugin } from ".";
import { checkoutColumns } from "./panes";

describe("Signalbase analytics launch", () => {
  test("replaces the startup workspace with the complete analytics app layout", () => {
    const request = createWebAnalyticsLaunchRequest();
    const base = createDefaultConfig("/tmp/signalbase-launch-test");
    const { config } = request.applyConfig(base, { terminalWidth: 120, terminalHeight: 40 });

    expect(config.layout).toEqual(WEB_ANALYTICS_LAYOUT);
    expect(config.layout.instances.map((pane) => pane.paneId)).toEqual([
      "web-analytics-overview",
      "web-analytics-breakdowns",
      "web-analytics-checkouts",
    ]);
    expect(config.layouts.map((layout) => layout.name)).toEqual(["Analytics"]);

    const session = request.applySessionSnapshot?.(config, null, undefined);
    expect(session?.focusedPaneId).toBe("web-analytics-overview:main");
    expect(session?.openPaneIds).toEqual([
      "web-analytics-overview:main",
      "web-analytics-breakdowns:main",
      "web-analytics-checkouts:main",
    ]);
    expect(session?.statusBarVisible).toBeFalse();
  });

  test("exposes the backend snapshot capability without exposing credentials", () => {
    expect(webAnalyticsPlugin.capabilities?.map((capability) => capability.id)).toContain("web-analytics.snapshot");
    expect(webAnalyticsPlugin.capabilities?.[0]?.operations.load?.rendererSafe).toBe(true);
  });

  test("keeps the useful checkout columns inside a narrow terminal pane", () => {
    const columns = checkoutColumns(58);
    expect(columns.map((column) => column.id)).toEqual(["customer", "source", "country", "amount"]);
    expect(columns.reduce((width, column) => width + column.width, columns.length + 2)).toBeLessThanOrEqual(58);
  });
});
