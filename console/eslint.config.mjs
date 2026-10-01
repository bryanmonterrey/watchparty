// eslint-config-next 16 ships flat configs only; the eslintrc FlatCompat bridge
// it used to go through crashes under it ("Converting circular structure to
// JSON", 2026-10-01). Same shape as the root config.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([".next/**", ".open-next/**", ".wrangler/**", "out/**", "next-env.d.ts"]),
]);
