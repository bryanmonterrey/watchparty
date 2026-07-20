"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useConnection } from "@solana/wallet-adapter-react";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { USDC_MINT, INDIVIDUAL_TIERS, priceUsd, formatUsd, TIERS, type TierKey, type BillingCycle } from "@/lib/premium/tiers";
import { getBoostTreasuryOwner } from "@/lib/premium/boosts";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PremiumIcon } from "@/components/icons";

// Discord-Nitro-style gift: pick a person (this dialog is always opened from
// their profile, so the recipient is already fixed), pick an individual tier
// + cycle, pay the treasury directly, server applies the period to their
// premiumSubscriptions row. Owner decisions 2026-07-20: specific-person only
// (no link/code), individual tiers only (no biz).

interface GiftPremiumDialogProps {
    recipientId: string;
    recipientName: string;
    open: boolean;
    onOpenChange: (o: boolean) => void;
}

export function GiftPremiumDialog({ recipientId, recipientName, open, onOpenChange }: GiftPremiumDialogProps) {
    const { data: session } = useAuthSession();
    const { connection } = useConnection();
    const { signAndSubmit } = useWalletSigning();

    const [tierKey, setTierKey] = useState<TierKey>(INDIVIDUAL_TIERS[0]);
    const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
    const [paying, setPaying] = useState(false);

    const gift = trpc.premium.giftPremium.useMutation();
    const priceLabel = formatUsd(priceUsd(tierKey, billingCycle));

    const handleGift = async () => {
        const custodialAddress = session?.user?.wallet_address;
        if (!custodialAddress) { toast.error("Connect a wallet to gift"); return; }
        setPaying(true);
        try {
            const baseUnits = BigInt(Math.round(priceUsd(tierKey, billingCycle) * 1_000_000));
            const [{ PublicKey, Transaction }, spl] = await Promise.all([
                import("@solana/web3.js"),
                import("@solana/spl-token"),
            ]);
            const owner = new PublicKey(custodialAddress);
            const mint = new PublicKey(USDC_MINT);
            const treasuryOwner = new PublicKey(getBoostTreasuryOwner());
            const fromAta = spl.getAssociatedTokenAddressSync(mint, owner, true);
            const toAta = spl.getAssociatedTokenAddressSync(mint, treasuryOwner, true);

            const { blockhash } = await connection.getLatestBlockhash();
            const tx = new Transaction();
            tx.recentBlockhash = blockhash;
            tx.feePayer = owner;
            tx.add(spl.createAssociatedTokenAccountIdempotentInstruction(owner, toAta, treasuryOwner, mint));
            tx.add(spl.createTransferInstruction(fromAta, toAta, owner, baseUnits));

            const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
            const { signature } = await signAndSubmit({ transaction: serialized });

            await gift.mutateAsync({ recipientId, tierKey, billingCycle, txSignature: signature });

            toast.success(`Gifted ${TIERS[tierKey].name} to ${recipientName}!`);
            onOpenChange(false);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Gift failed");
        } finally {
            setPaying(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-full max-w-sm border-none ring-1 ring-white/10">
                <DialogHeader className="items-center text-center">
                    <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-lantern/10">
                        <PremiumIcon className="size-6 text-lantern" />
                    </div>
                    <DialogTitle className="text-white">Gift Premium to {recipientName}</DialogTitle>
                    <DialogDescription className="text-zinc-500">
                        Applies straight to their account — no follow or subscription needed on their end.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tier</p>
                        {INDIVIDUAL_TIERS.map((key) => (
                            <button
                                key={key}
                                onClick={() => setTierKey(key)}
                                className={cn(
                                    "flex items-center justify-between rounded-2xl border px-3.5 py-3 text-left transition-all",
                                    tierKey === key ? "border-white bg-white/10" : "border-zinc-800/50 bg-zinc-900/40 hover:border-zinc-700",
                                )}
                            >
                                <div>
                                    <p className="text-sm font-semibold text-white">{TIERS[key].name}</p>
                                    <p className="text-xs text-zinc-500">{TIERS[key].tagline}</p>
                                </div>
                                <span className="text-xs font-bold text-zinc-400">{formatUsd(priceUsd(key, "monthly"))}/mo</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Billing</p>
                        <div className="flex gap-2">
                            {(["monthly", "annual"] as const).map((cycle) => (
                                <button
                                    key={cycle}
                                    onClick={() => setBillingCycle(cycle)}
                                    className={cn(
                                        "flex-1 rounded-2xl border py-2.5 text-sm font-semibold capitalize transition-all",
                                        billingCycle === cycle
                                            ? "border-white bg-white text-black"
                                            : "border-zinc-800/50 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-white",
                                    )}
                                >
                                    {cycle}
                                </button>
                            ))}
                        </div>
                    </div>

                    <p className="text-center text-xs font-semibold text-zinc-500">
                        Total: <span className="text-white">{priceLabel}</span>
                    </p>

                    <button
                        onClick={handleGift}
                        disabled={paying}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-50"
                    >
                        {paying ? (
                            <><Loader2 className="size-4 animate-spin" /> Gifting…</>
                        ) : (
                            <><PremiumIcon className="size-4" /> Gift {TIERS[tierKey].name}</>
                        )}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
