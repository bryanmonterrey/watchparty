// Solana sign-in is the PRIMARY auth path and nothing else in this repo
// exercises it. The risk it covers is specific: better-auth-siws talks to
// better-auth's *internal* adapter, so an upstream rename lands as a runtime
// TypeError with tsc, `bun test` and a green deploy all reporting success.
// That is exactly how 0.1.4 broke on better-auth 1.7
// (`findAccountByProviderId is not a function`).
//
//   bun scripts/dev/smoke-siws-contract.mjs
import { betterAuth } from "better-auth";
import { siwsPlugin, buildSiwsMessage } from "better-auth-siws";
import bs58 from "bs58";
import nacl from "tweetnacl";

const DOMAIN = "localhost:3001";
const ORIGIN = `http://${DOMAIN}`;

const auth = betterAuth({
  baseURL: `${ORIGIN}/api/auth`,
  trustedOrigins: [ORIGIN],
  plugins: [siwsPlugin({ domain: DOMAIN, statement: "Sign in with Solana to the app.", nonceTtlSeconds: 300 })],
});

const post = (path, body) =>
  auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: ORIGIN },
      body: JSON.stringify(body),
    }),
  );

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const kp = nacl.sign.keyPair();
const address = bs58.encode(kp.publicKey);

const startRes = await post("/siws/start", { address });
const start = await startRes.json().catch(() => ({}));
check("POST /siws/start", startRes.status === 200 && !!start.nonce, `status ${startRes.status}`);

const message = buildSiwsMessage({
  domain: start.domain,
  address,
  uri: start.uri,
  statement: "Sign in with Solana to the app.",
  nonce: start.nonce,
  issuedAt: new Date().toISOString(),
});
const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));

// The account-creation branch: this is the call that used the internal adapter
// method 1.7 removed, and the one that must write the `issuer` 1.7 requires.
const verifyRes = await post("/siws/verify", { address, message, signature });
const verified = await verifyRes.json().catch(() => ({}));
check("POST /siws/verify creates the account", verifyRes.status === 200 && !!verified.user, `status ${verifyRes.status}`);

// The lookup branch: signing in AGAIN with the same wallet must resolve to the
// SAME user. A wrong issuer value doesn't error — it just fails to match and
// mints a duplicate account, which is why this second round trip is asserted.
const start2 = await (await post("/siws/start", { address })).json().catch(() => ({}));
const message2 = buildSiwsMessage({
  domain: start2.domain,
  address,
  uri: start2.uri,
  statement: "Sign in with Solana to the app.",
  nonce: start2.nonce,
  issuedAt: new Date().toISOString(),
});
const signature2 = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message2), kp.secretKey));
const again = await (await post("/siws/verify", { address, message: message2, signature: signature2 })).json().catch(() => ({}));
check("signing in again resolves to the SAME user (no duplicate)", !!again.user && again.user === verified.user,
  again.user === verified.user ? "" : `${verified.user} vs ${again.user}`);

console.log(failures === 0 ? "\nSIWS contract: OK" : `\nSIWS contract: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
