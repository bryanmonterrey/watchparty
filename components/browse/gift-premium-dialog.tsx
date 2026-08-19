"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useConnection } from "@solana/wallet-adapter-react";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { USDC_MINT, INDIVIDUAL_TIERS, priceUsd, formatUsd, TIERS, type TierKey, type BillingCycle } from "@/lib/premium/tiers";
import { getBoostTreasuryOwner } from "@/lib/premium/boosts";
import { Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GiftBoxIcon } from "@/components/icons";
import { Squircle } from "@/components/ui/squircle";

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
            <DialogContent className="w-full max-w-sm">
                <DialogHeader className="items-center text-center">
                    <Squircle asChild radius={16}>
                        <div className="grid size-14 place-items-center bg-white/10">
                            <GiftBoxIcon className="size-7 text-white" />
                        </div>
                    </Squircle>
                    <DialogTitle className="pt-1 text-white">Gift Premium to {recipientName}</DialogTitle>
                    <DialogDescription className="text-zinc-500">
                        Applies straight to their account — no follow or subscription needed on their end.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tier</p>
                        {INDIVIDUAL_TIERS.map((key) => {
                            const selected = tierKey === key;
                            return (
                                <Squircle asChild radius={16} key={key}>
                                    <button
                                        onClick={() => setTierKey(key)}
                                        className={cn(
                                            "flex cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors",
                                            selected ? "bg-white/10" : "bg-zinc-900/40 hover:bg-zinc-900/70",
                                        )}
                                    >
                                        {selected ? (
                                            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white">
                                                <Check className="size-3 text-black" strokeWidth={3.5} />
                                            </span>
                                        ) : (
                                            <span className="size-5 shrink-0 rounded-full border-2 border-zinc-700" />
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-bold text-white">{TIERS[key].name}</p>
                                            <p className="text-xs text-zinc-500">{TIERS[key].tagline}</p>
                                        </div>
                                        <span className={cn("text-xs font-bold tabular-nums", selected ? "text-white" : "text-zinc-400")}>
                                            {formatUsd(priceUsd(key, billingCycle))}{billingCycle === "annual" ? "/yr" : "/mo"}
                                        </span>
                                    </button>
                                </Squircle>
                            );
                        })}
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Billing</p>
                            {billingCycle === "annual" && (
                                <span className="text-[11px] font-bold text-lantern">2 months free</span>
                            )}
                        </div>
                        <div className="relative flex rounded-full bg-zinc-900/60 p-1">
                            {(["monthly", "annual"] as const).map((cycle) => {
                                const active = billingCycle === cycle;
                                return (
                                    <button
                                        key={cycle}
                                        onClick={() => setBillingCycle(cycle)}
                                        className={cn(
                                            "relative z-10 h-11 flex-1 cursor-pointer rounded-full text-sm font-bold capitalize transition-colors duration-200",
                                            active ? "text-black" : "text-zinc-400 hover:text-white",
                                        )}
                                    >
                                        {cycle}
                                        {active && (
                                            <motion.div
                                                layoutId="gift-cycle-pill"
                                                className="absolute inset-0 -z-10 rounded-full bg-white"
                                                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                            />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex items-end justify-between border-t border-white/5 pt-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Total</p>
                            <p className="mt-0.5 text-[11px] font-medium text-zinc-500">
                                One-time payment · {billingCycle === "annual" ? "12 months" : "1 month"} of {TIERS[tierKey].name}
                            </p>
                        </div>
                        <span className="text-3xl font-black tracking-tighter text-white tabular-nums">{priceLabel}</span>
                    </div>

                    <button
                        onClick={handleGift}
                        disabled={paying}
                        className="flex h-16 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-white text-base font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-50"
                    >
                        {paying ? (
                            <><Loader2 className="size-4 animate-spin" /> Gifting…</>
                        ) : (
                            <>Gift {TIERS[tierKey].name}</>
                        )}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
