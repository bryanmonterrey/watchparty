// End-to-end smoke test against the LIVE realtime worker.
// Signs real tokens with REALTIME_SECRET, opens two WebSocket clients to the
// deployed Chat DO, and asserts auth + presence + chat broadcast + typing relay.
//
//   node scripts/realtime/smoke.mjs
//
// Uses an isolated, random room name — no production data is touched (the DO is
// ephemeral and persists nothing).
import fs from "node:fs";
import { SignJWT } from "jose";

function parseEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

const env = parseEnv(".env");
const SECRET = env.REALTIME_SECRET;
const HOST = env.NEXT_PUBLIC_REALTIME_HOST;
if (!SECRET || !HOST) {
  console.error("Missing REALTIME_SECRET or NEXT_PUBLIC_REALTIME_HOST in .env");
  process.exit(1);
}

const key = new TextEncoder().encode(SECRET);
const signToken = (sub, name, extraClaims = {}) =>
  new SignJWT({ name, ...extraClaims })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setIssuedAt()
    .setExpirationTime("120s")
    .sign(key);

const room = `community-channel:smoke-${Math.random().toString(36).slice(2, 10)}`;
const wsUrl = (token) =>
  `wss://${HOST}/parties/chat/${encodeURIComponent(room)}?token=${encodeURIComponent(token)}`;

const events = { A: [], B: [] };
const results = [];
const assert = (name, cond) => {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "✅" : "❌"} ${name}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(label, token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl(token));
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", () => reject(new Error(`${label} connection error`)));
    ws.addEventListener("message", (e) => {
      try {
        events[label].push(JSON.parse(e.data));
      } catch {}
    });
    ws.addEventListener("close", (e) => {
      if (e.code === 4401) reject(new Error(`${label} rejected: unauthorized (4401)`));
    });
  });
}

async function main() {
  console.log(`Room: ${room}\nHost: ${HOST}\n`);

  // 1. Bad token must be rejected at the upgrade layer (never reaches OPEN).
  let opened = false;
  let received = 0;
  await new Promise((resolve) => {
    const bad = new WebSocket(wsUrl("not-a-valid-token"));
    bad.addEventListener("open", () => { opened = true; });
    bad.addEventListener("message", () => { received += 1; });
    bad.addEventListener("close", () => resolve());
    bad.addEventListener("error", () => resolve());
    setTimeout(() => { try { bad.close(); } catch {} resolve(); }, 4000);
  });
  assert("invalid token never opens a socket + receives nothing", !opened && received === 0);

  // 2. Two authenticated clients connect.
  const tokenA = await signToken("smoke-user-A", "Alice");
  const tokenB = await signToken("smoke-user-B", "Bob");
  const a = await connect("A", tokenA);
  assert("client A authenticates + connects", a.readyState === WebSocket.OPEN);
  await wait(400);
  const b = await connect("B", tokenB);
  assert("client B authenticates + connects", b.readyState === WebSocket.OPEN);
  await wait(800);

  // 3. Presence: A should have seen a roster containing both users after B joined.
  const presenceA = [...events.A].reverse().find((e) => e.t === "presence");
  const ids = presenceA ? presenceA.users.map((u) => u.userId).sort() : [];
  assert(
    "presence roster shows both users",
    JSON.stringify(ids) === JSON.stringify(["smoke-user-A", "smoke-user-B"]),
  );

  // 4. Chat broadcast: A sends, BOTH should receive with stamped identity.
  events.A.length = 0;
  events.B.length = 0;
  a.send(JSON.stringify({ t: "chat", text: "hello from Alice" }));
  await wait(800);
  const chatB = events.B.find((e) => e.t === "chat" && e.text === "hello from Alice");
  assert("B receives A's chat message", !!chatB);
  assert("chat identity stamped by server (not spoofable)", chatB && chatB.userId === "smoke-user-A" && chatB.name === "Alice");
  const chatA = events.A.find((e) => e.t === "chat" && e.text === "hello from Alice");
  assert("sender A also receives the authoritative message", !!chatA);

  // 4.5. chat:false claim gates SENDING. This is the regression test for the
  // dropped-claim bug: verifyRealtimeToken once returned only {sub, name},
  // so `canChat: claims.chat !== false` saw undefined and followers-only /
  // subscribers-only chat gating silently passed everyone.
  {
    events.M = [];
    const tokenMuted = await signToken("smoke-user-M", "Muted", { chat: false });
    const m = await connect("M", tokenMuted);
    await wait(500);
    events.A.length = 0;
    m.send(JSON.stringify({ t: "chat", text: "should never broadcast" }));
    await wait(800);
    assert(
      "chat:false connection cannot send chat (dropped-claim regression)",
      !events.A.some((e) => e.t === "chat" && e.text === "should never broadcast"),
    );
    m.close();
  }

  // 5. Typing relay: B types, A should see it (and not echo back to B).
  events.A.length = 0;
  events.B.length = 0;
  b.send(JSON.stringify({ t: "typing", channelId: "smoke" }));
  await wait(700);
  assert("A sees B typing", events.A.some((e) => e.t === "typing" && e.userId === "smoke-user-B"));
  assert("typing is NOT echoed to sender B", !events.B.some((e) => e.t === "typing"));

  a.close();
  b.close();
  await wait(200);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e.message);
  process.exit(1);
});
