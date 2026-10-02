'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import { SquareLock02Icon } from '@hugeicons/core-free-icons';
import { useEncryptionContext } from './encryption-provider';
import { useAuthSession } from '@/hooks/use-auth-session';
// drawer2's CTA, not the old drawer's: the old one POSTs /api/create-wallet
// with no turnstile token, which 403s wherever TURNSTILE_SECRET_KEY is set —
// i.e. the gate's primary button was dead in prod.
import { WalletSetupCta } from '@/components/wallet/wallet-drawer2/views/setup/wallet-setup-cta';

// "Connect wallet" is a LINK to /login, not a dialog (2026-10-02: no sign-in
// dialog anywhere). ?add=1 keeps /login from bouncing an already signed-in
// visitor straight back; signing there with the wallet on file lands on the
// same account with the adapter connected, and callbackUrl returns here.
const CONNECT_HREF = '/login?add=1&callbackUrl=%2Fmessages';

/**
 * Gates the messages UI on wallet setup. Messaging is end-to-end encrypted with
 * a key derived from the user's on-device wallet share, so without a wallet
 * there's no key to encrypt with — we prompt setup instead of falling back to a
 * server-readable key.
 *
 * Extension-wallet users land here whenever the page's wallet adapter isn't
 * connected (being signed in ≠ adapter connected): "Connect wallet" goes to the
 * login page's wallet step, and the EncryptionProvider re-runs key init on its
 * own once the adapter reports a publicKey (it's in the init effect's deps) —
 * deriving the messaging key from a one-time signature. Embedded-wallet users
 * use the inline create flow, then `retry()`.
 */
export function EncryptionGate({ children }: { children: React.ReactNode }) {
    const { needsWallet, retry } = useEncryptionContext();
    const { data: session } = useAuthSession();

    if (!needsWallet) return <>{children}</>;

    // Which action can actually work here depends on what the account HAS.
    // With no wallet at all, "Connect wallet" opens an extension picker the
    // user has nothing to pick from — setup is the only route forward, so it
    // leads. With a wallet on file they're an extension user whose adapter
    // simply isn't connected, and connecting is right.
    const hasWallet = Boolean(session?.user?.wallet_address);

    return (
        <div className="flex h-svh w-full items-center justify-center px-6">
            <div className="flex w-full max-w-[380px] flex-col items-center gap-8 text-center">
                <div className="grid size-16 place-items-center rounded-full bg-white/5">
                    <HugeiconsIcon icon={SquareLock02Icon} className="size-7 text-zinc-400" strokeWidth={1.8} />
                </div>

                <div className="space-y-2">
                    <h2 className="text-[22px] font-bold tracking-tight text-white">Unlock your messages</h2>
                    <p className="text-[13px] font-medium leading-relaxed text-zinc-500">
                        {hasWallet
                            ? "Messages on watchparty are end-to-end encrypted — your wallet is the key. Connect it to start chatting, only you can read what's inside."
                            : "Messages on watchparty are end-to-end encrypted — your wallet is the key. Set one up to start chatting, only you can read what's inside."}
                    </p>
                </div>

                <div className="flex w-full flex-col gap-3">
                    {hasWallet ? (
                        <>
                            <a
                                href={CONNECT_HREF}
                                className="flex h-18 w-full cursor-pointer items-center justify-center rounded-full bg-white text-[16px] font-bold text-black transition-transform hover:bg-white/90 active:scale-[0.98]"
                            >
                                Connect wallet
                            </a>
                            <WalletSetupCta variant="inline" />
                        </>
                    ) : (
                        <>
                            <WalletSetupCta variant="inline" />
                            <a
                                href={CONNECT_HREF}
                                className="flex h-11 w-full cursor-pointer items-center justify-center rounded-full text-[13px] font-semibold text-zinc-500 transition-colors hover:text-white"
                            >
                                Connect an existing wallet instead
                            </a>
                        </>
                    )}
                </div>

                <button
                    onClick={retry}
                    className="cursor-pointer rounded-full px-4 py-2 text-[13px] font-semibold text-zinc-500 transition-colors hover:text-white"
                >
                    I&apos;ve already connected
                </button>
            </div>
        </div>
    );
}
