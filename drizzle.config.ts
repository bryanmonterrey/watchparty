import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Captured BEFORE dotenv runs: .env.local loads with override:true, which
// CLOBBERS env injected by a caller — that override is how the 2026-08-07
// incident sent a dev-targeted `drizzle-kit push` to PRODUCTION. A caller that
// means a specific database says so with DRIZZLE_DB_URL, which nothing below
// can overwrite.
const explicitUrl = process.env.DRIZZLE_DB_URL;

config({ path: ".env.local", override: true });
config({ path: ".env" });

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: explicitUrl ?? process.env.DIRECT_URL!,
  },
  verbose: true,
  strict: true,
});
