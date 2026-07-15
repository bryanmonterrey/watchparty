"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { trpc } from "@/lib/trpc/client";
import { USDC_MINT } from "@/lib/premium/tiers";
import { BOOST_PACKS, getBoostTreasuryOwner, type BoostPack } from "@/lib/premium/boosts";
import { cn } from "@/lib/utils";

// Community shop. v1 sells boost packs: pay USDC on-chain to the premium
// treasury, then redeem the signature server-side (community.purchaseBoosts
// verifies the transfer and grants slots). Chain SDKs load inside the buy
// handler — the page itself ships no Solana code.
export function ShopView() {
    const { data: session } = useAuthSession();
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const { signAndSubmit } = useWalletSigning();
    const [buying, setBuying] = useState<number | null>(null);

    const utils = trpc.useUtils();
    const balance = trpc.community.boostBalance.useQuery(undefined, { enabled: !!session?.user });
    const purchase = trpc.community.purchaseBoosts.useMutation();

    const buy = async (pack: BoostPack) => {
        if (!session?.user) {
            toast.error("Sign in to buy boosts");
            return;
        }
        setBuying(pack.boosts);
        try {
            const [{ PublicKey, Transaction }, spl] = await Promise.all([
                import("@solana/web3.js"),
                import("@solana/spl-token"),
            ]);

            const custodialAddress = session.user.wallet_address;
            const owner = custodialAddress ? new PublicKey(custodialAddress) : publicKey;
            if (!owner) {
                toast.error("Connect a wallet to buy boosts");
                return;
            }

            const mint = new PublicKey(USDC_MINT);
            const treasuryOwner = new PublicKey(getBoostTreasuryOwner());
            const fromAta = spl.getAssociatedTokenAddressSync(mint, owner, true);
            const toAta = spl.getAssociatedTokenAddressSync(mint, treasuryOwner, true);

            const { blockhash } = await connection.getLatestBlockhash();
            const tx = new Transaction();
            tx.recentBlockhash = blockhash;
            tx.feePayer = owner;
            tx.add(spl.createAssociatedTokenAccountIdempotentInstruction(owner, toAta, treasuryOwner, mint));
            tx.add(spl.createTransferInstruction(fromAta, toAta, owner, BigInt(pack.usd) * BigInt(1_000_000)));

            let txSignature: string;
            if (custodialAddress) {
                const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
                txSignature = (await signAndSubmit({ transaction: serialized })).signature;
            } else {
                txSignature = await sendTransaction(tx, connection);
                await connection.confirmTransaction(txSignature, "confirmed");
            }

            const { granted } = await purchase.mutateAsync({ txSignature, boosts: pack.boosts });
            toast.success(`${granted} boost${granted === 1 ? "" : "s"} added`);
            utils.community.boostBalance.invalidate();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Purchase failed");
        } finally {
            setBuying(null);
        }
    };

    const b = balance.data;

    return (
        <ScrollArea className="flex-1 bg-background">
            <div className="flex flex-col p-6 pt-5 max-w-5xl mx-auto">
                <div className="mb-7">
                    <h1 className="text-[24px] font-bold tracking-tight text-white">Shop</h1>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-500">Boosts for your favorite servers.</p>
                </div>

                {/* Balance */}
                <div className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-3xl bg-white/[0.03] p-5">
                    <div>
                        <p className="text-[13px] font-semibold text-zinc-500">Available boosts</p>
                        {balance.isLoading ? (
                            <div className="mt-1.5 h-8 w-16 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                        ) : (
                            <p className="text-[28px] font-bold tabular-nums tracking-tight text-white">{b?.available ?? 0}</p>
                        )}
                    </div>
                    {b && (
                        <p className="text-[13px] font-medium text-zinc-500">
                            {b.tierSlots} from premium · {b.purchased} purchased · {b.used} in use
                        </p>
                    )}
                    {b && b.tierSlots === 0 && (
                        <Link
                            href="/premium"
                            className="flex h-11 shrink-0 items-center rounded-full bg-white/10 px-5 text-[13px] font-bold text-white transition-colors hover:bg-white/20"
                        >
                            Premium includes boosts
                        </Link>
                    )}
                </div>

                {/* Packs */}
                <h2 className="mb-4 text-[14px] font-semibold text-zinc-500">Boost packs</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {BOOST_PACKS.map((pack, i) => {
                        const perBoost = pack.usd / pack.boosts;
                        const isBuying = buying === pack.boosts;
                        return (
                            <div key={pack.boosts} className="flex flex-col rounded-3xl bg-white/[0.03] p-5">
                                <div className="flex items-baseline justify-between">
                                    <p className="text-[28px] font-bold tabular-nums tracking-tight text-white">
                                        {pack.boosts}
                                        <span className="ml-1.5 text-[14px] font-semibold text-zinc-500">
                                            boost{pack.boosts === 1 ? "" : "s"}
                                        </span>
                                    </p>
                                    {i === BOOST_PACKS.length - 1 && (
                                        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold leading-none text-white">
                                            Best value
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 text-[13px] font-medium text-zinc-500">
                                    ${pack.usd} USDC{pack.boosts > 1 && ` · $${perBoost.toFixed(2)} each`}
                                </p>
                                <button
                                    onClick={() => buy(pack)}
                                    disabled={buying !== null}
                                    className={cn(
                                        "mt-4 flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[14px] font-bold transition-colors disabled:pointer-events-none",
                                        isBuying ? "bg-white/10 text-zinc-300" : "bg-white text-black hover:bg-white/90 disabled:opacity-40",
                                    )}
                                >
                                    {isBuying ? (
                                        <><Loader2 className="size-4 animate-spin" /> Confirming…</>
                                    ) : (
                                        `Buy for $${pack.usd}`
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* How it works */}
                <div className="mt-8 space-y-1.5">
                    <p className="text-[13px] font-medium text-zinc-500">Boosts support the servers you love — boost from the server name menu.</p>
                    <p className="text-[13px] font-medium text-zinc-500">Premium tiers include boost slots while your subscription is active; purchased boosts are yours forever.</p>
                    <p className="text-[13px] font-medium text-zinc-500">Un-boost a server anytime to free the slot for another one.</p>
                </div>
            </div>
        </ScrollArea>
    );
}
