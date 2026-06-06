// EVM wallet sign-in via better-auth's native SIWE plugin.
// Base uses the Base Account SDK ("Sign in with Base"); MetaMask/injected and
// Hyperliquid use the EIP-1193 provider + personal_sign. Both verify through
// the /siwe/* endpoints (called directly to avoid extra client-plugin inference).
import { createSiweMessage } from "viem/siwe";
import { createBaseAccountSDK } from "@base-org/account";
import { BASE } from "../registry";

const AUTH_URL =
  process.env.NEXT_PUBLIC_AUTH_URL ??
  (typeof window !== "undefined" ? `${window.location.origin}/api/auth` : "http://localhost:3001/api/auth");

export async function siweNonce(walletAddress?: string, chainId?: number): Promise<string> {
  const res = await fetch(`${AUTH_URL}/siwe/nonce`, {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, chainId }),
  });
  if (!res.ok) throw new Error("Failed to start sign-in.");
  return (await res.json()).nonce;
}

export async function siweVerify(body: {
  message: string;
  signature: string;
  walletAddress: string;
  chainId: number;
}) {
  // `keepalive` lets this request finish even if mobile Safari backgrounds the
  // tab when returning from the wallet app — otherwise the POST is cancelled
  // (Vercel logs it as status 0, function never runs) and sign-in hangs. Retry
  // once for a transient post-hand-off drop.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${AUTH_URL}/siwe/verify`, {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "Verification failed.");
      return data;
    } catch (e) {
      lastErr = e;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr;
}

// "Sign in with Base" — opens the Base Account flow (popup to Base), connects the
// smart wallet, and returns a SIWE message+signature via the signInWithEthereum capability.
export async function signInWithBase() {
  // Create the provider synchronously (static import) so the Base popup opens
  // within the click gesture. Base Account is an EIP-1193 provider, so we reuse
  // the injected flow: connect → request nonce WITH the address → SIWE sign.
  // (better-auth's SIWE nonce is keyed by address, so we must connect first.)
  const provider = createBaseAccountSDK({
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Watchparty",
  }).getProvider();
  return signInWithInjectedEvm(BASE.chainId!, provider);
}

// Rejects if an EIP-1193 request hangs. A broken/stale wallet-extension context
// (e.g. multiple EVM wallets fighting over window.ethereum, or an extension that
// auto-updated while the page was open) can make request() never resolve.
function rpcTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error("Wallet didn't respond. Refresh the page or disable other wallet extensions.")),
        ms,
      ),
    ),
  ]);
}

// MetaMask / injected EVM wallet for any EVM chainId (Ethereum, Base, Hyperliquid).
// Pass a specific EIP-1193 `provider` (from EIP-6963 discovery) or fall back to window.ethereum.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signInWithInjectedEvm(chainId: number, provider?: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = provider ?? (typeof window !== "undefined" ? (window as any).ethereum : undefined);
  if (!eth) throw new Error("No EVM wallet found. Install MetaMask.");

  const accounts: string[] = await rpcTimeout(eth.request({ method: "eth_requestAccounts" }), 60_000);
  const address = accounts[0];
  if (!address) throw new Error("No account selected.");

  const hexChain = `0x${chainId.toString(16)}`;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexChain }] });
  } catch {
    // Chain may not be added in the wallet; continue and let signing surface any mismatch.
  }

  const nonce = await siweNonce(address, chainId);
  const message = createSiweMessage({
    address: address as `0x${string}`,
    chainId,
    domain: window.location.host,
    nonce,
    uri: window.location.origin,
    version: "1",
    statement: "Sign in to Watchparty.",
  });
  const signature: string = await eth.request({ method: "personal_sign", params: [message, address] });
  return siweVerify({ message, signature, walletAddress: address, chainId });
}

// EVM WalletConnect (QR) — for users without an injected wallet (mobile wallets).
// WalletConnect renders its own QR modal, so the dynamic import is fine (no popup).
export async function signInWithEvmWalletConnect(chainId: number) {
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const origin = typeof window !== "undefined" ? window.location.origin : "https://watchparty.xyz";
  const provider = await EthereumProvider.init({
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
    chains: [chainId],
    showQrModal: true,
    metadata: {
      name: process.env.NEXT_PUBLIC_APP_NAME || "Watchparty",
      description: "Sign in to Watchparty",
      url: origin,
      icons: [`${origin}/favicon.ico`],
    },
  });
  await provider.connect();
  return signInWithInjectedEvm(chainId, provider);
}
