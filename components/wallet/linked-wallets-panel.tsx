"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Add01Icon,
    CheckmarkCircle02Icon,
    Delete02Icon,
    Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { useWallet } from "@solana/wallet-adapter-react";
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
                appToast.success("Wallet already set up");
            }
        },
        onError: (e) => appToast.error(e.message),
    });

    const setPrimary = trpc.wallet.setPrimaryWallet.useMutation({
        onSuccess: () => {
            utils.wallet.listLinkedWallets.invalidate();
            appToast.success("Main wallet updated");
        },
        onError: (e) => appToast.error(e.message),
    });

    // LINKING A CONNECTED EXTENSION.
    //
    // getLinkNonce + linkWallet have existed on the server all along with no
    // caller anywhere in the app, so there was no way to link an extension at
    // all: connecting one through the adapter gives you a session, never a
    // linked_wallets row. Accounts that signed up with email/OAuth therefore had
    // exactly one wallet (the embedded one) no matter how many extensions they
    // used, and nothing could be chosen as the main wallet.
    //
    // It can't happen silently on connect — linking proves ownership with a
    // signature over a server nonce, which means an explicit user action. So it
    // lives here, next to the wallet it would add.
    const { publicKey: adapterPublicKey, signMessage } = useWallet();
    const connectedAddress = adapterPublicKey?.toBase58();
    const [linking, setLinking] = React.useState(false);

    const getLinkNonce = trpc.wallet.getLinkNonce.useMutation();
    const linkWallet = trpc.wallet.linkWallet.useMutation({
        onSuccess: () => {
            utils.wallet.listLinkedWallets.invalidate();
            appToast.success("Wallet linked");
        },
        onError: (e) => appToast.error(e.message),
    });

    const handleLinkConnected = async () => {
        if (!connectedAddress || !signMessage) return;
        setLinking(true);
        try {
            const { message } = await getLinkNonce.mutateAsync({ address: connectedAddress });
            const signature = await signMessage(new TextEncoder().encode(message));
            await linkWallet.mutateAsync({
                address: connectedAddress,
                signature: Buffer.from(signature).toString("base64"),
            });
        } catch (e) {
            // A user declining the signature is a normal outcome, not an error
            // worth shouting about; the mutation's onError covers real failures.
            const msg = e instanceof Error ? e.message : "";
            if (msg && !/reject|denied|cancel/i.test(msg)) appToast.error(msg);
        } finally {
            setLinking(false);
        }
    };

    const unlink = trpc.wallet.unlinkWallet.useMutation({
        onSuccess: () => {
            utils.wallet.listLinkedWallets.invalidate();
            appToast.success("Wallet unlinked");
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
                        Save your recovery phrase
                    </h2>
                    <p className="mt-1 text-[12px] font-medium text-zinc-500">
                        These 12 words are the only way to restore this wallet. We can&apos;t
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
                    <h2 className="text-[16px] font-bold tracking-tight text-white">Wallets</h2>
                    {/* "the primary one is what the app uses" was wrong AND
                        dangerous-by-omission: the app spends from whichever
                        wallet is connected, while this setting decides where
                        money ARRIVES — escrow resolves revenue splits to it and
                        it's the address shown on your posts. Say that plainly,
                        because it's the only thing on this screen with a
                        consequence someone else can feel. */}
                    <p className="mt-1 text-[12px] font-medium text-zinc-500">
                        your watchparty wallet plus any you connect. your main wallet is where
                        people pay you and how they find you — switching which wallet you&apos;re
                        using doesn&apos;t change it.
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
                                                {w.label || (isEmbedded ? "Watchparty wallet" : "Connected wallet")}
                                            </h3>
                                            {w.isPrimary && (
                                                <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white">
                                                    <HugeiconsIcon
                                                        icon={CheckmarkCircle02Icon}
                                                        className="size-3"
                                                        strokeWidth={2.5}
                                                    />
                                                    Main
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-0.5 text-[12px] font-medium text-zinc-500">
                                            {isEmbedded ? "Created by watchparty" : "Connected by you"}
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
                                            Make main
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

                    {/* A connected extension that isn't linked yet. Only shown
                        when there's actually something to add, so it disappears
                        the moment it's linked. */}
                    {connectedAddress && !wallets.some((w) => w.address === connectedAddress) && (
                        <Panel className="flex items-center justify-between gap-3 p-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-full bg-white/5 p-2.5">
                                    <HugeiconsIcon icon={Add01Icon} className="size-5 text-zinc-400" strokeWidth={2} />
                                </div>
                                <div>
                                    <h3 className="text-[14px] font-semibold text-white">
                                        Link your connected wallet
                                    </h3>
                                    <p className="text-[12px] font-medium text-zinc-500">
                                        Sign once to prove it&apos;s yours, then you can make it your main
                                    </p>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                className="shrink-0 rounded-full"
                                disabled={linking || !signMessage}
                                onClick={handleLinkConnected}
                            >
                                {linking ? "Linking…" : "Link"}
                            </Button>
                        </Panel>
                    )}

                    {!hasEmbedded && (
                        <Panel className="flex items-center justify-between gap-3 p-4">
                            <div className="flex items-center gap-3">
                                <div className="rounded-full bg-white/5 p-2.5">
                                    <HugeiconsIcon icon={Wallet01Icon} className="size-5 text-zinc-400" strokeWidth={2} />
                                </div>
                                <div>
                                    <h3 className="text-[14px] font-semibold text-white">
                                        Set up your watchparty wallet
                                    </h3>
                                    <p className="text-[12px] font-medium text-zinc-500">
                                        One phrase covering every network, and it becomes your main wallet
                                    </p>
                                </div>
                            </div>
                            <Button
                                size="sm"
                                className="shrink-0 rounded-full"
                                disabled={ensureEmbedded.isPending}
                                onClick={() => ensureEmbedded.mutate()}
                            >
                                {ensureEmbedded.isPending ? "Setting up…" : "Set up"}
                            </Button>
                        </Panel>
                    )}
                </div>
            )}
        </div>
    );
}
