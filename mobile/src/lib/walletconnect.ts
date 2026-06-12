// EVM wallet sign-in via WalletConnect deep links — the mobile twin of
// lib/chains/evm/sign-in.ts signInWithEvmWalletConnect. Instead of the web
// QR modal, the pairing URI deep-links into the chosen wallet app, and the
// SIWE two-step hits the same better-auth endpoints (/siwe/nonce →
// personal_sign in the wallet → /siwe/verify).

import Constants from 'expo-constants';
import * as Linking from 'expo-linking';

import { authClient } from '@/lib/auth-client';
import { getBaseUrl } from '@/lib/base-url';

export type EvmStage = 'connect' | 'sign' | 'verify';

export type EvmWalletId = keyof typeof EVM_WALLETS;

// Universal links (https) work without LSApplicationQueriesSchemes and fall
// back to the App Store when the wallet isn't installed.
export const EVM_WALLETS = {
  metamask: {
    name: 'MetaMask',
    wc: (uri: string) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
    open: 'https://metamask.app.link',
  },
  rainbow: {
    name: 'Rainbow',
    wc: (uri: string) => `https://rnbwapp.com/wc?uri=${encodeURIComponent(uri)}`,
    open: 'https://rnbwapp.com',
  },
  trust: {
    name: 'Trust Wallet',
    wc: (uri: string) => `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
    open: 'https://link.trustwallet.com',
  },
} as const;

// Base is the primary EVM chain (lib/chains/registry.ts BASE).
const CHAIN_ID = 8453;
const OPTIONAL_CHAINS = [1, 999]; // Ethereum, Hyperliquid

// Minimal structural view of EthereumProvider — keeps the dynamic import
// from dragging WalletConnect's types through every consumer.
interface WcProvider {
  session?: unknown;
  accounts: string[];
  on(event: string, cb: (arg: never) => void): void;
  removeListener(event: string, cb: (arg: never) => void): void;
  connect(opts?: { chains?: number[] }): Promise<unknown>;
  disconnect(): Promise<void>;
  request<T>(args: { method: string; params?: unknown[] }): Promise<T>;
}

let providerPromise: Promise<WcProvider> | null = null;

async function getProvider(): Promise<WcProvider> {
  if (!providerPromise) {
    providerPromise = (async () => {
      // Compat shims (TextEncoder, crypto, …) must load before the provider.
      await import('@walletconnect/react-native-compat');
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
      const projectId = (Constants.expoConfig?.extra as { walletConnectProjectId?: string })
        ?.walletConnectProjectId;
      if (!projectId) throw new Error('WalletConnect project id missing from app config.');
      const provider = await EthereumProvider.init({
        projectId,
        chains: [CHAIN_ID],
        optionalChains: OPTIONAL_CHAINS as [number],
        showQrModal: false,
        metadata: {
          name: 'Watchparty',
          description: 'Sign in to Watchparty',
          url: 'https://watchparty.xyz',
          icons: ['https://watchparty.xyz/favicon.ico'],
        },
      });
      return provider as unknown as WcProvider;
    })().catch((e) => {
      providerPromise = null; // allow retry after a failed init
      throw e;
    });
  }
  return providerPromise;
}

function toHex(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let hex = '0x';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

// EIP-4361 message, mirroring what the web builds with viem's
// createSiweMessage — the server verifies the signature over this string.
function buildSiweMessage(p: {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
}): string {
  return (
    `${p.domain} wants you to sign in with your Ethereum account:\n` +
    `${p.address}\n\n` +
    `${p.statement}\n\n` +
    `URI: ${p.uri}\n` +
    `Version: 1\n` +
    `Chain ID: ${p.chainId}\n` +
    `Nonce: ${p.nonce}\n` +
    `Issued At: ${p.issuedAt}`
  );
}

/**
 * Full EVM sign-in through a WalletConnect wallet app. Resolves once the
 * better-auth session cookie is stored.
 */
export async function signInWithEvmWallet(
  walletId: EvmWalletId,
  onStage?: (stage: EvmStage) => void,
): Promise<void> {
  const wallet = EVM_WALLETS[walletId];
  const provider = await getProvider();

  onStage?.('connect');
  const onUri = (uri: string) => {
    Linking.openURL(wallet.wc(uri)).catch(() => {});
  };
  provider.on('display_uri', onUri);
  try {
    if (!provider.session) {
      await provider.connect({ chains: [CHAIN_ID] });
    }
  } finally {
    provider.removeListener('display_uri', onUri);
  }

  const address = provider.accounts[0];
  if (!address) throw new Error('No account returned by the wallet.');

  // SIWE nonce is keyed by address — request it after connecting.
  const nonceRes = await authClient.$fetch<{ nonce: string }>('/siwe/nonce', {
    method: 'POST',
    body: { walletAddress: address, chainId: CHAIN_ID },
  });
  if (nonceRes.error || !nonceRes.data?.nonce) {
    throw new Error("Couldn't start the wallet sign-in. Is the server up?");
  }

  const base = getBaseUrl();
  const message = buildSiweMessage({
    domain: base.replace(/^https?:\/\//, ''),
    address,
    statement: 'Sign in to Watchparty.',
    uri: base,
    chainId: CHAIN_ID,
    nonce: nonceRes.data.nonce,
    issuedAt: new Date().toISOString(),
  });

  // The signature prompt appears in the wallet app — bring it forward.
  onStage?.('sign');
  Linking.openURL(wallet.open).catch(() => {});
  const signature = await provider.request<string>({
    method: 'personal_sign',
    params: [toHex(message), address],
  });

  onStage?.('verify');
  const verify = await authClient.$fetch('/siwe/verify', {
    method: 'POST',
    body: { message, signature, walletAddress: address, chainId: CHAIN_ID },
  });
  if (verify.error) {
    throw new Error(verify.error.message ?? 'Wallet sign-in was rejected by the server.');
  }

  // /siwe/* are plugin routes the react client doesn't know — poke the
  // session store so useSession() refetches and the redirect fires.
  (authClient as unknown as { $store: { notify: (s: string) => void } }).$store.notify(
    '$sessionSignal',
  );
}

/** Tear down a pending WC pairing (Back button). */
export async function cancelEvmFlow() {
  try {
    const provider = await providerPromise;
    await provider?.disconnect();
  } catch {
    /* nothing to tear down */
  }
}
