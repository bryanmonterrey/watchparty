/**
 * Crypto Manager - ECDH + AES-GCM Encryption
 * 
 * Provides end-to-end encryption for messages using:
 * - ECDH P-256 for key exchange
 * - AES-GCM-256 for message encryption
 * - IndexedDB for secure key storage
 */

export interface EncryptedMessage {
    ciphertext: string; // Base64 encoded
    iv: string; // Base64 encoded
}

export class CryptoManager {
    private keyPairs: Map<string, CryptoKeyPair> = new Map();
    private sharedKeys: Map<string, CryptoKey> = new Map();

    /**
     * Generate ECDH P-256 key pair
     */
    async generateKeyPair(): Promise<CryptoKeyPair> {
        return await window.crypto.subtle.generateKey(
            {
                name: 'ECDH',
                namedCurve: 'P-256',
            },
            true, // extractable
            ['deriveKey']
        );
    }

    /**
     * Export public key to base64 string
     */
    async exportPublicKey(publicKey: CryptoKey): Promise<string> {
        const exported = await window.crypto.subtle.exportKey('raw', publicKey);
        return this.arrayBufferToBase64(exported);
    }

    /**
     * Import public key from base64 string
     */
    async importPublicKey(publicKeyString: string): Promise<CryptoKey> {
        const keyData = this.base64ToArrayBuffer(publicKeyString);

        return await window.crypto.subtle.importKey(
            'raw',
            keyData,
            {
                name: 'ECDH',
                namedCurve: 'P-256',
            },
            false,
            []
        );
    }

    /**
     * Export private key to base64 string (for IndexedDB storage)
     */
    async exportPrivateKey(privateKey: CryptoKey): Promise<string> {
        const exported = await window.crypto.subtle.exportKey('pkcs8', privateKey);
        return this.arrayBufferToBase64(exported);
    }

    /**
     * Import private key from base64 string
     */
    async importPrivateKey(privateKeyString: string): Promise<CryptoKey> {
        const keyData = this.base64ToArrayBuffer(privateKeyString);

        return await window.crypto.subtle.importKey(
            'pkcs8',
            keyData,
            {
                name: 'ECDH',
                namedCurve: 'P-256',
            },
            true,
            ['deriveKey']
        );
    }

    /**
     * Derive shared AES-GCM key from ECDH
     */
    async deriveSharedKey(
        privateKey: CryptoKey,
        publicKey: CryptoKey
    ): Promise<CryptoKey> {
        return await window.crypto.subtle.deriveKey(
            {
                name: 'ECDH',
                public: publicKey,
            },
            privateKey,
            {
                name: 'AES-GCM',
                length: 256,
            },
            false, // not extractable (more secure)
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Export key pair to base64 strings
     */
    async exportKeyPair(keyPair: CryptoKeyPair): Promise<{ publicKey: string; privateKey: string }> {
        const publicKey = await this.exportPublicKey(keyPair.publicKey);
        const privateKey = await this.exportPrivateKey(keyPair.privateKey);
        return { publicKey, privateKey };
    }

    /**
     * Import key pair from base64 strings
     */
    async importKeyPair(publicKeyString: string, privateKeyString: string): Promise<CryptoKeyPair> {
        const publicKey = await this.importPublicKey(publicKeyString);
        const privateKey = await this.importPrivateKey(privateKeyString);
        return { publicKey, privateKey };
    }

    /**
     * Encrypt message with AES-GCM
     */
    async encryptMessage(
        text: string,
        sharedKey: CryptoKey
    ): Promise<EncryptedMessage> {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);

        // Generate random IV (12 bytes for GCM)
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const ciphertext = await window.crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv,
            },
            sharedKey,
            data as any
        );

        return {
            ciphertext: this.arrayBufferToBase64(ciphertext),
            iv: this.arrayBufferToBase64(iv.buffer),
        };
    }

    /**
     * Decrypt message with AES-GCM
     */
    async decryptMessage(
        ciphertext: string,
        iv: string,
        sharedKey: CryptoKey
    ): Promise<string> {
        const ciphertextBytes = this.base64ToArrayBuffer(ciphertext);
        const ivBytes = this.base64ToArrayBuffer(iv);

        if (ivBytes.byteLength !== 12) {
            throw new Error(`Invalid IV length: ${ivBytes.byteLength} (expected 12)`);
        }

        const decrypted = await window.crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: ivBytes,
            },
            sharedKey,
            ciphertextBytes
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }

    /**
     * Get or create key pair for user
     */
    async getOrCreateKeyPair(userId: string): Promise<CryptoKeyPair> {
        if (!this.keyPairs.has(userId)) {
            const keyPair = await this.generateKeyPair();
            this.keyPairs.set(userId, keyPair);
        }
        return this.keyPairs.get(userId)!;
    }

    /**
     * Get or create shared key for conversation
     */
    async getOrCreateSharedKey(
        myUserId: string,
        theirUserId: string,
        myPrivateKey: CryptoKey,
        theirPublicKey: CryptoKey
    ): Promise<CryptoKey> {
        // Create deterministic key ID (sorted to ensure consistency)
        const keyId = [myUserId, theirUserId].sort().join('-');

        if (!this.sharedKeys.has(keyId)) {
            const sharedKey = await this.deriveSharedKey(myPrivateKey, theirPublicKey);
            this.sharedKeys.set(keyId, sharedKey);
        }

        return this.sharedKeys.get(keyId)!;
    }

    /**
     * Clear all cached keys (call on logout)
     */
    clearKeys(): void {
        this.keyPairs.clear();
        this.sharedKeys.clear();
    }

    // Utility functions
    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    private base64ToArrayBuffer(base64: string): ArrayBuffer {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

// Singleton instance
export const cryptoManager = new CryptoManager();
