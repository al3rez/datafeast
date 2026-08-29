# Signalbase Terminal

Signalbase is a keyboard-driven Google Analytics and Stripe revenue dashboard for the terminal, desktop, and browser. It combines acquisition data with completed Checkout Sessions in a DataFast-inspired workspace built on the open-source Gloomberb runtime.

This repository is the complete application—not an add-on plugin. It includes the executable, renderer entry points, default workspace, API clients, shared state, charts, tables, build scripts, tests, and desktop configuration.

## Dashboard

The default workspace includes:

- A synchronized 30-day chart with Google Analytics visitors as a line and Stripe checkouts as columns
- Visitors, Stripe revenue, checkouts, conversion, revenue per visitor, bounce rate, and average session duration
- Referrer, country, page, and device traffic breakdowns
- Revenue attribution from Stripe Checkout metadata
- A sortable and CSV-exportable Checkout table with customer, source, country, status, and amount
- Deterministic demo data when credentials are absent

Press `r` in any analytics pane to refresh its shared snapshot. Keyboard and mouse navigation work across the terminal, desktop, and browser renderers.

## Run locally

Signalbase requires [Bun](https://bun.sh/) 1.3 or newer.

```bash
bun install
cp .env.example .env
bun run start
```

You can also launch the product executable directly:

```bash
bun bin/signalbase
```

The app opens with demo data by default. Set these values in `.env` for live native-terminal or desktop data:

```bash
GOOGLE_ANALYTICS_PROPERTY_ID=123456789
GOOGLE_ANALYTICS_ACCESS_TOKEN=your_oauth_access_token
STRIPE_SECRET_KEY=sk_test_or_live_key
```

The Google token needs the `analytics.readonly` OAuth scope. The app reads the previous 30 days through the GA4 Data API and fetches completed Stripe Checkout Sessions from the same period. The browser build deliberately remains in demo mode so credentials are never bundled into client JavaScript.

For revenue attribution, attach optional metadata to Checkout Sessions:

```text
source=google / organic
country=United States
```

`utm_source` is accepted as an alternative to `source`. Sessions without metadata appear as `Direct / None` and `Unknown`.

## Commands

```bash
bun run start                  # terminal app
bun run web:build              # browser bundle
bun run desktop:view:build     # desktop renderer bundle
bun run build                  # standalone TUI binary
bun test                       # test suite
bun run typecheck              # all TypeScript targets
```

Within the command palette, `analytics`, `ga`, and `signalbase` all restore the analytics workspace. The inherited Gloomberb panes and command system remain available for extending the workspace.

## Application structure

The analytics product lives in `src/plugins/builtin/web-analytics/` as a first-party application module:

- `client.ts` calls GA4 and Stripe, normalizes the responses, merges daily series, and caches snapshots
- `store.ts` shares one refreshable snapshot across every analytics pane
- `panes.tsx` renders the overview chart, acquisition tabs, and Checkout table
- `index.ts` defines the default dashboard layout, pane registrations, and CLI launch command
- `demo.ts` supplies stable sample data for onboarding and browser previews

Signalbase starts this workspace from the TUI, browser renderer, and desktop renderer. Product branding, storage namespaces, deep links, binary names, and build output are owned by Signalbase.

## Foundation and license

Signalbase is a full application distribution based on [Gloomberb](https://github.com/gloom-sh/gloomberb). Its renderer-neutral pane system, charts, tables, layouts, command palette, and optional finance modules form the application foundation.

Released under the MIT License. See [LICENSE](LICENSE).
