// Unified WalletConnect sign-in via a SINGLE shared UniversalProvider.
//
// Why one provider: @walletconnect/ethereum-provider and
// @walletconnect/solana-adapter each spin up their own WalletConnect Core
// against the same projectId/storage, which conflict when used in the same
// session (e.g. open Solana QR, cancel, then EVM QR won't open). UniversalProvider
// is a single client that can request BOTH the `eip155` and `solana` namespaces,
// so one QR works for either chain ("hybrid"), and per-chain QRs reuse the same
// instance. We render the QR ourselves (qrcode) from the `display_uri` event
// instead of WalletConnect's third-party modal.
import { UniversalProvider } from "@walletconnect/universal-provider";
import { createSiweMessage } from "viem/siwe";
import bs58 from "bs58";
import { siweNonce, siweVerify } from "./evm/sign-in";
import { signInWithSolana } from "./solana/sign-in";
import { ETHEREUM, BASE } from "./registry";

// Solana mainnet CAIP-2 (current + legacy alias — some wallets still send the old one).
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const SOLANA_MAINNET_LEGACY = "solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ";

type UP = Awaited<ReturnType<typeof UniversalProvider.init>>;

let providerPromise: Promise<UP> | null = null;
function getProvider(): Promise<UP> {
  if (!providerPromise) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://watchparty.xyz";
    providerPromise = UniversalProvider.init({
      projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "",
      metadata: {
        name: process.env.NEXT_PUBLIC_APP_NAME || "Watchparty",
        description: "Sign in to Watchparty",
        url: origin,
        icons: [`${origin}/icon-192.png`],
      },
    });
  }
  return providerPromise;
}

// Which namespaces to request: "hybrid" (both), a single EVM chain, or Solana.
export type WcTarget =
  | { kind: "hybrid" }
  | { kind: "evm"; chainId: number }
  | { kind: "solana" };

function namespacesFor(target: WcTarget) {
  const evmChains = (() => {
    if (target.kind === "evm") return [`eip155:${target.chainId}`];
    if (target.kind === "hybrid") return [`eip155:${ETHEREUM.chainId}`, `eip155:${BASE.chainId}`];
    return [];
  })();
  const solanaChains =
    target.kind === "solana" || target.kind === "hybrid" ? [SOLANA_MAINNET, SOLANA_MAINNET_LEGACY] : [];

  return {
    ...(evmChains.length
      ? {
          eip155: {
            methods: ["personal_sign", "eth_sendTransaction"],
            chains: evmChains,
            events: ["chainChanged", "accountsChanged"],
          },
        }
      : {}),
    ...(solanaChains.length
      ? {
          solana: {
            methods: ["solana_signMessage"],
            chains: solanaChains,
            events: [],
          },
        }
      : {}),
  };
}

// Open a WalletConnect session for the given target, surfacing the pairing URI
// to `onUri` (render it as a QR). Resolves once the wallet has connected, signed,
// and the SIWE/SIWS verification has created a session.
export async function signInWithWalletConnect(target: WcTarget, onUri: (uri: string) => void): Promise<unknown> {
  const provider = await getProvider();

  // Clear any stale session so a fresh QR is generated each time.
  if (provider.session) {
    try {
      await provider.disconnect();
    } catch {
      /* ignore */
    }
  }

  const handleUri = (payload: { uri?: string } | string) => {
    const uri = typeof payload === "string" ? payload : payload?.uri;
    if (uri) onUri(uri);
  };
  provider.on("display_uri", handleUri);

  try {
    await provider.connect({ optionalNamespaces: namespacesFor(target) });
    const ns = provider.session?.namespaces ?? {};

    // EVM approved → SIWE.
    const eip = ns.eip155;
    if (eip?.accounts?.length) {
      const [, chainIdStr, address] = eip.accounts[0].split(":");
      const chainId = Number(chainIdStr);
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
      const signature = (await provider.request(
        { method: "personal_sign", params: [message, address] },
        `eip155:${chainId}`,
      )) as string;
      return await siweVerify({ message, signature, walletAddress: address, chainId });
    }

    // Solana approved → SIWS (reuse the wallet-adapter sign-in via a WC-backed wallet).
    const sol = ns.solana;
    if (sol?.accounts?.length) {
      const parts = sol.accounts[0].split(":");
      const address = parts[2];
      const chainRef = `${parts[0]}:${parts[1]}`;
      return await signInWithSolana({
        publicKey: { toBase58: () => address },
        signMessage: async (msg: Uint8Array) => {
          const res = (await provider.request(
            { method: "solana_signMessage", params: { message: bs58.encode(msg), pubkey: address } },
            chainRef,
          )) as { signature: string };
          return bs58.decode(res.signature);
        },
      });
    }

    throw new Error("Wallet connected but approved no supported chain.");
  } finally {
    provider.off("display_uri", handleUri);
  }
}
