"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { toast } from "sonner";
import type { Token } from "@/db/schema/content";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useTokenLaunch } from "@/hooks/use-token-launch";
import { toPublicKey } from "@/lib/solana/pubkey";
import { publicStorageUrl } from "@/lib/supabase/public-url";
import { OPEN_WALLET_DRAWER_EVENT } from "@/components/wallet/sol-balance-chip";
import { Squircle } from "@/components/ui/squircle";

/** What a draft needs to be launched by whoever buys first. */
export type FirstBuyTarget = {
    token: Token;
    /** The creator's wallet — keeps pool identity + fees even when a fan launches it. */
    creatorWallet: string | null;
    /** Fallback art at LAUNCH: the image a coin mints with is the one it keeps. */
    creatorAvatar?: string | null;
};

/** The buy panel's swap-information slot, in first-buy mode: what this buy does instead. */
export function FirstBuyNote({ symbol }: { symbol: string }) {
    return (
        <Squircle asChild radius={24}>
            <div className="bg-white/[0.03] p-4 text-13 font-medium leading-relaxed text-zinc-400">
                <span className="font-bold text-zinc-200">First buy.</span> ${symbol} isn&apos;t on-chain yet — this buy
                creates its pool and launches it. You get the first tokens; the creator keeps the fees.
            </div>
        </Squircle>
    );
}

/** For a caller that must mount the hook unconditionally but has no draft. */
export const NO_DRAFT: FirstBuyTarget = {
    token: { id: "", name: "", ticker: "", imageUrl: null, description: null, creatorFeePercent: null, splits: null } as unknown as Token,
    creatorWallet: null,
};

/**
 * The first buy of a DRAFT token: content creates the row, the first buyer
 * puts it on-chain (create config + pool + buy in one go), then the row is
 * activated with the mint and pool. Lifted out of token-swap-card's
 * FirstBuyCard so the regular buy panel can run the same thing (owner,
 * 2026-10-04: no separate first-buy component — the normal panel with the
 * first buy folded in).
 *
 * Returns "no-wallet" (the drawer was opened instead), "done", or "failed"
 * (launchToken has already toasted the reason).
 */
export function useFirstBuy({ token, creatorWallet, creatorAvatar }: FirstBuyTarget) {
    const router = useRouter();
    const { data: session } = useAuthSession();
    const { publicKey: adapterPublicKey } = useWallet();
    const { launchToken, isLaunching } = useTokenLaunch();
    const activateToken = trpc.trade.activateToken.useMutation();

    const walletAddress = adapterPublicKey?.toBase58() || session?.user?.wallet_address || null;

    const firstBuy = useCallback(async (amountSol: number): Promise<"no-wallet" | "done" | "failed"> => {
        if (!walletAddress) {
            window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT));
            return "no-wallet";
        }
        if (amountSol <= 0 || isLaunching || activateToken.isPending) return "failed";

        const creatorPk = toPublicKey(creatorWallet ?? undefined);
        const result = await launchToken(
            {
                name: token.name,
                symbol: token.ticker,
                image: publicStorageUrl(token.imageUrl) || creatorAvatar || "",
                description: token.description ?? "",
            },
            {
                earningsEnabled: true,
                ticker: token.ticker,
                creatorFee: token.creatorFeePercent ?? 0,
                splits: (token.splits as never[] | null) ?? [],
                buyAmount: amountSol,
            },
            creatorPk ? { creatorWallet: creatorPk } : undefined,
        );

        if (!(result.success && result.status === "live" && result.tokenAddress && result.poolAddress)) return "failed";
        try {
            await activateToken.mutateAsync({
                tokenId: token.id,
                tokenAddress: result.tokenAddress,
                poolAddress: result.poolAddress,
            });
            toast.success(`$${token.ticker} is live — you made the first buy`);
            router.refresh();
            return "done";
        } catch (e) {
            console.error("activateToken failed after launch:", e);
            toast.error("Launched on-chain but the page didn't update — refresh in a moment");
            return "done";
        }
    }, [walletAddress, isLaunching, activateToken, creatorWallet, creatorAvatar, launchToken, token, router]);

    return { firstBuy, launching: isLaunching || activateToken.isPending, walletAddress };
}
