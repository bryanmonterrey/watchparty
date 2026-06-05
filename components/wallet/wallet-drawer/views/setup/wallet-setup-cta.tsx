'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';
import { storeFrostClientShare } from '@/lib/frost/frost-storage';
import SeedPhraseDisplay from '@/components/wallet/seed-phrase-display';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';

type Step = 'cta' | 'generating' | 'seed_phrase';

export function WalletSetupCta() {
    const [step, setStep] = useState<Step>('cta');
    const [mnemonic, setMnemonic] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const queryClient = useQueryClient();
    const router = useRouter();

    const handleCreate = useCallback(async () => {
        try {
            setStep('generating');
            setError(null);

            const response = await fetch('/api/create-wallet', { method: 'POST' });
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
    }, []);

    const handlePhraseConfirmed = useCallback(async () => {
        // Close the dialog first, then force a synchronous refetch so the drawer
        // receives the updated walletAddress before it re-renders.
        setStep('cta');
        await queryClient.refetchQueries({ queryKey: ['session'] });
        router.refresh();
    }, [queryClient, router]);

    return (
        <>
            {/* CTA always rendered in the drawer */}
            <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 pb-8">
                <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center">
                    <svg className="w-8 h-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6m18 0V5.25A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25V6" />
                    </svg>
                </div>

                <div className="text-center space-y-1.5">
                    <p className="text-[17px] font-semibold text-white">No wallet yet</p>
                    <p className="text-[13px] text-zinc-500 leading-relaxed max-w-[240px]">
                        Generate a Solana wallet to send, receive, and swap tokens.
                    </p>
                </div>

                {error && (
                    <p className="text-[13px] text-red-400 text-center">{error}</p>
                )}

                <button
                    onClick={handleCreate}
                    disabled={step === 'generating'}
                    className="cursor-pointer w-full py-4 rounded-full bg-white text-black font-semibold text-[15px] hover:bg-zinc-100 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {step === 'generating' ? (
                        <>
                            <span className="w-4 h-4 rounded-full border-2 border-zinc-400 border-t-black animate-spin" />
                            Creating...
                        </>
                    ) : 'Generate Wallet'}
                </button>
            </div>

            {/* Seed phrase shown in a full dialog on top */}
            <Dialog open={step === 'seed_phrase' && !!mnemonic} onOpenChange={() => {}}>
                <DialogContent
                    className="sm:max-w-md rounded-4xl"
                    showCloseButton={false}
                    onPointerDownOutside={e => e.preventDefault()}
                >
                    <DialogHeader>
                        <DialogTitle className="text-center text-white text-xl">
                            Save Your Recovery Phrase
                        </DialogTitle>
                        <DialogDescription className="text-center text-zinc-400">
                            Write down these 12 words in order. This is the only way to recover your wallet.
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
        </>
    );
}
