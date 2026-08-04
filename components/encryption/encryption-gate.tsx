'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { HugeiconsIcon } from '@hugeicons/react';
import { SquareLock02Icon } from '@hugeicons/core-free-icons';
import { useEncryptionContext } from './encryption-provider';
import { useAuthSession } from '@/hooks/use-auth-session';
import { WalletSetupCta } from '@/components/wallet/wallet-drawer/views/setup/wallet-setup-cta';

// Same lazy-mount pattern as WalletButton: the connect modal is heavy and only
// needed on click, so it stays out of the messages bundle until then.
const WalletConnectModal = dynamic(
    () => import('@/components/wallet/wallet-connect-modal').then((m) => ({ default: m.WalletConnectModal })),
    { ssr: false },
);

/**
 * Gates the messages UI on wallet setup. Messaging is end-to-end encrypted with
 * a key derived from the user's on-device wallet share, so without a wallet
 * there's no key to encrypt with — we prompt setup instead of falling back to a
 * server-readable key.
 *
 * Extension-wallet users land here whenever the page's wallet adapter isn't
 * connected (being signed in ≠ adapter connected): "Connect wallet" opens the
 * standard connect modal, and the EncryptionProvider re-runs key init on its
 * own once the adapter reports a publicKey (it's in the init effect's deps) —
 * deriving the messaging key from a one-time signature. Embedded-wallet users
 * use the inline create flow, then `retry()`.
 */
export function EncryptionGate({ children }: { children: React.ReactNode }) {
    const { needsWallet, retry } = useEncryptionContext();
    const { data: session } = useAuthSession();
    const [modalReady, setModalReady] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);

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
                            <button
                                onClick={() => {
                                    setModalReady(true);
                                    setModalOpen(true);
                                }}
                                className="h-18 w-full cursor-pointer rounded-full bg-white text-[16px] font-bold text-black transition-transform hover:bg-white/90 active:scale-[0.98]"
                            >
                                Connect wallet
                            </button>
                            <WalletSetupCta variant="inline" />
                        </>
                    ) : (
                        <>
                            <WalletSetupCta variant="inline" />
                            <button
                                onClick={() => {
                                    setModalReady(true);
                                    setModalOpen(true);
                                }}
                                className="h-11 w-full cursor-pointer rounded-full text-[13px] font-semibold text-zinc-500 transition-colors hover:text-white"
                            >
                                Connect an existing wallet instead
                            </button>
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

            {modalReady && <WalletConnectModal open={modalOpen} onOpenChange={setModalOpen} />}
        </div>
    );
}
