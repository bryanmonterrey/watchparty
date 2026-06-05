// Ensures the Uint8Array's underlying buffer is a plain ArrayBuffer (not SharedArrayBuffer),
// which is required by the Web Crypto API's BufferSource type.
const toArrayBuffer = (u: Uint8Array): ArrayBuffer =>
    u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

const DB_NAME = 'watchparty_encryption';
const DB_VERSION = 2;
const KEYS_STORE = 'encryption_keys';
const SHARES_STORE = 'wallet_shares';

export interface StoredKeyPair {
  userId: string;
  publicKey: string;
  /** Plaintext base64 when encryptionIv is absent; AES-GCM ciphertext base64 when present. */
  privateKey: string;
  encryptionIv?: string;
  createdAt: number;
  version: number;
}

interface StoredWalletShare {
  userId: string;
  encryptedShare: string; // base64 AES-GCM ciphertext
  iv: string;             // base64
  createdAt: number;
}

export class KeyStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        const oldVersion = event.oldVersion;

        if (oldVersion < 1) {
          const store = db.createObjectStore(KEYS_STORE, { keyPath: 'userId' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(SHARES_STORE)) {
            db.createObjectStore(SHARES_STORE, { keyPath: 'userId' });
          }
        }
      };
    });
  }

  // ─── E2E Key Pair ────────────────────────────────────────────────────────────

  /** Store key pair. If encryptionKey is provided the private key is AES-GCM encrypted first. */
  async storeKeyPair(
    userId: string,
    keyPair: { publicKey: string; privateKey: string },
    encryptionKey?: CryptoKey
  ): Promise<void> {
    await this.init();

    let storedPrivateKey = keyPair.privateKey;
    let encryptionIv: string | undefined;

    if (encryptionKey) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        toArrayBuffer(new TextEncoder().encode(keyPair.privateKey))
      );
      storedPrivateKey = Buffer.from(encrypted).toString('base64');
      encryptionIv = Buffer.from(iv).toString('base64');
    }

    const record: StoredKeyPair = {
      userId,
      publicKey: keyPair.publicKey,
      privateKey: storedPrivateKey,
      encryptionIv,
      createdAt: Date.now(),
      version: 1,
    };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([KEYS_STORE], 'readwrite');
      const req = tx.objectStore(KEYS_STORE).put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Retrieve a key pair. If encryptionKey is provided it decrypts the private key.
   * Returns null if not found or decryption fails (e.g. wrong key).
   */
  async getKeyPair(
    userId: string,
    encryptionKey?: CryptoKey
  ): Promise<StoredKeyPair | null> {
    await this.init();

    const record = await new Promise<StoredKeyPair | null>((resolve, reject) => {
      const tx = this.db!.transaction([KEYS_STORE], 'readonly');
      const req = tx.objectStore(KEYS_STORE).get(userId);
      req.onsuccess = () => resolve((req.result as StoredKeyPair) ?? null);
      req.onerror = () => reject(req.error);
    });

    if (!record) return null;

    if (record.encryptionIv && encryptionKey) {
      try {
        const iv = toArrayBuffer(Buffer.from(record.encryptionIv, 'base64'));
        const ciphertext = toArrayBuffer(Buffer.from(record.privateKey, 'base64'));
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          encryptionKey,
          ciphertext
        );
        return { ...record, privateKey: new TextDecoder().decode(decrypted) };
      } catch {
        return null;
      }
    }

    return record;
  }

  async deleteKeyPair(userId: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([KEYS_STORE], 'readwrite');
      const req = tx.objectStore(KEYS_STORE).delete(userId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async hasKeyPair(userId: string): Promise<boolean> {
    return (await this.getKeyPair(userId)) !== null;
  }

  // ─── Wallet Share (d2) ───────────────────────────────────────────────────────

  /** Store the d2 wallet share encrypted with the PRF-derived AES key. */
  async storeWalletShare(
    userId: string,
    share: Uint8Array,
    encryptionKey: CryptoKey
  ): Promise<void> {
    await this.init();

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      encryptionKey,
      toArrayBuffer(share)
    );

    const record: StoredWalletShare = {
      userId,
      encryptedShare: Buffer.from(encrypted).toString('base64'),
      iv: Buffer.from(iv).toString('base64'),
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([SHARES_STORE], 'readwrite');
      const req = tx.objectStore(SHARES_STORE).put(record);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /** Retrieve and decrypt the d2 wallet share. Returns null if not found or wrong key. */
  async getWalletShare(
    userId: string,
    encryptionKey: CryptoKey
  ): Promise<Uint8Array | null> {
    await this.init();

    const record = await new Promise<StoredWalletShare | null>((resolve, reject) => {
      const tx = this.db!.transaction([SHARES_STORE], 'readonly');
      const req = tx.objectStore(SHARES_STORE).get(userId);
      req.onsuccess = () => resolve((req.result as StoredWalletShare) ?? null);
      req.onerror = () => reject(req.error);
    });

    if (!record) return null;

    try {
      const iv = toArrayBuffer(Buffer.from(record.iv, 'base64'));
      const ciphertext = toArrayBuffer(Buffer.from(record.encryptedShare, 'base64'));
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        encryptionKey,
        ciphertext
      );
      return new Uint8Array(decrypted);
    } catch {
      return null;
    }
  }

  /** Check if a d2 share record exists in IndexedDB (no decryption, no PRF needed). */
  async hasWalletShare(userId: string): Promise<boolean> {
    await this.init();
    return new Promise((resolve) => {
      const tx = this.db!.transaction([SHARES_STORE], 'readonly');
      const req = tx.objectStore(SHARES_STORE).count(userId);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => resolve(false);
    });
  }

  async deleteWalletShare(userId: string): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([SHARES_STORE], 'readwrite');
      const req = tx.objectStore(SHARES_STORE).delete(userId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async clearAll(): Promise<void> {
    await this.init();
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction([KEYS_STORE], 'readwrite');
        const req = tx.objectStore(KEYS_STORE).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
      new Promise<void>((resolve, reject) => {
        const tx = this.db!.transaction([SHARES_STORE], 'readwrite');
        const req = tx.objectStore(SHARES_STORE).clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      }),
    ]);
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const keyStorage = new KeyStorage();
