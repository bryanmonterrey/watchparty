'use client';

import { useEncryptionContext } from './encryption-provider';
import { WalletSetupCta } from '@/components/wallet/wallet-drawer/views/setup/wallet-setup-cta';

/**
 * Gates the messages UI on wallet setup. Messaging is end-to-end encrypted with
 * a key derived from the user's on-device wallet share, so without a wallet
 * there's no key to encrypt with — we prompt setup instead of falling back to a
 * server-readable key. Once the wallet exists, `retry()` re-runs key init.
 */
export function EncryptionGate({ children }: { children: React.ReactNode }) {
    const { needsWallet, retry } = useEncryptionContext();

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

            <div className="w-full max-w-[320px]">
                <WalletSetupCta />
            </div>

            <button
                onClick={retry}
                className="cursor-pointer text-[13px] font-medium text-zinc-400 underline-offset-4 hover:text-white hover:underline"
            >
                I&apos;ve connected my wallet
            </button>
        </div>
    );
}
