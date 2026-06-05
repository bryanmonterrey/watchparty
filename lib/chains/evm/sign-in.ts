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
  // Create the provider synchronously (static import) so the Base popup can open
  // within the click gesture — otherwise the browser blocks it.
  const provider = createBaseAccountSDK({
    appName: process.env.NEXT_PUBLIC_APP_NAME ?? "Watchparty",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }).getProvider() as any;

  const nonce = await siweNonce(undefined, BASE.chainId);
  // Base's SDK expects chainId in hex (Base mainnet 8453 = 0x2105), not a number.
  const hexChainId = `0x${BASE.chainId!.toString(16)}`;
  const { accounts } = await provider.request({
    method: "wallet_connect",
    params: [{ version: "1", capabilities: { signInWithEthereum: { nonce, chainId: hexChainId } } }],
  });

  const account = accounts?.[0];
  const siwe = account?.capabilities?.signInWithEthereum;
  if (!account?.address || !siwe?.message || !siwe?.signature) {
    throw new Error("Base sign-in was cancelled.");
  }
  return siweVerify({
    message: siwe.message,
    signature: siwe.signature,
    walletAddress: account.address,
    chainId: BASE.chainId!,
  });
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
