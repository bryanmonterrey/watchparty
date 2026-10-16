import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next sets react.version to "detect", and eslint-plugin-react
  // 7.37.5 detects it via context.getFilename() — removed in eslint 10, so
  // every component rule crashed ("contextOrFilename.getFilename is not a
  // function"). A literal version skips detection entirely. Keep it in step
  // with the react dependency.
  { settings: { react: { version: "19.3" } } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Vendored agent skills (installed by `npx skills add`): third-party example
    // code, not ours.
    ".agents/**",
    ".claude/**",
    // The sub-workers' build output and wrangler scratch, and the static
    // bundles under public/ — generated or vendored, never source. Together
    // with .agents these were ~500 of the 1,295 lint errors on 2026-10-01.
    "**/.open-next/**",
    "**/.wrangler/**",
    "public/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated Cloudflare/OpenNext build output — not source, and crawling it
    // makes lint crawl-slow (it was also the file the eslint crash first hit).
    ".open-next/**",
  ]),
]);

export default eslintConfig;
