// Probe the DEPLOYED SIWS endpoints with a keypair we control, to isolate
// client-wallet vs server. If our own valid signature 401s, the server's verify
// is broken in prod (not the user's wallet). Run: bun scripts/siws-probe.mjs [baseUrl]
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import bs58 from "bs58";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

function buildSiwsMessage({ domain, address, uri, statement, nonce, issuedAt }) {
  let message = `${domain} wants you to sign in with your Solana account:\n`;
  message += `${address}\n\n`;
  if (statement) message += `${statement}\n\n`;
  message += `URI: ${uri}\n`;
  message += `Nonce: ${nonce}\n`;
  message += `Issued At: ${issuedAt}`;
  return message;
}

const BASE = process.argv[2] || "https://watchparty.xyz/api/auth";
console.log("BASE:", BASE);

const priv = ed.utils.randomPrivateKey();
const pub = ed.getPublicKey(priv);
const address = bs58.encode(pub);
console.log("address:", address);

const startRes = await fetch(`${BASE}/siws/start`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address }),
});
console.log("\n[start] status:", startRes.status);
const startText = await startRes.text();
console.log("[start] body:", startText);
if (!startRes.ok) process.exit(1);
const { nonce, domain, uri } = JSON.parse(startText);

const message = buildSiwsMessage({
  domain,
  address,
  uri,
  nonce,
  issuedAt: new Date().toISOString(),
  statement: "Sign in with Solana to the app.",
});
console.log("\n[message]:\n" + message);

const sig = ed.sign(new TextEncoder().encode(message), priv);
const signature = bs58.encode(sig);

// sanity: verify locally exactly like the server does
const localOk = await ed.verifyAsync(bs58.decode(signature), new TextEncoder().encode(message), bs58.decode(address));
console.log("\n[local verify] (server's exact check):", localOk);

const verifyRes = await fetch(`${BASE}/siws/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address, message, signature }),
});
console.log("\n[verify] status:", verifyRes.status);
console.log("[verify] body:", await verifyRes.text());
