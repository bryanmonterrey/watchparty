/**
 * Live-model smoke for the console Agent (app/api/console-agent/route.ts).
 *
 * Exists for the same reason as smoke-assistant.mjs: the route ships on green
 * tsc while streaming NOTHING, because GLM-5.2 is a reasoning model and a small
 * output budget gets eaten by the chain-of-thought before a single content
 * delta. This exercises the exact plumbing the route uses — createOpenAICompatible
 * + streamText + result.textStream at maxOutputTokens 6000 — and fails if the
 * text stream comes back empty.
 *
 *   bun scripts/ai/smoke-console-agent.mjs
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText } from "ai";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const env = Object.fromEntries(
  readFileSync(path.join(root, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const account = env.CLOUDFLARE_ACCOUNT_ID;
const token = env.CLOUDFLARE_API_TOKEN;
const model = env.ASSISTANT_MODEL ?? env.PREDICTIONS_FACTORY_MODEL ?? "@cf/zai-org/glm-5.2";
if (!account || !token) {
  console.error("no CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN in .env");
  process.exit(2);
}

const ai = createOpenAICompatible({
  name: "workers-ai",
  baseURL: `https://api.cloudflare.com/client/v4/accounts/${account}/ai/v1`,
  headers: { authorization: `Bearer ${token}` },
});

const result = streamText({
  model: ai(model),
  system: "You are the Agent in the watchparty developer console. Be brief and concrete.",
  messages: [{ role: "user", content: "In one short sentence, what is an API key on this platform?" }],
  temperature: 0.4,
  maxOutputTokens: 6000,
});

let acc = "";
for await (const delta of result.textStream) {
  acc += delta;
  process.stdout.write(delta);
}
console.log(`\n\n[textStream yielded ${acc.length} chars of content]`);
if (!acc.trim()) {
  console.error("FAIL: empty reply — the text stream produced no content");
  process.exit(1);
}
console.log("PASS");
