// Proves the /siwe/* WIRE CONTRACT our client speaks matches the better-auth
// actually installed. This has no other coverage: the bodies are validated at
// runtime by zod inside better-auth, so a mismatch is a 400 at sign-in time
// with tsc, `bun test` and a green deploy all reporting success.
//
// better-auth 1.7 made both endpoints `.strict()` and dropped walletAddress /
// chainId from them, reading the address out of the signed message instead.
// This asserts the new shape works AND that the old shape is now rejected — so
// if someone reintroduces the old fields, this fails loudly.
//
//   bun scripts/dev/smoke-siwe-contract.mjs
import { betterAuth } from "better-auth";
import { siwe } from "better-auth/plugins/siwe";
import { createSiweMessage } from "viem/siwe";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { verifyMessage } from "viem";

const DOMAIN = "localhost:3001";
const ORIGIN = `http://${DOMAIN}`;
const CHAIN_ID = 1;

const auth = betterAuth({
  baseURL: `${ORIGIN}/api/auth`,
  trustedOrigins: [ORIGIN],
  plugins: [
    siwe({
      domain: DOMAIN,
      getNonce: async () => crypto.randomUUID().replace(/-/g, ""),
      verifyMessage: async ({ message, signature, address }) =>
        verifyMessage({ address, message, signature }),
    }),
  ],
});

const post = (path, body) =>
  auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: ORIGIN },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

// 1) Nonce with an EMPTY OBJECT body — the 1.7 shape our client now sends.
// Not bodyless: auth.handler in Node tolerates a bodyless POST, but the
// deployed worker 415s it ("Content-Type is required"), so asserting the
// bodyless form here passed while production failed. `{}` is the shape
// lib/chains/evm/sign-in.ts sends and the strict schema allows.
const nonceRes = await post("/siwe/nonce", {});
const noncePayload = await nonceRes.json().catch(() => ({}));
check("POST /siwe/nonce with {} body", nonceRes.status === 200 && !!noncePayload.nonce, `status ${nonceRes.status}`);

// 2) Full round trip: sign the message, verify with ONLY {message, signature}.
const account = privateKeyToAccount(generatePrivateKey());
const message = createSiweMessage({
  address: account.address,
  chainId: CHAIN_ID,
  domain: DOMAIN,
  nonce: noncePayload.nonce,
  uri: ORIGIN,
  version: "1",
  statement: "Sign in to Watchparty.",
});
const signature = await account.signMessage({ message });
const verifyRes = await post("/siwe/verify", { message, signature });
const verifyBody = await verifyRes.json().catch(() => ({}));
check(
  "POST /siwe/verify with {message, signature}",
  verifyRes.status === 200 && !!verifyBody.user,
  `status ${verifyRes.status} ${verifyRes.status !== 200 ? JSON.stringify(verifyBody) : ""}`,
);

// 3) The OLD shape must now be REJECTED — this is the regression that would
//    silently reappear if someone re-adds the fields "to be safe".
const legacyNonce = await post("/siwe/nonce", { walletAddress: account.address, chainId: CHAIN_ID });
check(
  "POST /siwe/nonce with legacy {walletAddress, chainId} is rejected",
  legacyNonce.status >= 400,
  `status ${legacyNonce.status}`,
);

console.log(failures === 0 ? "\nSIWE contract: OK" : `\nSIWE contract: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
