import { describe, expect, test } from "bun:test";
import { createDefaultConfig } from "../../../types/config";
import { createWebAnalyticsLaunchRequest, WEB_ANALYTICS_LAYOUT } from ".";

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
    expect(config.layouts.at(-1)?.name).toBe("Analytics");

    const session = request.applySessionSnapshot?.(config, null, undefined);
    expect(session?.focusedPaneId).toBe("web-analytics-overview:main");
    expect(session?.openPaneIds).toEqual([
      "web-analytics-overview:main",
      "web-analytics-breakdowns:main",
      "web-analytics-checkouts:main",
    ]);
  });
});
