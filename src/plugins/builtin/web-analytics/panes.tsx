import { useCallback, useMemo, useState } from "react";
import { Box, SpinnerMark, Text, TextAttributes, useUiHost } from "../../../ui";
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
import { PaneTemplateInputStep } from "../../../components/pane-template-wizard";
import { useShortcut } from "../../../react/input";
import { colors, priceColor } from "../../../theme/colors";
import type { PaneProps } from "../../../types/plugin";
import type { ResolvedSeries, TimeSeriesPoint } from "../../../time-series/types";
import { formatCompact } from "../../../utils/format";
import { isPlainKey } from "../../../utils/keyboard";
import { useDialog, type PromptContext } from "../../../ui/dialog";
import { addAnalyticsSite, refreshAnalyticsSnapshot, selectAnalyticsSite, useAnalyticsSnapshot } from "./store";
import type { AnalyticsBreakdownRow, AnalyticsCheckout, AnalyticsSnapshot } from "./types";
import { useAppSelector } from "../../../state/app/context";

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
const GOOGLE_ANALYTICS_ORANGE = "#ff9d00";
const STRIPE_GREEN = "#39d27d";

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
      label: "Google Analytics traffic",
      color: GOOGLE_ANALYTICS_ORANGE,
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
      color: STRIPE_GREEN,
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

function useAnalyticsPaneFooter(id: string): void {
  const { error } = useAnalyticsSnapshot();
  usePaneFooter(id, () => ({
    info: [
      ...(error ? [{ id: "error", parts: [{ text: "error", tone: "muted" as const, color: colors.negative }] }] : []),
    ],
    hints: [],
  }), [error]);
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
  const terminal = useUiHost().kind === "opentui";
  const { snapshot, ready, error } = useAnalyticsSnapshot();
  const series = useMemo(() => analyticsSeries(snapshot), [snapshot]);
  const metricItems = useMemo(() => metrics(snapshot), [snapshot]);
  const compact = width < 95;
  const metricColumns = compact ? 4 : metricItems.length;
  const metricRows = Math.ceil(metricItems.length / metricColumns);
  const chartHeight = Math.max(8, height - metricRows * 2 - 1);
  useAnalyticsPaneFooter("web-analytics-overview");
  useShortcut((event) => refreshKey(event), { enabled: focused, phase: "before", scope: "web-analytics-overview" });

  if (!ready) {
    return <EmptyState title={error ? "Analytics unavailable." : "Loading analytics..."} hint={error ?? "Checking the last live snapshot."} />;
  }

  return (
    <Box flexDirection="column" width={width} height={height} backgroundColor="transparent">
      {!terminal && <AnalyticsSiteTabs />}
      <Box flexDirection="row" flexWrap="wrap" paddingX={1}>
        {metricItems.map((item) => (
          <Box key={item.label} flexDirection="column" width={`${100 / metricColumns}%`} height={2} overflow="hidden">
            <Text fg={colors.textDim}>{item.label}</Text>
            <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>{item.value}</Text>
          </Box>
        ))}
      </Box>
      {terminal && <Box height={1} />}
      <CompositeChart
        width={Math.max(20, width)}
        height={chartHeight}
        focused={focused}
        interactive={false}
        series={series}
        panels={[{ id: "overview", scale: "linear" }]}
        colors={{ background: "transparent" }}
        axisWidth={8}
        showLegend={false}
        showTimeAxis={true}
        emptyMessage="No Google Analytics or Stripe data for this period."
        formatValue={(value, item) => item.id === "stripe-checkouts" ? `${Math.round(value)} checkouts` : `${Math.round(value)} visitors`}
      />
    </Box>
  );
}

export function AnalyticsSiteTabs() {
  const dialog = useDialog();
  const { sites, activeSiteId } = useAnalyticsSnapshot();
  const tabs = useMemo(() => sites.map((site) => ({ value: site.id, label: site.name })), [sites]);
  const promptForSite = useCallback(async () => {
    const domain = await dialog.prompt<string>({
      content: (context: PromptContext<string>) => (
        <PaneTemplateInputStep
          {...context}
          step={{
            key: "domain",
            label: "Add website",
            placeholder: "example.com",
            body: ["Add the domain now. Connect its GA4 or Stripe credentials in analytics-sites.json."],
          }}
        />
      ),
    });
    if (domain) await addAnalyticsSite(domain);
  }, [dialog]);

  return (
    <Tabs
      tabs={tabs}
      activeValue={activeSiteId}
      onSelect={selectAnalyticsSite}
      onAdd={() => { void promptForSite(); }}
      compact
      variant="bare"
      keyboardNavigation={false}
      scrollable={false}
    />
  );
}

