"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { USDC_MINT } from "@/lib/premium/tiers";
import { getBoostTreasuryOwner } from "@/lib/premium/boosts";
import { Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Twitch-style community gifting (owner decision 2026-07-20): pick a tier +
// quantity, not a specific person — gifts land on random eligible followers
// immediately. Real USDC payment: one lump-sum transfer to the treasury,
// verified on-chain server-side (subscription.giftSubscription), mirroring
// how predictions.placeBet and the boost shop already pay the treasury.

const USDC = 1_000_000;
function baseToUsd(n: number) {
    return (n / USDC).toFixed(2).replace(/\.00$/, "");
}

const QUANTITY_PRESETS = [1, 3, 5, 10];

interface GiftSubscriptionDialogProps {
    creatorId: string;
    creatorName: string;
    /** Quantity to open on — the leaderboard passes what it takes to move up. */
    initialQuantity?: number;
    /**
     * Gift to ONE named person rather than the random pool.
     *
     * Turns the dialog into a single-sub flow: no quantity picker, no queue
     * copy, and the recipient's eligibility is checked BEFORE the pay button
     * unlocks — money moves on-chain first, so anything refusable has to be
     * refused while it's still free to.
     */
    recipientId?: string;
    recipientName?: string;
    open: boolean;
    onOpenChange: (o: boolean) => void;
}

export function GiftSubscriptionDialog({ creatorId, creatorName, initialQuantity, recipientId, recipientName, open, onOpenChange }: GiftSubscriptionDialogProps) {
    const { data: session } = useAuthSession();
    const { connection } = useConnection();
    const { sendTransaction } = useWallet();
    const { signAndSubmit } = useWalletSigning();
    const utils = trpc.useUtils();

    const { data: tiers } = trpc.subscription.getTiers.useQuery({ creatorId }, { enabled: open });
    const { data: eligible } = trpc.subscription.getGiftEligibleCount.useQuery({ creatorId }, { enabled: open });
    const gift = trpc.subscription.giftSubscription.useMutation();

    const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
    const directed = !!recipientId;
    const [quantity, setQuantity] = useState(directed ? 1 : initialQuantity ?? 1);

    // Asked only in directed mode, and only while the dialog is open. This is
    // the check that has to happen before the wallet does anything.
    const { data: canReceive } = trpc.subscription.canReceiveGift.useQuery(
        { creatorId, recipientId: recipientId ?? "" },
        { enabled: open && directed },
    );
    const [message, setMessage] = useState("");
    const [paying, setPaying] = useState(false);

    const eligibleCount = eligible?.count ?? 0;
    const selectedTier = tiers?.find(t => t.id === selectedTierId);
    // No ceiling from eligibleCount — anything beyond who's eligible right
    // now queues for the next new follower instead of being blocked.
    const maxQuantity = 50;
    const willQueue = Math.max(0, quantity - eligibleCount);
    const totalUsdc = selectedTier?.priceUsdcMonthly ? selectedTier.priceUsdcMonthly * quantity : 0;

    const reset = () => { setSelectedTierId(null); setQuantity(directed ? 1 : initialQuantity ?? 1); setMessage(""); };

    const handleGift = async () => {
        if (!selectedTier?.priceUsdcMonthly || !session?.user) return;
        setPaying(true);
        try {
            const baseUnits = BigInt(selectedTier.priceUsdcMonthly) * BigInt(quantity);
            const [{ PublicKey, Transaction }, spl] = await Promise.all([
                import("@solana/web3.js"),
                import("@solana/spl-token"),
            ]);
            const custodialAddress = session.user.wallet_address;
            const owner = custodialAddress ? new PublicKey(custodialAddress) : undefined;
            if (!owner) { toast.error("Connect a wallet to gift"); return; }

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

            let txSignature: string;
            if (custodialAddress) {
                const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
                txSignature = (await signAndSubmit({ transaction: serialized })).signature;
            } else {
                txSignature = await sendTransaction(tx, connection);
                await connection.confirmTransaction(txSignature, "confirmed");
            }

            const result = await gift.mutateAsync({
                creatorId,
                tierId: selectedTier.id,
                quantity,
                message: message || undefined,
                txSignature,
                recipientId,
            });

            if (directed) {
                // A directed gift can still end up queued: if they subscribed in
                // the gap between the eligibility check and the charge landing,
                // the server honours the payment rather than swallowing it.
                toast.success(
                    result.gifted > 0
                        ? `Gifted ${selectedTier.name} to ${recipientName ?? "them"}!`
                        : `${recipientName ?? "They"} just subscribed — your gift is queued for the next new follower.`,
                );
            } else {
                const parts = [];
                if (result.gifted > 0) parts.push(`${result.gifted} gifted now`);
                if (result.queued > 0) parts.push(`${result.queued} queued for new followers`);
                toast.success(`${parts.join(", ")} — ${selectedTier.name} for ${creatorName}'s community!`);
            }
            utils.subscription.getGiftEligibleCount.invalidate({ creatorId });
            reset();
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
                    <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-lantern/10">
                        <Gift className="size-6 text-lantern" />
                    </div>
                    <DialogTitle className="text-white">
                        {directed
                            ? `Gift ${recipientName ?? "them"} a sub to ${creatorName}`
                            : `Gift subs to ${creatorName}'s community`}
                    </DialogTitle>
                    <DialogDescription className="text-zinc-500">
                        Lands on random eligible followers, one month each — anything left over queues for the next new follower instead of going to waste.
                    </DialogDescription>
                </DialogHeader>

                {!tiers ? (
                    <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-zinc-500" /></div>
                ) : tiers.length === 0 ? (
                    <p className="py-4 text-center text-sm text-zinc-500">This creator has no subscription tiers.</p>
                ) : (
                    <div className="flex flex-col gap-4">
                        {/* Tier picker */}
                        <div className="flex flex-col gap-2">
                            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Tier</p>
                            {tiers.filter(t => t.priceUsdcMonthly).map(tier => (
                                <button
                                    key={tier.id}
                                    onClick={() => setSelectedTierId(tier.id)}
                                    className={cn(
                                        "flex items-center justify-between rounded-2xl border px-3.5 py-3 text-left transition-all",
                                        selectedTierId === tier.id
                                            ? "border-white bg-white/10"
                                            : "border-zinc-800/50 bg-zinc-900/40 hover:border-zinc-700",
                                    )}
                                >
                                    <p className="text-sm font-semibold text-white">{tier.name}</p>
                                    <span className="text-xs font-bold text-zinc-400">${baseToUsd(tier.priceUsdcMonthly!)}/mo</span>
                                </button>
                            ))}
                        </div>

                        {/* Quantity — community gifting only. A directed gift is
                            one sub to one person; a picker there would be a
                            control with a single valid value. */}
                        {selectedTierId && !directed && (
                            <div className="flex flex-col gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                                    How many <span className="text-zinc-600">· {eligibleCount} eligible now</span>
                                </p>
                                <div className="flex gap-2">
                                    {QUANTITY_PRESETS.filter(q => q <= maxQuantity).map(q => (
                                        <button
                                            key={q}
                                            onClick={() => setQuantity(q)}
                                            className={cn(
                                                "flex-1 rounded-2xl border py-2.5 text-sm font-semibold transition-all",
                                                quantity === q
                                                    ? "border-white bg-white text-black"
                                                    : "border-zinc-800/50 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-white",
                                            )}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-xs font-semibold text-zinc-500">
                                    Total: <span className="text-white">${baseToUsd(totalUsdc)}</span>
                                    {willQueue > 0 && (
                                        <span className="text-zinc-600"> · {willQueue} queued for the next {willQueue === 1 ? "follower" : "followers"}</span>
                                    )}
                                </p>
                            </div>
                        )}

                        {/* Message */}
                        {selectedTierId && (
                            <textarea
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                placeholder="Add a message (optional)"
                                maxLength={200}
                                rows={2}
                                className="w-full resize-none rounded-2xl border border-zinc-800/60 bg-[#1b1b1c] px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-white/30 focus:outline-none"
                            />
                        )}

                        {/* Why they can't be gifted, before the button rather
                            than after the payment — "already subscribed" is a
                            fine thing to learn for free and a terrible one to
                            learn from a receipt. */}
                        {directed && canReceive && !canReceive.eligible && (
                            <p className="text-center text-xs font-semibold text-zinc-500">{canReceive.reason}</p>
                        )}

                        <button
                            onClick={handleGift}
                            // Directed gifts wait for the eligibility answer.
                            // undefined is "still asking", which is not the same
                            // as yes — paying on an unanswered check is exactly
                            // the race this query exists to close.
                            disabled={!selectedTierId || paying || (directed && !canReceive?.eligible)}
                            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white text-sm font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-50"
                        >
                            {paying ? (
                                <><Loader2 className="size-4 animate-spin" /> Gifting…</>
                            ) : (
                                <>
                                    <Gift className="size-4" />
                                    {directed
                                        ? `Gift ${recipientName ?? "them"} a sub`
                                        : `Gift ${quantity > 1 ? `${quantity} subs` : "1 sub"}`}
                                </>
                            )}
                        </button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
