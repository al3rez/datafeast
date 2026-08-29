import { startOpenTuiApp } from "./renderers/opentui/start";
import { createWebAnalyticsLaunchRequest } from "./plugins/builtin/web-analytics";

startOpenTuiApp({ cliLaunchRequest: createWebAnalyticsLaunchRequest() }).catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
