import { afterEach, describe, expect, test } from "bun:test";
import {
  loadAnalyticsSnapshot,
  parseGoogleAnalyticsReports,
  parseStripeSessions,
  resetAnalyticsSnapshotCache,
} from "./client";

const metricRow = (metrics: Array<number | string>, dimensions: string[] = []) => ({
  dimensionValues: dimensions.map((value) => ({ value })),
  metricValues: metrics.map((value) => ({ value: String(value) })),
});

afterEach(() => resetAnalyticsSnapshotCache());

describe("Google Analytics report normalization", () => {
  test("maps summary, daily traffic, and requested breakdowns", () => {
    const result = parseGoogleAnalyticsReports({
      summary: { rows: [metricRow([5230, 6100, 8934, 0.83, 176])] },
      daily: { rows: [metricRow([221, 260], ["20260829"]), metricRow([245, 291], ["20260830"])] },
      referrers: { rows: [metricRow([1400], ["Product Hunt"]), metricRow([947], ["(not set)"])] },
      countries: { rows: [metricRow([1100], ["United States"])] },
      pages: { rows: [metricRow([5000], ["/"])] },
      devices: { rows: [metricRow([3712], ["desktop"])] },
    });

    expect(result.totals).toEqual({
      visitors: 5230,
      sessions: 6100,
      pageViews: 8934,
      bounceRate: 0.83,
      averageSessionDuration: 176,
    });
    expect(result.daily).toEqual([
      { date: "2026-08-29", visitors: 221, sessions: 260 },
      { date: "2026-08-30", visitors: 245, sessions: 291 },
    ]);
    expect(result.referrers[1]?.label).toBe("Unknown");
    expect(result.countries[0]?.label).toBe("United States");
  });
});

describe("Stripe Checkout normalization", () => {
  test("aggregates daily checkout columns and attribution metadata", () => {
    const result = parseStripeSessions([
      {
        id: "cs_one",
        amount_total: 29900,
        currency: "usd",
        created: Date.parse("2026-08-30T09:00:00Z") / 1000,
        payment_status: "paid",
        customer_details: { name: "Maya Chen", email: "maya@example.com" },
        metadata: { source: "Product Hunt", country: "US" },
      },
      {
        id: "cs_two",
        amount_total: 1200,
        currency: "jpy",
        created: Date.parse("2026-08-30T08:00:00Z") / 1000,
        payment_status: "paid",
        metadata: { utm_source: "Google", country: "JP" },
      },
    ]);

    expect(result.daily.get("2026-08-30")).toEqual({ checkouts: 2, revenue: 1499 });
    expect(result.revenueBySource.get("Product Hunt")).toBe(299);
    expect(result.revenueBySource.get("Google")).toBe(1200);
    expect(result.checkouts[0]).toMatchObject({ id: "cs_one", customer: "Maya Chen", amount: 299 });
  });
});

test("uses deterministic demo data when native credentials are absent", async () => {
  const snapshot = await loadAnalyticsSnapshot({ credentials: {} });
  expect(snapshot.source).toBe("demo");
  expect(snapshot.daily).toHaveLength(30);
  expect(snapshot.referrers[0]?.label).toBe("Product Hunt");
  expect(snapshot.checkouts[0]?.id).toStartWith("cs_test_");
});
