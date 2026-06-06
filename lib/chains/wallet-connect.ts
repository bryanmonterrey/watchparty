// Unified WalletConnect sign-in via a SINGLE shared UniversalProvider.
//
// Why one provider: @walletconnect/ethereum-provider and
// @walletconnect/solana-adapter each spin up their own WalletConnect Core
// against the same projectId/storage, which conflict when used in the same
// session (e.g. open Solana QR, cancel, then EVM QR won't open). UniversalProvider
// is a single client that can request BOTH the `eip155` and `solana` namespaces,
// so one QR works for either chain ("hybrid"), and per-chain QRs reuse the same
// instance. We render the QR ourselves (qrcode) from the `display_uri` event
// instead of a second WalletConnect modal.
//
// The modal UI is Reown AppKit (the same modal @walletconnect/solana-adapter
// renders), driven by our shared provider via `manualWCControl` — so the look
// matches what we had before, without a second WalletConnect core.
import { UniversalProvider } from "@walletconnect/universal-provider";
import { createAppKit } from "@reown/appkit/core";
import { mainnet, base, solana } from "@reown/appkit/networks";
import { createSiweMessage } from "viem/siwe";
import bs58 from "bs58";
import { siweNonce, siweVerify } from "./evm/sign-in";
import { signInWithSolana } from "./solana/sign-in";

const PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

// Solana mainnet CAIP-2.
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

type UP = Awaited<ReturnType<typeof UniversalProvider.init>>;

let providerPromise: Promise<UP> | null = null;
function getProvider(): Promise<UP> {
  if (!providerPromise) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://watchparty.xyz";
    providerPromise = UniversalProvider.init({
      projectId: PROJECT_ID,
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

let appKit: ReturnType<typeof createAppKit> | null = null;
function getModal(provider: UP) {
  if (!appKit) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://watchparty.xyz";
    appKit = createAppKit({
      projectId: PROJECT_ID,
      // AppKit bundles its own (duplicated) UniversalProvider type; same class,
      // separate declaration — cast across the copy.
      universalProvider: provider as unknown as Parameters<typeof createAppKit>[0]["universalProvider"],
      networks: [mainnet, base, solana],
      manualWCControl: true,
      metadata: {
        name: process.env.NEXT_PUBLIC_APP_NAME || "Watchparty",
        description: "Sign in to Watchparty",
        url: origin,
        icons: [`${origin}/icon-192.png`],
      },
    });
  }
  return appKit;
}

// A QR targets ONE ecosystem. Real wallets are single-ecosystem (Phantom=Solana,
// MetaMask=EVM) and reject a proposal that mixes eip155 + solana — so we never
// request both in one session.
export type WcTarget = { kind: "evm"; chainId: number } | { kind: "solana" };

function namespacesFor(
  target: WcTarget,
): Record<string, { methods: string[]; chains: string[]; events: string[] }> {
  if (target.kind === "evm") {
    return {
      eip155: {
        methods: ["personal_sign", "eth_sendTransaction"],
        chains: [`eip155:${target.chainId}`],
        events: ["chainChanged", "accountsChanged"],
      },
    };
  }
  return {
    solana: {
      methods: ["solana_signMessage"],
      chains: [SOLANA_MAINNET],
      events: [],
    },
  };
}

// Open a WalletConnect session for the given target using the Reown AppKit
// modal. Resolves once the wallet has connected, signed, and the SIWE/SIWS
// verification has created a session.
export async function signInWithWalletConnect(target: WcTarget): Promise<unknown> {
  const provider = await getProvider();
  const modal = getModal(provider);

  // Start from a clean slate so a fresh pairing/QR is generated each time. This
  // is what fixes "second QR won't open": a prior attempt's session or pending
  // pairing (e.g. after closing the modal) is torn down before reconnecting.
  if (provider.session) {
    try {
      await provider.disconnect();
    } catch {
      /* ignore */
    }
  }
  await provider.cleanupPendingPairings().catch(() => {});

  // If the user closes the modal before connecting, abort the pending pairing so
  // it doesn't hang or block the next attempt. (Guard against the initial closed
  // state firing immediately.)
  let abort: (() => void) | null = null;
  let modalWasOpen = false;
  const aborted = new Promise<never>((_, reject) => {
    abort = () => {
      try {
        provider.abortPairingAttempt();
      } catch {
        /* ignore */
      }
      reject(new Error("User closed the WalletConnect modal."));
    };
  });
  const unsubscribe = modal.subscribeState((state: { open: boolean }) => {
    if (state.open) modalWasOpen = true;
    else if (modalWasOpen) abort?.();
  });

  // manualWCControl: AppKit reads the pairing URI from our provider once we open
  // the modal and call connect().
  modal.open();

  try {
    const connected = provider.connect({ optionalNamespaces: namespacesFor(target) });
    await Promise.race([connected, aborted]);
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
    unsubscribe();
    modal.close();
  }
}
