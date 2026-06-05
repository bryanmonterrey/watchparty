'use client';

import { Keypair, VersionedTransaction, Transaction } from '@solana/web3.js';
import { keyStorage } from '@/lib/encryption/key-storage';
import { prfManager } from '@/lib/prf/prf-manager';

/**
 * Reconstruct the wallet keypair from d1 (server) + d2 (IndexedDB).
 * Returns null if d2 is not in IndexedDB (user needs device recovery flow).
 */
export async function getWalletKeypair(
  userId: string,
  d1Base64: string
): Promise<Keypair | null> {
  const prfKey = prfManager.getKey() ?? await prfManager.derive().catch(() => null);
  if (!prfKey) return null;

  const d2 = await keyStorage.getWalletShare(userId, prfKey);
  if (!d2) return null;

  const d1 = Buffer.from(d1Base64, 'base64');
  if (d1.length !== d2.length) return null;

  const privateKey = new Uint8Array(d1.length);
  for (let i = 0; i < d1.length; i++) {
    privateKey[i] = d1[i] ^ d2[i];
  }

  return Keypair.fromSecretKey(privateKey);
}

/**
 * Sign a base64-encoded partial transaction (versioned or legacy) with the
 * reconstructed keypair and return it as base64.
 */
export async function signTransaction(
  keypair: Keypair,
  transactionBase64: string
): Promise<string> {
  const txBytes = Buffer.from(transactionBase64, 'base64');

  try {
    const tx = VersionedTransaction.deserialize(txBytes);
    tx.sign([keypair]);
    return Buffer.from(tx.serialize()).toString('base64');
  } catch {
    // Fall back to legacy Transaction
    const tx = Transaction.from(txBytes);
    tx.partialSign(keypair);
    return tx.serialize({ requireAllSignatures: false }).toString('base64');
  }
}
