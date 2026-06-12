// Solana wallet sign-in via Phantom's deeplink protocol
// (https://docs.phantom.com/phantom-deeplinks) — on iOS wallets are apps,
// not extensions, so "connect" means deep-linking into the Phantom app and
// receiving the response on our own link. Payloads are nacl box-encrypted
// with an ephemeral X25519 keypair. The auth flow itself is the same SIWS
// two-step the web uses (lib/chains/solana/sign-in.ts): /siws/start →
// wallet signs the message → /siws/verify → session cookie.

import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { authClient } from '@/lib/auth-client';
import { buildSiwsMessage } from '@/lib/siws-message';

// tweetnacl has no entropy source in React Native — feed it expo-crypto.
nacl.setPRNG((x, n) => {
  const bytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = bytes[i];
});

const PHANTOM_BASE = 'https://phantom.app/ul/v1';
const REDIRECT_TIMEOUT_MS = 5 * 60 * 1000;

export type PhantomStage = 'connect' | 'sign' | 'verify';

type RedirectParams = Record<string, string>;

let pending: {
  resolve: (params: RedirectParams) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
} | null = null;

/**
 * Feed incoming deep links here (from a Linking 'url' listener). Returns
 * true if a Phantom flow was waiting on it.
 */
export function handlePhantomRedirect(url: string): boolean {
  if (!pending) return false;
  const { queryParams } = Linking.parse(url);
  const params: RedirectParams = {};
  for (const [k, v] of Object.entries(queryParams ?? {})) {
    if (typeof v === 'string') params[k] = v;
  }
  // Only consume links that look like Phantom responses.
  if (!params.phantom_encryption_public_key && !params.data && !params.errorCode) {
    return false;
  }
  const p = pending;
  pending = null;
  clearTimeout(p.timer);
  p.resolve(params);
  return true;
}

/** Abort a flow that's waiting on a redirect (e.g. the user tapped Back). */
export function cancelPhantomFlow() {
  if (!pending) return;
  const p = pending;
  pending = null;
  clearTimeout(p.timer);
  p.reject(new Error('cancelled'));
}

function waitForRedirect(): Promise<RedirectParams> {
  cancelPhantomFlow();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending = null;
      reject(new Error('Timed out waiting for Phantom. Is it installed?'));
    }, REDIRECT_TIMEOUT_MS);
    pending = { resolve, reject, timer };
  });
}

function buildUrl(method: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `${PHANTOM_BASE}/${method}?${query}`;
}

function utf8Encode(s: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
  return Uint8Array.from(unescape(encodeURIComponent(s)), (c) => c.charCodeAt(0));
}

function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes);
  return decodeURIComponent(escape(String.fromCharCode(...bytes)));
}

function decryptPayload<T>(data: string, nonce: string, sharedSecret: Uint8Array): T {
  const opened = nacl.box.open.after(bs58.decode(data), bs58.decode(nonce), sharedSecret);
  if (!opened) throw new Error("Couldn't decrypt the response from Phantom.");
  return JSON.parse(utf8Decode(opened)) as T;
}

function encryptPayload(payload: unknown, sharedSecret: Uint8Array): { nonce: Uint8Array; data: Uint8Array } {
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const data = nacl.box.after(utf8Encode(JSON.stringify(payload)), nonce, sharedSecret);
  return { nonce, data };
}

function throwIfPhantomError(params: RedirectParams) {
  if (params.errorCode) {
    // 4001 = user rejected — keep the message friendly.
    throw new Error(
      params.errorCode === '4001'
        ? 'cancelled'
        : (params.errorMessage ?? `Phantom error ${params.errorCode}`),
    );
  }
}

/**
 * Full sign-in: connect → SIWS nonce → signMessage in Phantom → verify.
 * Resolves once the better-auth session cookie is stored.
 */
export async function signInWithPhantom(onStage?: (stage: PhantomStage) => void): Promise<void> {
  const dappKeyPair = nacl.box.keyPair();
  // In Expo Go this is exp://…/--/ ; in release builds watchparty://
  const redirectLink = Linking.createURL('/');

  // 1) Connect — Phantom returns its encryption pubkey + our session token.
  onStage?.('connect');
  await Linking.openURL(
    buildUrl('connect', {
      app_url: 'https://watchparty.xyz',
      dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
      redirect_link: redirectLink,
    }),
  );
  const connectParams = await waitForRedirect();
  throwIfPhantomError(connectParams);

  const sharedSecret = nacl.box.before(
    bs58.decode(connectParams.phantom_encryption_public_key),
    dappKeyPair.secretKey,
  );
  const { public_key: address, session } = decryptPayload<{ public_key: string; session: string }>(
    connectParams.data,
    connectParams.nonce,
    sharedSecret,
  );

  // 2) SIWS nonce from the server (address-keyed, 5 min TTL).
  const start = await authClient.$fetch<{ nonce: string; domain: string; uri: string }>(
    '/siws/start',
    { method: 'POST', body: { address } },
  );
  if (start.error || !start.data) {
    throw new Error("Couldn't start the wallet sign-in. Is the server up?");
  }
  const message = buildSiwsMessage({
    address,
    domain: start.data.domain,
    uri: start.data.uri,
    nonce: start.data.nonce,
    issuedAt: new Date().toISOString(),
    statement: 'Sign in with Solana to the app.',
  });

  // 3) Sign the message in Phantom.
  onStage?.('sign');
  const { nonce: payloadNonce, data: payload } = encryptPayload(
    { message: bs58.encode(utf8Encode(message)), session, display: 'utf8' },
    sharedSecret,
  );
  await Linking.openURL(
    buildUrl('signMessage', {
      dapp_encryption_public_key: bs58.encode(dappKeyPair.publicKey),
      nonce: bs58.encode(payloadNonce),
      redirect_link: redirectLink,
      payload: bs58.encode(payload),
    }),
  );
  const signParams = await waitForRedirect();
  throwIfPhantomError(signParams);
  const { signature } = decryptPayload<{ signature: string }>(
    signParams.data,
    signParams.nonce,
    sharedSecret,
  );

  // 4) Verify → better-auth session (cookie persisted by the expo plugin).
  onStage?.('verify');
  const verify = await authClient.$fetch('/siws/verify', {
    method: 'POST',
    body: { address, message, signature },
  });
  if (verify.error) {
    throw new Error(verify.error.message ?? 'Wallet sign-in was rejected by the server.');
  }

  // /siws/* are plugin routes the react client doesn't know — poke the
  // session store so useSession() refetches and the redirect fires.
  (authClient as unknown as { $store: { notify: (s: string) => void } }).$store.notify(
    '$sessionSignal',
  );
}
