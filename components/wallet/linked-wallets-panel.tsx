"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Add01Icon,
    CheckmarkCircle02Icon,
    Delete02Icon,
    Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/settings/ui";
import { trpc } from "@/lib/trpc/client";
import { appToast } from "@/components/app-ui/app-toast";
import SeedPhraseDisplay from "@/components/wallet/seed-phrase-display";
import { cn } from "@/lib/utils";

/**
 * Linked Solana wallets.
 *
 * Wallets are identified by LABEL and source, never by address — rendering
 * addresses in the UI is against house rules, and a label the user chose is
 * easier to tell apart than two base58 strings anyway.
 */
export function LinkedWalletsPanel() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.wallet.listLinkedWallets.useQuery();
    const [newMnemonic, setNewMnemonic] = React.useState<string | null>(null);

    const ensureEmbedded = trpc.wallet.ensureEmbedded.useMutation({
        onSuccess: (res) => {
            utils.wallet.listLinkedWallets.invalidate();
            if (res.created && res.mnemonic) {
                // Only moment this phrase is ever handed over unprompted —
                // make the user look at it before it's gone.
                setNewMnemonic(res.mnemonic);
            } else {
                appToast.success("wallet already set up");
            }
        },
        onError: (e) => appToast.error(e.message),
    });

    const setPrimary = trpc.wallet.setPrimaryWallet.useMutation({
        onSuccess: () => {
            utils.wallet.listLinkedWallets.invalidate();
            appToast.success("primary wallet updated");
        },
        onError: (e) => appToast.error(e.message),
    });

    const unlink = trpc.wallet.unlinkWallet.useMutation({
        onSuccess: () => {
            utils.wallet.listLinkedWallets.invalidate();
            appToast.success("wallet unlinked");
        },
        onError: (e) => appToast.error(e.message),
    });

    const wallets = data?.wallets ?? [];
    const max = data?.max ?? 15;
    const hasEmbedded = wallets.some((w) => w.source === "swig");

    if (newMnemonic) {
        return (
            <div className="space-y-4">
                <div>
                    <h2 className="text-[16px] font-bold tracking-tight text-white">
                        save your recovery phrase
                    </h2>
                    <p className="mt-1 text-[12px] font-medium text-zinc-500">
                        these 12 words are the only way to restore this wallet. we can&apos;t
                        recover them for you.
                    </p>
                </div>
                <SeedPhraseDisplay
                    mnemonic={newMnemonic}
                    onConfirm={() => setNewMnemonic(null)}
                />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-end justify-between gap-3">
                <div>
                    <h2 className="text-[16px] font-bold tracking-tight text-white">wallets</h2>
                    <p className="mt-1 text-[12px] font-medium text-zinc-500">
                        your watchparty wallet plus any you connect. the primary one is what
                        the app uses.
                    </p>
                </div>
                <span className="shrink-0 text-[12px] font-medium text-zinc-500">
                    {wallets.length} / {max}
                </span>
            </div>

            {isLoading ? (
                <div className="flex flex-col gap-3">
                    {[0, 1].map((i) => (
                        <div key={i} className="h-[68px] overflow-hidden rounded-[24px]">
                            <div className="size-full shimmer-skeleton" />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="space-y-3">
                    {wallets.map((w) => {
                        const isEmbedded = w.source === "swig";
                        return (
                            <Panel key={w.id} className="flex items-center justify-between gap-3 p-4">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="rounded-full bg-white/5 p-2.5">
                                        <HugeiconsIcon
                                            icon={isEmbedded ? Wallet01Icon : Add01Icon}
                                            className="size-5 text-zinc-400"
                                            strokeWidth={2}
                                        />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="truncate text-[14px] font-semibold text-white">
                                                {w.label || (isEmbedded ? "watchparty wallet" : "connected wallet")}
                                            </h3>
                                            {w.isPrimary && (
                                                <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white">
                                                    <HugeiconsIcon
                                                        icon={CheckmarkCircle02Icon}
                                                        className="size-3"
                                                        strokeWidth={2.5}
                                                    />
                                                    primary
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-[12px] font-medium text-zinc-500">
                                            {isEmbedded ? "created by watchparty" : "connected by you"}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2">
                                    {!w.isPrimary && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="rounded-full bg-white/5 hover:bg-white/10"
                                            disabled={setPrimary.isPending}
                                            onClick={() => setPrimary.mutate({ address: w.address })}
                                        >
                                            make primary
                                        </Button>
                                    )}
                                    {/* The embedded wallet can't be unlinked — we hold its key
                                        material, so removing it would strand whatever it holds. */}
                                    {!isEmbedded && wallets.length > 1 && (
                                        <button
                                            aria-label="unlink wallet"
                                            disabled={unlink.isPending}
                                            onClick={() => unlink.mutate({ address: w.address })}
                                            className={cn(
                                                "flex size-9 cursor-pointer items-center justify-center rounded-full",
                                                "text-zinc-500 transition-colors hover:bg-pastelred/10 hover:text-pastelred"
                                            )}
                                        >
                                            <HugeiconsIcon icon={Delete02Icon} className="size-4" strokeWidth={2} />
                                        </button>
                                    )}
                                </div>
                            </Panel>
                        );
                    })}

                    {!hasEmbedded && (
                        <Panel className="flex items-center justify-between gap-3 p-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-full bg-white/5 p-2.5">
                                    <HugeiconsIcon icon={Wallet01Icon} className="size-5 text-zinc-400" strokeWidth={2} />
                                </div>
                                <div>
                                    <h3 className="text-[14px] font-semibold text-white">
                                        set up your watchparty wallet
                                    </h3>
                                    <p className="text-[12px] font-medium text-zinc-500">
                                        one phrase covering every network, and it becomes your primary
                                    </p>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                className="shrink-0 rounded-full"
                                disabled={ensureEmbedded.isPending}
                                onClick={() => ensureEmbedded.mutate()}
                            >
                                {ensureEmbedded.isPending ? "setting up…" : "set up"}
                            </Button>
                        </Panel>
                    )}
                </div>
            )}
        </div>
    );
}
