import { startOpenTuiApp } from "./renderers/opentui/start";
import { createWebAnalyticsLaunchRequest, webAnalyticsPlugin } from "./plugins/builtin/web-analytics";

startOpenTuiApp({
  cliLaunchRequest: createWebAnalyticsLaunchRequest(),
  plugins: [webAnalyticsPlugin],
}).catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