export function AnalyticsHeaderTabs() {
  const visible = useAppSelector((state) => state.config.layout.instances.some(
    (instance) => instance.paneId === "web-analytics-overview",
  ));
  if (!visible) return null;
  return <AnalyticsSiteTabs />;
}

export function AnalyticsHeaderActions() {
  const { loading } = useAnalyticsSnapshot();
  const visible = useAppSelector((state) => state.config.layout.instances.some(
    (instance) => instance.paneId === "web-analytics-overview",
  ));
  if (!visible) return null;
  return (
    <Box
      height={1}
      flexDirection="row"
      flexShrink={0}
      data-gloom-role="analytics-refresh"
      data-gloom-interactive={loading ? undefined : "true"}
      role="button"
      aria-label={loading ? "Refreshing analytics" : "Refresh analytics"}
      aria-disabled={loading || undefined}
      aria-keyshortcuts="r"
      onMouseDown={(event: { preventDefault?: () => void; stopPropagation?: () => void }) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        if (loading) return;
        void refreshAnalyticsSnapshot(true);
      }}
      style={{ cursor: loading ? "default" : "pointer" }}
    >
      {loading
        ? <SpinnerMark name="dots" color={colors.textDim} />
        : <Text fg={colors.textDim} selectable={false}>[r]efresh</Text>}
      <Text fg={colors.border} selectable={false}> │ </Text>
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

const BREAKDOWN_LABELS: Record<BreakdownTab, string> = {
  referrers: "SOURCE / MEDIUM",
  countries: "COUNTRY",
  pages: "PAGE",
  devices: "DEVICE",
};

let countryCodesByName: Map<string, string> | null = null;

function countryFlag(country: string): string {
  const directCode = /^[a-z]{2}$/i.test(country.trim()) ? country.trim().toUpperCase() : null;
  if (!countryCodesByName) {
    countryCodesByName = new Map();
    const names = new Intl.DisplayNames(["en"], { type: "region" });
    for (let first = 65; first <= 90; first += 1) {
      for (let second = 65; second <= 90; second += 1) {
        const code = String.fromCharCode(first, second);
        const name = names.of(code);
        if (name && name !== code) countryCodesByName.set(name.toLowerCase(), code);
      }
    }
  }
  const code = directCode ?? countryCodesByName.get(country.toLowerCase());
  if (!code) return "";
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

function BreakdownRows({ rows, width, active }: { rows: AnalyticsBreakdownRow[]; width: number; active: BreakdownTab }) {
  const totalVisitors = Math.max(rows.reduce((total, row) => total + row.visitors, 0), 1);
  const rankWidth = 4;
  const visitorsWidth = 10;
  const shareWidth = width >= 48 ? 8 : 0;
  const revenueWidth = width >= 62 ? 11 : 0;
  const labelWidth = Math.max(14, width - rankWidth - visitorsWidth - shareWidth - revenueWidth - 4);
  if (rows.length === 0) {
    return <EmptyState title="No breakdown data." hint="Connect Google Analytics and refresh the pane." />;
  }
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" height={1}>
        <Box width={rankWidth}><Text fg={colors.textDim}>#</Text></Box>
        <Box width={labelWidth}><Text fg={colors.textDim}>{BREAKDOWN_LABELS[active]}</Text></Box>
        <Box width={visitorsWidth}><Text fg={colors.textDim}>VISITORS</Text></Box>
        {shareWidth ? <Box width={shareWidth}><Text fg={colors.textDim}>SHARE</Text></Box> : null}
        {revenueWidth ? <Box width={revenueWidth}><Text fg={colors.textDim}>REVENUE</Text></Box> : null}
      </Box>
      {rows.slice(0, 12).map((row, index) => {
        const flag = active === "countries" ? countryFlag(row.label) : "";
        return (
          <Box key={row.label} flexDirection="row" height={1}>
            <Box width={rankWidth}><Text fg={colors.textMuted}>{String(index + 1).padStart(2, "0")}</Text></Box>
            <Box width={labelWidth} overflow="hidden">
              <Text fg={colors.text}>{flag ? `${flag}  ${row.label}` : row.label}</Text>
            </Box>
            <Box width={visitorsWidth}><Text fg={colors.textBright}>{formatCompact(row.visitors)}</Text></Box>
            {shareWidth ? (
              <Box width={shareWidth}><Text fg={colors.neutral}>{`${Math.round((row.visitors / totalVisitors) * 100)}%`}</Text></Box>
            ) : null}
            {revenueWidth ? (
              <Box width={revenueWidth}><Text fg={row.revenue ? colors.positive : colors.textMuted}>{row.revenue ? CURRENCY.format(row.revenue) : "—"}</Text></Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}

export function TrafficBreakdownsPane({ focused, width, height }: PaneProps) {
  const { snapshot, ready, error } = useAnalyticsSnapshot();
  const [active, setActive] = useState<BreakdownTab>("referrers");
  useAnalyticsPaneFooter("web-analytics-breakdowns");
  useShortcut((event) => refreshKey(event), { enabled: focused, phase: "before", scope: "web-analytics-breakdowns" });
  const rows = snapshot[active];
  if (!ready) {
    return <EmptyState title={error ? "Analytics unavailable." : "Loading analytics..."} hint={error ?? "Checking the last live snapshot."} />;
  }
  return (
    <Box flexDirection="column" width={width} height={height} backgroundColor="transparent">
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
      <BreakdownRows rows={rows} width={width} active={active} />
    </Box>
  );
}

interface CheckoutColumn extends DataTableColumn {
  id: "created" | "customer" | "source" | "country" | "status" | "amount";
}

export function checkoutColumns(width: number): CheckoutColumn[] {
  const created = width >= 68 ? (width >= 92 ? 16 : 9) : 0;
  const status = width >= 110 ? 9 : 0;
  const amount = width >= 68 ? 11 : 9;
  const source = width >= 66 ? 17 : 10;
  const country = 9;
  const columnCount = 4 + Number(!!created) + Number(!!status);
  const columnGapBudget = columnCount + 2;
  const customer = Math.max(16, width - created - status - amount - source - country - columnGapBudget);
  return [
    ...(created ? [{ id: "created" as const, label: "CREATED", width: created, align: "left" as const }] : []),
    { id: "customer", label: "CUSTOMER", width: customer, align: "left", flexGrow: 1 },
    { id: "source", label: "SOURCE /", width: source, align: "left" },
    { id: "country", label: "COUNTRY", width: country, align: "left" },
    ...(status ? [{ id: "status" as const, label: "STATUS", width: status, align: "left" as const }] : []),
    { id: "amount", label: "AMOUNT", width: amount, align: "right" },
  ];
}

function checkoutCell(
  checkout: AnalyticsCheckout,
  column: CheckoutColumn,
  desktop: boolean,
): DataTableCell {
  switch (column.id) {
    case "created": return { text: checkout.createdAt, color: colors.textDim };
    case "customer": return {
      text: checkout.customer === "Anonymous customer"
        ? checkout.email
        : column.width < 28 ? checkout.customer : `${checkout.customer}  ${checkout.email}`,
      color: colors.text,
    };
    case "source": {
      const source = checkout.source === "Unattributed" ? "(direct) / (none)" : checkout.source;
      return { text: source, color: colors.textDim };
    }
    case "country": {
      const flag = countryFlag(checkout.country);
      return {
        text: desktop ? `${flag ? `${flag} ` : ""}${checkout.country}` : flag || checkout.country,
        color: colors.textDim,
      };
    }
    case "status": return { text: checkout.status.toUpperCase(), color: checkout.status === "paid" ? colors.positive : colors.warning };
    case "amount": return { text: new Intl.NumberFormat("en-US", { style: "currency", currency: checkout.currency.toUpperCase() }).format(checkout.amount), color: priceColor(checkout.amount) };
  }
}

export function StripeCheckoutsPane({ focused, width, height }: PaneProps) {
  const { snapshot, loading, ready, error } = useAnalyticsSnapshot();
  const desktop = useUiHost().kind === "desktop-web";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const columns = useMemo(() => checkoutColumns(width), [width]);
  const checkouts = useMemo(() => {
    if (!ready) return [];
    if (sortDirection === "desc") return snapshot.checkouts;
    return snapshot.checkouts.toReversed();
  }, [ready, snapshot.checkouts, sortDirection]);
  const handleHeaderClick = useCallback((columnId: string) => {
    if (columnId === "created") setSortDirection((current) => current === "desc" ? "asc" : "desc");
  }, []);
  const handleKey = useCallback((event: DataTableKeyEvent) => refreshKey(event), []);
  useAnalyticsPaneFooter("web-analytics-checkouts");

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
      rootBackgroundColor="transparent"
      columns={columns}
      items={checkouts}
      sortColumnId="created"
      sortDirection={sortDirection}
      onHeaderClick={handleHeaderClick}
      getItemKey={(checkout) => checkout.id}
      renderCell={(checkout, column) => checkoutCell(checkout, column, desktop)}
      emptyStateTitle={error ? "Analytics unavailable." : loading || !ready ? "Loading Stripe checkouts..." : "No completed Stripe checkouts."}
      emptyStateHint={error ?? "Configure this site in ~/.signalbase/analytics-sites.json, then press r to refresh."}
    />
  );
}
