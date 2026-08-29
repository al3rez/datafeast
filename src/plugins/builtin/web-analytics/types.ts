export type AnalyticsSource = "demo" | "live" | "partial";

export interface AnalyticsDailyPoint {
  date: string;
  visitors: number;
  sessions: number;
  checkouts: number;
  revenue: number;
}

export interface AnalyticsBreakdownRow {
  label: string;
  visitors: number;
  revenue: number;
}

export interface AnalyticsCheckout {
  id: string;
  customer: string;
  email: string;
  amount: number;
  currency: string;
  status: string;
  source: string;
  country: string;
  createdAt: string;
}

export interface AnalyticsTotals {
  visitors: number;
  sessions: number;
  pageViews: number;
  checkouts: number;
  revenue: number;
  bounceRate: number;
  averageSessionDuration: number;
}

export interface AnalyticsSnapshot {
  source: AnalyticsSource;
  generatedAt: string;
  totals: AnalyticsTotals;
  daily: AnalyticsDailyPoint[];
  referrers: AnalyticsBreakdownRow[];
  countries: AnalyticsBreakdownRow[];
  pages: AnalyticsBreakdownRow[];
  devices: AnalyticsBreakdownRow[];
  checkouts: AnalyticsCheckout[];
  warnings: string[];
}

export interface AnalyticsCredentials {
  googlePropertyId?: string;
  googleAccessToken?: string;
  stripeSecretKey?: string;
}
