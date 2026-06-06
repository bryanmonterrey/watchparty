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

async function siweNonce(walletAddress?: string, chainId?: number): Promise<string> {
  const res = await fetch(`${AUTH_URL}/siwe/nonce`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, chainId }),
  });
  if (!res.ok) throw new Error("Failed to start sign-in.");
  return (await res.json()).nonce;
}

async function siweVerify(body: {
  message: string;
  signature: string;
  walletAddress: string;
  chainId: number;
}) {
  const res = await fetch(`${AUTH_URL}/siwe/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Verification failed.");
  return data;
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

// MetaMask / injected EVM wallet for any EVM chainId (Ethereum, Base, Hyperliquid).
// Pass a specific EIP-1193 `provider` (from EIP-6963 discovery) or fall back to window.ethereum.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function signInWithInjectedEvm(chainId: number, provider?: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = provider ?? (typeof window !== "undefined" ? (window as any).ethereum : undefined);
  if (!eth) throw new Error("No EVM wallet found. Install MetaMask.");

  const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
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

// SIWE for an already-connected EVM account (used by the wagmi flow): request a
// nonce for the address, build the SIWE message, sign it, and verify -> session.
export async function signEvmSiwe(
  address: string,
  chainId: number,
  signMessage: (message: string) => Promise<string>,
) {
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
  const signature = await signMessage(message);
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
