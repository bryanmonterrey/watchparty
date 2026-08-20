// Exercises BOTH sign-in paths against a DEPLOYED worker (preview or prod)
// over real HTTP — the only proof that covers the whole stack at once:
// better-auth 1.7's strict SIWE bodies, better-auth-siws 0.2.x's adapter
// bridge, the issuer-keyed account lookup, AND the workerd runtime, where
// Node-only behavior dies invisibly (see "Prod-only worker bugs").
//
//   bun scripts/dev/smoke-preview-signin.mjs https://<version>-watchparty.takingpay.workers.dev
//
// ⚠️ Creates two throwaway users in whatever DB the target worker points at
// (prod, for preview versions). Wallets are freshly generated keys holding
// nothing; the accounts are inert.
import { buildSiwsMessage } from "better-auth-siws";
import { createSiweMessage } from "viem/siwe";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import bs58 from "bs58";
import nacl from "tweetnacl";

const BASE = process.argv[2]?.replace(/\/$/, "");
if (!BASE) {
  console.error("usage: bun scripts/dev/smoke-preview-signin.mjs <worker base url>");
  process.exit(2);
}
// The SIWE plugin verifies the message's domain against NEXT_PUBLIC_AUTH_DOMAIN,
// not against the Host it was served on — so preview versions still expect prod's.
const AUTH_DOMAIN = process.env.SMOKE_AUTH_DOMAIN ?? "watchparty.xyz";

// No Origin header on purpose: the preview URL is not in trustedOrigins, and
// better-auth only enforces the origin check when the header is present.
const post = (path, body) =>
  fetch(`${BASE}/api/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `{}` for "no body": the deployed worker 415s a POST without a JSON
    // content-type and 400s a content-type with an unparsable empty body —
    // this matches what lib/chains/evm/sign-in.ts actually sends.
    body: JSON.stringify(body ?? {}),
  });

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// ---- SIWS (Solana, the primary path) ---------------------------------------
const kp = nacl.sign.keyPair();
const solAddress = bs58.encode(kp.publicKey);

const startRes = await post("/siws/start", { address: solAddress });
const start = await startRes.json().catch(() => ({}));
check("SIWS /siws/start", startRes.status === 200 && !!start.nonce, `status ${startRes.status}`);

const siwsSign = (s) => {
  const message = buildSiwsMessage({
    domain: s.domain,
    address: solAddress,
    uri: s.uri,
    statement: "Sign in with Solana to the app.",
    nonce: s.nonce,
    issuedAt: new Date().toISOString(),
  });
  const signature = bs58.encode(nacl.sign.detached(new TextEncoder().encode(message), kp.secretKey));
  return { message, signature };
};

const v1 = await post("/siws/verify", { address: solAddress, ...siwsSign(start) });
const verified = await v1.json().catch(() => ({}));
check("SIWS /siws/verify creates the account", v1.status === 200 && !!verified.user, `status ${v1.status} ${JSON.stringify(verified).slice(0, 200)}`);

const start2 = await (await post("/siws/start", { address: solAddress })).json().catch(() => ({}));
const v2 = await post("/siws/verify", { address: solAddress, ...siwsSign(start2) });
const again = await v2.json().catch(() => ({}));
check(
  "SIWS second sign-in resolves to the SAME user",
  !!again.user && again.user === verified.user,
  again.user === verified.user ? "" : `${verified.user} vs ${again.user}`,
);

// ---- SIWE (EVM, the 1.7 strict contract) -----------------------------------
const nonceRes = await post("/siwe/nonce"); // 1.7: no body at all
const noncePayload = await nonceRes.json().catch(() => ({}));
check("SIWE /siwe/nonce with no body", nonceRes.status === 200 && !!noncePayload.nonce, `status ${nonceRes.status}`);

const account = privateKeyToAccount(generatePrivateKey());
const message = createSiweMessage({
  address: account.address,
  chainId: 8453, // Base — also proves linkSignInWallet's chain_id parse path
  domain: AUTH_DOMAIN,
  nonce: noncePayload.nonce,
  uri: `https://${AUTH_DOMAIN}`,
  version: "1",
});
const signature = await account.signMessage({ message });
const verifyRes = await post("/siwe/verify", { message, signature }); // 1.7: only these two keys
const siweVerified = await verifyRes.json().catch(() => ({}));
check(
  "SIWE /siwe/verify with only {message, signature}",
  verifyRes.status === 200 && (!!siweVerified.user || !!siweVerified.token || siweVerified.success === true),
  `status ${verifyRes.status} ${JSON.stringify(siweVerified).slice(0, 200)}`,
);

console.log(`\naddresses: sol=${solAddress} evm=${account.address}`);
console.log(failures === 0 ? "deployed sign-in: OK" : `deployed sign-in: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
