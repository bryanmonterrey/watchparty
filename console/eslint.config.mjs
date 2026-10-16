// eslint-config-next 16 ships flat configs only; the eslintrc FlatCompat bridge
// it used to go through crashes under it ("Converting circular structure to
// JSON", 2026-10-01). Same shape as the root config.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  // Literal React version, not "detect": eslint-plugin-react's detection calls
  // context.getFilename(), which eslint 10 removed. The root lint run picks up
  // this file for console/** under eslint 10, so it needs the same pin.
  { settings: { react: { version: "19.3" } } },
  globalIgnores([".next/**", ".open-next/**", ".wrangler/**", "out/**", "next-env.d.ts"]),
]);
