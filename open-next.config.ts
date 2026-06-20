import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Minimal first-deploy config: no incremental (ISR) cache override yet.
// When we move to Workers Paid we can add an R2 incremental cache:
//   import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
//   export default defineCloudflareConfig({ incrementalCache: r2IncrementalCache });
export default defineCloudflareConfig({});
