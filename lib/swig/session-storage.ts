'use client';

import { Keypair } from '@solana/web3.js';

const DB_NAME = 'watchparty_swig';
const DB_VERSION = 1;
const STORE = 'sessions';

interface StoredSession {
    userId: string;
    swigAddress: string;
    /** base64-encoded 64-byte session secret key */
    sessionPrivateKey: string;
    /** base58 treasury pubkey — set as fee payer so users pay zero gas */
    treasuryPubkey: string;
    createdAtSlot: number;
    durationSlots: number;
    storedAt: number;
}

class SwigSessionStorage {
    private db: IDBDatabase | null = null;

    private async init(): Promise<void> {
        if (this.db) return;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => { this.db = req.result; resolve(); };
            req.onupgradeneeded = (e) => {
                (e.target as IDBOpenDBRequest).result.createObjectStore(STORE, { keyPath: 'userId' });
            };
        });
    }

    async store(userId: string, session: Omit<StoredSession, 'userId' | 'storedAt'>): Promise<void> {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).put({ ...session, userId, storedAt: Date.now() });
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async get(userId: string): Promise<StoredSession | null> {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(userId);
            req.onsuccess = () => resolve((req.result as StoredSession) ?? null);
            req.onerror = () => reject(req.error);
        });
    }

    async delete(userId: string): Promise<void> {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).delete(userId);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }
}

export const swigSessionStorage = new SwigSessionStorage();

export interface ActiveSession {
    keypair: Keypair;
    swigAddress: string;
    treasuryPubkey: string;
    expiresAtSlot: number;
}

/**
 * Retrieve a valid session keypair from IndexedDB.
 * Returns null if no session exists or it has expired.
 * currentSlot is used to check expiry; pass 0 to skip the check.
 */
export async function getActiveSession(
    userId: string,
    currentSlot: number
): Promise<ActiveSession | null> {
    const stored = await swigSessionStorage.get(userId);
    if (!stored) return null;

    const expiresAtSlot = stored.createdAtSlot + stored.durationSlots;
    // Give a 100-slot buffer before expiry to avoid races
    if (currentSlot > 0 && currentSlot >= expiresAtSlot - 100) return null;

    const secretKey = Buffer.from(stored.sessionPrivateKey, 'base64');
    return {
        keypair: Keypair.fromSecretKey(secretKey),
        swigAddress: stored.swigAddress,
        treasuryPubkey: stored.treasuryPubkey,
        expiresAtSlot,
    };
}

export async function storeSession(
    userId: string,
    swigAddress: string,
    sessionPrivateKey: string,
    treasuryPubkey: string,
    createdAtSlot: number,
    durationSlots: number
): Promise<void> {
    await swigSessionStorage.store(userId, {
        swigAddress,
        sessionPrivateKey,
        treasuryPubkey,
        createdAtSlot,
        durationSlots,
    });
}

export async function clearSession(userId: string): Promise<void> {
    await swigSessionStorage.delete(userId);
}
