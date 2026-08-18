'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { storeFrostClientShare } from '@/lib/frost/frost-storage';
import SeedPhraseDisplay from '@/components/wallet/seed-phrase-display';
import { HugeiconsIcon } from '@hugeicons/react';
import { Wallet01Icon } from '@hugeicons/core-free-icons';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { useTurnstile } from '@/components/ui/turnstile';

type Step = 'cta' | 'generating' | 'seed_phrase';

// `variant="drawer"` (default) is the wallet drawer's full empty state;
// `variant="inline"` renders ONLY the create button (+ error + seed dialog)
// so other surfaces (messages encryption gate) can compose their own copy.
export function WalletSetupCta({
    variant = 'drawer',
    onCreated,
}: {
    variant?: 'drawer' | 'inline';
    /** Fired once the phrase is confirmed and the wallet is usable. Lets a
     *  host surface CONTINUE what the user was doing instead of dead-ending —
     *  the buy dialog resumes its purchase rather than sending them away. */
    onCreated?: () => void;
} = {}) {
    const [step, setStep] = useState<Step>('cta');
    const [mnemonic, setMnemonic] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const queryClient = useQueryClient();
    const router = useRouter();
    const { getToken, widget: turnstileWidget, challenging } = useTurnstile();

    const handleCreate = useCallback(async () => {
        try {
            setStep('generating');
            setError(null);

            // Solved before the request, not shown before the click: the widget
            // is invisible and only surfaces a challenge if Cloudflare wants
            // one. A null token still goes — the server is what decides.
            const turnstileToken = await getToken();

            const response = await fetch('/api/create-wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ turnstileToken }),
            });
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Failed to create wallet');
            }
            const data = await response.json();

            const { data: session } = await authClient.getSession();
            const userId = session?.user?.id;

            if (data.clientShare && data.publicInfo && userId) {
                await storeFrostClientShare(userId, data.clientShare, data.publicInfo).catch(
                    (e: unknown) => console.warn('FROST client share storage failed (non-fatal):', e)
                );
            }

            setMnemonic(data.mnemonic);
            setStep('seed_phrase');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create wallet');
            setStep('cta');
        }
    }, [getToken]);

    const handlePhraseConfirmed = useCallback(async () => {
        // Close the dialog first, then force a synchronous refetch so the drawer
        // receives the updated walletAddress before it re-renders.
        setStep('cta');
        await queryClient.refetchQueries({ queryKey: ['session'] });
        router.refresh();
        // After the session is live, so a host refetching balances sees the new
        // addresses rather than racing the refresh it depends on.
        onCreated?.();
    }, [queryClient, router, onCreated]);

    const seedDialog = (
        <Dialog open={step === 'seed_phrase' && !!mnemonic} onOpenChange={() => {}}>
            <DialogContent
                className="sm:max-w-md rounded-4xl"
                showCloseButton={false}
                onPointerDownOutside={e => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="text-center text-[20px] font-bold tracking-tight text-white">
                        Save your recovery phrase
                    </DialogTitle>
                    <DialogDescription className="text-center text-13 font-medium text-zinc-500">
                        12 words, in order — the only way to recover this wallet.
                    </DialogDescription>
                </DialogHeader>
                {mnemonic && (
                    <SeedPhraseDisplay
                        mnemonic={mnemonic}
                        onConfirm={handlePhraseConfirmed}
                        showConfirmation={true}
                    />
                )}
            </DialogContent>
        </Dialog>
    );

    if (variant === 'inline') {
        return (
            <>
                <button
                    onClick={handleCreate}
                    disabled={step === 'generating'}
                    className="flex h-18 w-full cursor-pointer items-center justify-center gap-2.5 rounded-full bg-white/5 text-15 font-bold text-zinc-200 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {step === 'generating' ? (
                        <>
                            <span className="size-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                            {challenging ? 'Checking you’re human…' : 'Creating your wallet…'}
                        </>
                    ) : 'Create a new wallet'}
                </button>
                {error && (
                    <p className="text-center text-13 font-medium text-pastelred">{error}</p>
                )}
                {turnstileWidget}
                {seedDialog}
            </>
        );
    }

    return (
        <>
            {/* CTA always rendered in the drawer */}
            <div className="flex flex-1 flex-col px-5 pb-6">
                <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
                    <div className="grid size-16 place-items-center rounded-full bg-white/5">
                        <HugeiconsIcon icon={Wallet01Icon} className="size-7 text-zinc-400" strokeWidth={1.8} />
                    </div>

                    <div className="space-y-1.5">
                        <p className="text-[20px] font-bold tracking-tight text-white">No wallet yet</p>
                        <p className="max-w-[250px] text-13 font-medium leading-relaxed text-zinc-500">
                            Create a Solana wallet to send, receive, and swap tokens right from the app.
                        </p>
                    </div>

                    {error && (
                        <p className="text-center text-13 font-medium text-pastelred">{error}</p>
                    )}
                </div>

                <button
                    onClick={handleCreate}
                    disabled={step === 'generating'}
                    className="mb-4 mt-8 flex h-18 w-full cursor-pointer items-center justify-center gap-2.5 rounded-full bg-white text-16 font-bold text-black transition-transform hover:bg-white/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
>
                    {step === 'generating' ? (
                        <>
                            <span className="size-4 animate-spin rounded-full border-2 border-black/25 border-t-black" />
                            {challenging ? 'Checking you’re human…' : 'Creating your wallet…'}
                        </>
                    ) : 'Create wallet'}
                </button>
            </div>

            {turnstileWidget}

            {/* Seed phrase shown in a full dialog on top */}
            {seedDialog}
        </>
    );
}
