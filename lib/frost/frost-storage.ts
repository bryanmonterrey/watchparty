'use client';

import type { FrostShare, FrostPublicInfo } from './types';

const DB_NAME = 'watchparty_frost';
const DB_VERSION = 1;
const STORE = 'shares';

interface StoredFrostData {
    userId: string;
    clientShare: FrostShare;
    publicInfo: FrostPublicInfo;
}

class FrostStorage {
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

    async store(userId: string, clientShare: FrostShare, publicInfo: FrostPublicInfo): Promise<void> {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE, 'readwrite');
            const req = tx.objectStore(STORE).put({ userId, clientShare, publicInfo });
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async get(userId: string): Promise<StoredFrostData | null> {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(userId);
            req.onsuccess = () => resolve((req.result as StoredFrostData) ?? null);
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

export const frostStorage = new FrostStorage();

export async function storeFrostClientShare(
    userId: string,
    clientShare: FrostShare,
    publicInfo: FrostPublicInfo,
): Promise<void> {
    await frostStorage.store(userId, clientShare, publicInfo);
}

export async function getFrostClientData(
    userId: string,
): Promise<{ clientShare: FrostShare; publicInfo: FrostPublicInfo } | null> {
    const data = await frostStorage.get(userId);
    if (!data) return null;
    return { clientShare: data.clientShare, publicInfo: data.publicInfo };
}

export async function clearFrostClientShare(userId: string): Promise<void> {
    await frostStorage.delete(userId);
}
