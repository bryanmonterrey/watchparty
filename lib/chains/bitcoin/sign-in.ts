"use client";

import { useEffect, useState } from "react";
import { getWallets } from "@wallet-standard/app";

const AUTH_URL =
  process.env.NEXT_PUBLIC_AUTH_URL ??
  (typeof window !== "undefined" ? `${window.location.origin}/api/auth` : "http://localhost:3001/api/auth");

const STATEMENT = "Sign in to Watchparty.";

export interface BtcWallet {
  name: string;
  icon?: string;
  // connect() returns the address + a signer that returns a base64 BIP-322 signature.
  connect: () => Promise<{ address: string; sign: (message: string) => Promise<string> }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toBase64(sig: any): string {
  if (typeof sig === "string") return sig;
  if (sig?.signature) return toBase64(sig.signature);
  try {
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
  } catch {
    return String(sig);
  }
}

// Auto-detect Bitcoin wallets: Wallet Standard wallets exposing the
// `bitcoin:signMessage` feature (Xverse, Magic Eden, Phantom, MetaMask…),
// plus UniSat (which injects window.unisat instead of registering).
export function getBitcoinWallets(): BtcWallet[] {
  const out: BtcWallet[] = [];
  try {
    for (const w of getWallets().get()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const features = w.features as any;
      const signFeature = features["bitcoin:signMessage"];
      const connectFeature = features["bitcoin:connect"] ?? features["standard:connect"];
      if (signFeature && connectFeature) {
        out.push({
          name: w.name,
          icon: w.icon,
          connect: async () => {
            const { accounts } = await connectFeature.connect();
            const account = accounts[0];
            const address = account.address ?? account.publicKey;
            return {
              address,
              sign: async (message: string) => toBase64(await signFeature.signMessage({ account, message })),
            };
          },
        });
      }
    }
  } catch {
    /* registry not available */
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unisat = typeof window !== "undefined" ? (window as any).unisat : undefined;
  if (unisat && !out.some((w) => w.name.toLowerCase().includes("unisat"))) {
    out.push({
      name: "UniSat",
      connect: async () => {
        const accounts: string[] = await unisat.requestAccounts();
        const address = accounts[0];
        return { address, sign: (message: string) => unisat.signMessage(message, "bip322-simple") };
      },
    });
  }
  return out;
}

export function useBitcoinWallets(): BtcWallet[] {
  const [wallets, setWallets] = useState<BtcWallet[]>([]);
  useEffect(() => {
    const refresh = () => setWallets(getBitcoinWallets());
    refresh();
    let off: (() => void) | undefined;
    try {
      off = getWallets().on("register", refresh);
    } catch {
      /* ignore */
    }
    // UniSat may inject slightly after load.
    const t = setTimeout(refresh, 600);
    return () => {
      off?.();
      clearTimeout(t);
    };
  }, []);
  return wallets;
}

async function siwbNonce(address: string): Promise<string> {
  const res = await fetch(`${AUTH_URL}/siwb/nonce`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  if (!res.ok) throw new Error("Failed to start sign-in.");
  return (await res.json()).nonce;
}

export async function signInWithBitcoin(wallet: BtcWallet) {
  const { address, sign } = await wallet.connect();
  if (!address) throw new Error("No Bitcoin account selected.");
  const nonce = await siwbNonce(address);
  const message = `${STATEMENT}\n\nNonce: ${nonce}`;
  const signature = await sign(message);

  const res = await fetch(`${AUTH_URL}/siwb/verify`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, signature, address }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message ?? "Verification failed.");
  return data;
}
