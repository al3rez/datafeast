import { useCallback, useMemo, useState } from "react";
import { Box, Text, TextAttributes } from "../../../ui";
import {
  DataTableView,
  EmptyState,
  Tabs,
  usePaneFooter,
  type DataTableCell,
  type DataTableColumn,
  type DataTableKeyEvent,
} from "../../../components";
import { CompositeChart } from "../../../components/chart/composite";
import { useShortcut } from "../../../react/input";
import { colors, priceColor } from "../../../theme/colors";
import type { PaneProps } from "../../../types/plugin";
import type { ResolvedSeries, TimeSeriesPoint } from "../../../time-series/types";
import { formatCompact } from "../../../utils/format";
import { isPlainKey } from "../../../utils/keyboard";
import { refreshAnalyticsSnapshot, useAnalyticsSnapshot } from "./store";
import type { AnalyticsBreakdownRow, AnalyticsCheckout, AnalyticsSnapshot } from "./types";

const CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const PRECISE_CURRENCY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function duration(seconds: number): string {
  if (!seconds) return "0s";
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return minutes ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(value < 0.1 ? 2 : 1)}%`;
}

function point(date: string, value: number): TimeSeriesPoint {
  const parsed = new Date(`${date}T12:00:00Z`);
  return { date: parsed, observedAt: parsed, value };
}

function analyticsSeries(snapshot: AnalyticsSnapshot): ResolvedSeries[] {
  const shared = {
    nativeFrequency: "daily" as const,
    dataShape: "scalar" as const,
    transform: "raw" as const,
    interpolation: "none" as const,
    panelId: "overview",
  };
  return [
    {
      ...shared,
      id: "ga-visitors",
      label: "GA visitors",
      color: colors.borderFocused,
      unit: "visitors",
      unitGroup: "traffic",
      style: "line",
      axis: "left",
      points: snapshot.daily.map((entry) => point(entry.date, entry.visitors)),
    },
    {
      ...shared,
      id: "stripe-checkouts",
      label: "Stripe checkouts",
      color: colors.warning,
      unit: "checkouts",
      unitGroup: "checkouts",
      style: "columns",
      axis: "right",
      points: snapshot.daily.map((entry) => point(entry.date, entry.checkouts)),
    },
  ];
}

function refreshKey(event: DataTableKeyEvent | { name?: string; ctrl?: boolean; shift?: boolean; meta?: boolean; sequence?: string; preventDefault?: () => void; stopPropagation?: () => void }): boolean {
  if (!isPlainKey(event, "r")) return false;
  event.preventDefault?.();
  event.stopPropagation?.();
  void refreshAnalyticsSnapshot(true);
  return true;
}

function useAnalyticsPaneFooter(id: string, focused: boolean): void {
  const { snapshot, loading, error } = useAnalyticsSnapshot();
  usePaneFooter(id, () => ({
    info: [
      ...(loading ? [{ id: "loading", parts: [{ text: "loading", tone: "muted" as const }] }] : []),
      ...(error ? [{ id: "error", parts: [{ text: "error", tone: "muted" as const, color: colors.negative }] }] : []),
      ...(!loading && !error ? [{
        id: "source",
        parts: [{ text: snapshot.source === "live" ? "live" : snapshot.source, tone: snapshot.source === "live" ? "value" as const : "muted" as const }],
      }] : []),
    ],
    hints: focused ? [{ id: "refresh", key: "r", label: "efresh", onPress: () => void refreshAnalyticsSnapshot(true) }] : [],
  }), [error, focused, loading, snapshot.source]);
}

interface MetricItem {
  label: string;
  value: string;
  detail?: string;
}

function metrics(snapshot: AnalyticsSnapshot): MetricItem[] {
  const { totals } = snapshot;
  const conversion = totals.visitors ? totals.checkouts / totals.visitors : 0;
  return [
    { label: "Visitors", value: formatCompact(totals.visitors) },
    { label: "Stripe revenue", value: CURRENCY.format(totals.revenue) },
    { label: "Checkouts", value: formatCompact(totals.checkouts) },
    { label: "Conversion", value: percent(conversion) },
    { label: "Revenue / visitor", value: PRECISE_CURRENCY.format(totals.visitors ? totals.revenue / totals.visitors : 0) },
    { label: "Bounce", value: percent(totals.bounceRate) },
    { label: "Session", value: duration(totals.averageSessionDuration) },
  ];
}

export function RevenueOverviewPane({ focused, width, height }: PaneProps) {
  const { snapshot, loading } = useAnalyticsSnapshot();
  const series = useMemo(() => analyticsSeries(snapshot), [snapshot]);
  const metricItems = useMemo(() => metrics(snapshot), [snapshot]);
  const compact = width < 95;
  const metricColumns = compact ? 4 : metricItems.length;
  const metricRows = Math.ceil(metricItems.length / metricColumns);
  const chartHeight = Math.max(8, height - metricRows * 2 - 2);
  useAnalyticsPaneFooter("web-analytics-overview", focused);
  useShortcut((event) => refreshKey(event), { enabled: focused, phase: "before", scope: "web-analytics-overview" });

  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box flexDirection="row" flexWrap="wrap" paddingX={1} paddingTop={1}>
        {metricItems.map((item) => (
          <Box key={item.label} flexDirection="column" width={`${100 / metricColumns}%`} height={2} overflow="hidden">
            <Text fg={colors.textDim}>{item.label}</Text>
            <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>{item.value}</Text>
          </Box>
        ))}
      </Box>
      <Box height={1} paddingX={1} flexDirection="row" gap={2}>
        <Text fg={colors.borderFocused}>— GA visitors</Text>
        <Text fg={colors.warning}>▮ Stripe checkouts</Text>
        {loading ? <Text fg={colors.textMuted}>refreshing</Text> : null}
      </Box>
      <CompositeChart
        width={Math.max(20, width)}
        height={chartHeight}
        focused={focused}
        interactive={focused}
        series={series}
        panels={[{ id: "overview", scale: "linear" }]}
        axisWidth={8}
        showLegend={false}
        showTimeAxis={true}
        emptyMessage="No Google Analytics or Stripe data for this period."
        formatValue={(value, item) => item.id === "stripe-checkouts" ? `${Math.round(value)} checkouts` : `${Math.round(value)} visitors`}
      />
    </Box>
  );
}

type BreakdownTab = "referrers" | "countries" | "pages" | "devices";
const BREAKDOWN_TABS: Array<{ value: BreakdownTab; label: string }> = [
  { value: "referrers", label: "Referrer" },
  { value: "countries", label: "Country" },
  { value: "pages", label: "Page" },
  { value: "devices", label: "Device" },
];

function BreakdownRows({ rows, width }: { rows: AnalyticsBreakdownRow[]; width: number }) {
  const maxVisitors = Math.max(...rows.map((row) => row.visitors), 1);
  const labelWidth = Math.max(14, Math.floor(width * 0.42));
  const valueWidth = 8;
  const revenueWidth = width >= 62 ? 10 : 0;
  const barWidth = Math.max(8, width - labelWidth - valueWidth - revenueWidth - 5);
  if (rows.length === 0) {
    return <EmptyState title="No breakdown data." hint="Connect Google Analytics and refresh the pane." />;
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" height={1}>
        <Box width={labelWidth}><Text fg={colors.textDim}>VALUE</Text></Box>
        <Box width={barWidth}><Text fg={colors.textDim}>TRAFFIC</Text></Box>
        <Box width={valueWidth}><Text fg={colors.textDim}>VISITORS</Text></Box>
        {revenueWidth ? <Box width={revenueWidth}><Text fg={colors.textDim}>REVENUE</Text></Box> : null}
      </Box>
      {rows.slice(0, 12).map((row) => {
        const filled = Math.max(1, Math.round((row.visitors / maxVisitors) * barWidth));
        return (
          <Box key={row.label} flexDirection="row" height={1}>
            <Box width={labelWidth} overflow="hidden"><Text fg={colors.text}>{row.label}</Text></Box>
            <Box width={barWidth} overflow="hidden"><Text fg={colors.borderFocused}>{"━".repeat(filled)}</Text></Box>
            <Box width={valueWidth}><Text fg={colors.textBright}>{formatCompact(row.visitors)}</Text></Box>
            {revenueWidth ? <Box width={revenueWidth}><Text fg={row.revenue ? colors.warning : colors.textMuted}>{row.revenue ? CURRENCY.format(row.revenue) : "—"}</Text></Box> : null}
          </Box>
        );
      })}
    </Box>
  );
}

export function TrafficBreakdownsPane({ focused, width, height }: PaneProps) {
  const { snapshot } = useAnalyticsSnapshot();
  const [active, setActive] = useState<BreakdownTab>("referrers");
  useAnalyticsPaneFooter("web-analytics-breakdowns", focused);
  useShortcut((event) => refreshKey(event), { enabled: focused, phase: "before", scope: "web-analytics-breakdowns" });
  const rows = snapshot[active];
  return (
    <Box flexDirection="column" width={width} height={height}>
      <Box height={1} paddingX={1}>
        <Tabs
          tabs={BREAKDOWN_TABS}
          activeValue={active}
          onSelect={(value) => setActive(value as BreakdownTab)}
          compact
          variant="bare"
          focused={focused}
        />
      </Box>
      <BreakdownRows rows={rows} width={width} />
    </Box>
  );
}

interface CheckoutColumn extends DataTableColumn {
  id: "created" | "customer" | "source" | "status" | "amount";
}

function checkoutColumns(width: number): CheckoutColumn[] {
  const created = width >= 92 ? 16 : 10;
  const status = 9;
  const amount = 11;
  const source = Math.max(14, Math.floor(width * 0.22));
  const customer = Math.max(18, width - created - status - amount - source - 8);
  return [
    { id: "created", label: "CREATED", width: created, align: "left" },
    { id: "customer", label: "CUSTOMER", width: customer, align: "left", flexGrow: 1 },
    { id: "source", label: "SOURCE / COUNTRY", width: source, align: "left" },
    { id: "status", label: "STATUS", width: status, align: "left" },
    { id: "amount", label: "AMOUNT", width: amount, align: "right" },
  ];
}

function checkoutCell(checkout: AnalyticsCheckout, column: CheckoutColumn): DataTableCell {
  switch (column.id) {
    case "created": return { text: checkout.createdAt, color: colors.textDim };
    case "customer": return { text: checkout.customer === "Anonymous customer" ? checkout.email : `${checkout.customer}  ${checkout.email}`, color: colors.text };
    case "source": return { text: `${checkout.source}  ${checkout.country}`, color: colors.textDim };
    case "status": return { text: checkout.status.toUpperCase(), color: checkout.status === "paid" ? colors.positive : colors.warning };
    case "amount": return { text: new Intl.NumberFormat("en-US", { style: "currency", currency: checkout.currency.toUpperCase() }).format(checkout.amount), color: priceColor(checkout.amount) };
  }
}

export function StripeCheckoutsPane({ focused, width, height }: PaneProps) {
  const { snapshot, loading } = useAnalyticsSnapshot();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const columns = useMemo(() => checkoutColumns(width), [width]);
  const checkouts = useMemo(() => {
    if (sortDirection === "desc") return snapshot.checkouts;
    return snapshot.checkouts.toReversed();
  }, [snapshot.checkouts, sortDirection]);
  const handleHeaderClick = useCallback((columnId: string) => {
    if (columnId === "created") setSortDirection((current) => current === "desc" ? "asc" : "desc");
  }, []);
  const handleKey = useCallback((event: DataTableKeyEvent) => refreshKey(event), []);
  useAnalyticsPaneFooter("web-analytics-checkouts", focused);

  return (
    <DataTableView<AnalyticsCheckout, CheckoutColumn>
      focused={focused}
      selection={{
        kind: "id",
        selectedId,
        getId: (checkout) => checkout.id,
        onChange: (id) => setSelectedId(id),
      }}
      onRootKeyDown={handleKey}
      rootWidth={width}
      rootHeight={height}
      columns={columns}
      items={checkouts}
      sortColumnId="created"
      sortDirection={sortDirection}
      onHeaderClick={handleHeaderClick}
      getItemKey={(checkout) => checkout.id}
      renderCell={checkoutCell}
      emptyStateTitle={loading ? "Loading Stripe checkouts..." : "No completed Stripe checkouts."}
      emptyStateHint="Set STRIPE_SECRET_KEY, then press r to refresh."
    />
  );
}
