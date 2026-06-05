'use client';

// Domain-specific PRF salt — changing this invalidates all existing PRF-derived keys.
const PRF_SALT = new TextEncoder().encode('Watchparty:WalletPRF:v1');

class PRFManager {
  private aesKey: CryptoKey | null = null;
  // null = untested, true/false = result of last attempt
  private supported: boolean | null = null;

  /** Returns true if the browser API surface exists (doesn't guarantee authenticator support). */
  canAttempt(): boolean {
    return (
      typeof window !== 'undefined' &&
      'credentials' in navigator &&
      'PublicKeyCredential' in window
    );
  }

  /**
   * Triggers a WebAuthn assertion with the PRF extension to derive a stable
   * 32-byte secret bound to the user's passkey hardware. The result is imported
   * as an AES-256-GCM key and cached in memory for the session.
   *
   * Returns null if:
   * - Browser/authenticator doesn't support PRF
   * - User cancels the WebAuthn prompt
   * - No registered passkey exists for this origin
   */
  async derive(): Promise<CryptoKey | null> {
    if (this.aesKey) return this.aesKey;
    if (!this.canAttempt()) return null;

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));

      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge,
          userVerification: 'required',
          extensions: {
            prf: { eval: { first: PRF_SALT.buffer } },
          } as any,
        },
      })) as PublicKeyCredential | null;

      if (!assertion) return null;

      const results = (assertion as any).getClientExtensionResults?.() ?? {};
      const prfResult: ArrayBuffer | undefined = results?.prf?.results?.first;

      if (!prfResult) {
        this.supported = false;
        return null;
      }

      this.supported = true;
      this.aesKey = await crypto.subtle.importKey(
        'raw',
        prfResult,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );

      return this.aesKey;
    } catch {
      return null;
    }
  }

  /** Returns the cached AES key without triggering a WebAuthn prompt. */
  getKey(): CryptoKey | null {
    return this.aesKey;
  }

  isSupported(): boolean | null {
    return this.supported;
  }

  /** Call on logout to wipe the in-memory key. */
  clear(): void {
    this.aesKey = null;
  }
}

export const prfManager = new PRFManager();
