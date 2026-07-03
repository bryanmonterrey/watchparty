'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useEncryptionContext } from './encryption-provider';
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
 * use the Generate flow below, then `retry()`.
 */
export function EncryptionGate({ children }: { children: React.ReactNode }) {
    const { needsWallet, retry } = useEncryptionContext();
    const [modalReady, setModalReady] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);

    if (!needsWallet) return <>{children}</>;

    return (
        <div className="flex h-screen w-full flex-col items-center justify-center gap-6 px-6 text-center">
            <div className="max-w-[320px] space-y-2">
                <h2 className="text-xl font-semibold text-white">Connect a wallet to message</h2>
                <p className="text-[13px] leading-relaxed text-zinc-500">
                    Your messages are end-to-end encrypted with your wallet key — only you can unlock
                    them. Connect your existing wallet, or create one below.
                </p>
            </div>

            <div className="flex w-full max-w-[320px] flex-col gap-4">
                <button
                    onClick={() => {
                        setModalReady(true);
                        setModalOpen(true);
                    }}
                    className="flex h-12 cursor-pointer items-center justify-center rounded-full bg-white text-[15px] font-semibold tracking-tight text-black transition-colors hover:bg-white/90"
                >
                    Connect wallet
                </button>

                <WalletSetupCta />
            </div>

            <button
                onClick={retry}
                className="cursor-pointer text-[13px] font-medium text-zinc-400 underline-offset-4 hover:text-white hover:underline"
            >
                I&apos;ve connected my wallet
            </button>

            {modalReady && <WalletConnectModal open={modalOpen} onOpenChange={setModalOpen} />}
        </div>
    );
}
