import type {
  AnalyticsBreakdownRow,
  AnalyticsCheckout,
  AnalyticsDailyPoint,
  AnalyticsSnapshot,
} from "./types";

const REFERRERS: AnalyticsBreakdownRow[] = [
  { label: "Product Hunt", visitors: 1_400, revenue: 1_740 },
  { label: "GitHub", visitors: 1_000, revenue: 660 },
  { label: "Direct / None", visitors: 947, revenue: 740 },
  { label: "Google", visitors: 694, revenue: 980 },
  { label: "X", visitors: 269, revenue: 330 },
  { label: "Hacker News", visitors: 234, revenue: 290 },
  { label: "YouTube", visitors: 160, revenue: 510 },
  { label: "LinkedIn", visitors: 57, revenue: 170 },
];

const COUNTRIES: AnalyticsBreakdownRow[] = [
  { label: "United States", visitors: 1_100, revenue: 1_630 },
  { label: "France", visitors: 471, revenue: 810 },
  { label: "United Kingdom", visitors: 237, revenue: 540 },
  { label: "Germany", visitors: 233, revenue: 290 },
  { label: "Spain", visitors: 176, revenue: 195 },
  { label: "Canada", visitors: 167, revenue: 398 },
  { label: "Indonesia", visitors: 158, revenue: 95 },
  { label: "Singapore", visitors: 155, revenue: 230 },
];

const PAGES: AnalyticsBreakdownRow[] = [
  { label: "/", visitors: 5_000, revenue: 3_820 },
  { label: "/pricing", visitors: 198, revenue: 340 },
  { label: "/docs/quickstart", visitors: 149, revenue: 170 },
  { label: "/docs/stripe", visitors: 48, revenue: 95 },
  { label: "/open-source", visitors: 38, revenue: 170 },
  { label: "/blog/revenue-attribution", visitors: 35, revenue: 85 },
];

const DEVICES: AnalyticsBreakdownRow[] = [
  { label: "Desktop", visitors: 3_712, revenue: 3_620 },
  { label: "Mobile", visitors: 1_311, revenue: 910 },
  { label: "Tablet", visitors: 207, revenue: 150 },
];

const CHECKOUTS: AnalyticsCheckout[] = [
  { id: "cs_test_7N4K", customer: "Maya Chen", email: "maya@example.com", amount: 299, currency: "usd", status: "paid", source: "Product Hunt", country: "US", createdAt: "2 minutes ago" },
  { id: "cs_test_2Q8P", customer: "Jon Bell", email: "jon@example.com", amount: 99, currency: "usd", status: "paid", source: "Google", country: "GB", createdAt: "18 minutes ago" },
  { id: "cs_test_9M3D", customer: "Sofia Reis", email: "sofia@example.com", amount: 299, currency: "usd", status: "paid", source: "GitHub", country: "PT", createdAt: "1 hour ago" },
  { id: "cs_test_4V6A", customer: "Alex Kim", email: "alex@example.com", amount: 99, currency: "usd", status: "unpaid", source: "Hacker News", country: "CA", createdAt: "3 hours ago" },
  { id: "cs_test_5J1R", customer: "Nora Weiss", email: "nora@example.com", amount: 299, currency: "usd", status: "paid", source: "Direct / None", country: "DE", createdAt: "Yesterday" },
];

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createDemoDaily(now = new Date()): AnalyticsDailyPoint[] {
  const checkoutPattern = [0, 1, 0, 0, 2, 1, 3, 1, 1, 2];
  const amountPattern = [0, 99, 0, 0, 598, 99, 697, 170, 99, 398];
  return Array.from({ length: 30 }, (_, index) => {
    const date = new Date(now);
    date.setUTCHours(12, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (29 - index));
    const wave = Math.sin(index / 2.8) * 28;
    const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? -34 : 0;
    return {
      date: isoDay(date),
      visitors: Math.max(74, Math.round(194 + wave + weekend + ((index * 17) % 43))),
      sessions: Math.max(86, Math.round(221 + wave + weekend + ((index * 13) % 51))),
      checkouts: checkoutPattern[index % checkoutPattern.length]!,
      revenue: amountPattern[index % amountPattern.length]!,
    };
  });
}

export function createDemoSnapshot(now = new Date()): AnalyticsSnapshot {
  const daily = createDemoDaily(now);
  const visitors = daily.reduce((total, point) => total + point.visitors, 0);
  const sessions = daily.reduce((total, point) => total + point.sessions, 0);
  const checkouts = daily.reduce((total, point) => total + point.checkouts, 0);
  const revenue = daily.reduce((total, point) => total + point.revenue, 0);
  return {
    source: "demo",
    generatedAt: now.toISOString(),
    totals: {
      visitors,
      sessions,
      pageViews: 8_934,
      checkouts,
      revenue,
      bounceRate: 0.83,
      averageSessionDuration: 176,
    },
    daily,
    referrers: REFERRERS,
    countries: COUNTRIES,
    pages: PAGES,
    devices: DEVICES,
    checkouts: CHECKOUTS,
    warnings: ["Demo data — set Google Analytics and Stripe credentials for live reports."],
  };
}
