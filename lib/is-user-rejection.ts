// True when an error is the user cancelling/rejecting (rejecting a signature,
// closing the wallet popup, dismissing the passkey prompt) — i.e. NOT a real
// failure, so the UI should quietly return instead of showing an error.
export function isUserRejection(e: unknown): boolean {
  const err = e as { code?: unknown; cause?: { code?: unknown }; name?: string } | null;
  const code = err?.code ?? err?.cause?.code;
  if (code === 4001 || code === "ACTION_REJECTED") return true; // EIP-1193 / ethers
  if (err?.name === "NotAllowedError" || err?.name === "AbortError") return true; // WebAuthn cancel
  const msg = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  return /reject|denied|declined|cancel|user closed|closed the|not allowed|abort/.test(msg);
}
