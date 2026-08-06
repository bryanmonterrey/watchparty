"use client";

import * as React from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useTokenLaunch } from "@/hooks/use-token-launch";
import { toPublicKey } from "@/lib/solana/pubkey";
import { appToast } from "@/components/app-ui/app-toast";
import { OPEN_WALLET_DRAWER_EVENT } from "@/components/wallet/sol-balance-chip";
import { Squircle } from "@/components/ui/squircle";

// Launching someone else's creator coin.
//
// A visitor gets THIS, never TickerEditDialog: the ticker, name and fee are the
// creator's authorship of a coin that represents them, so they're read-only
// here. The only thing a visitor decides is how much to buy — which is the
// whole launch, since the first buy is what puts the pool on-chain.
//
// Same deal as the coin page's FirstBuyCard (components/tokens/token-swap-card):
// buyer pays and receives the first tokens, creator keeps the pool identity and
// the trading fees.
const FIRST_BUY_PRESETS = [0.1, 0.5, 1] as const;

export function CreatorCoinLaunchDialog({
    open,
    onOpenChange,
    coin,
    creatorWallet,
    creatorAvatar,
    onLaunched,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    coin: {
        id: string;
        ticker: string;
        name: string | null;
        imageUrl: string | null;
        description: string | null;
        creatorFeePercent: number | null;
        splits: unknown;
    };
    creatorWallet: string | null;
    creatorAvatar: string | null;
    onLaunched: () => void;
}) {
    const { data: session } = useAuthSession();
    const { publicKey: adapterPublicKey } = useWallet();
    const { launchToken, isLaunching } = useTokenLaunch();
    const activateToken = trpc.trade.activateToken.useMutation();
    const [amount, setAmount] = React.useState("");

    const walletAddress = adapterPublicKey?.toBase58() || session?.user?.wallet_address || null;
    const amountSol = parseFloat(amount) || 0;
    const busy = isLaunching || activateToken.isPending;

    const firstBuy = async () => {
        if (!walletAddress) {
            window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT));
            return;
        }
        if (amountSol <= 0 || busy) return;

        try {
            const creatorPk = toPublicKey(creatorWallet ?? undefined);
            const result = await launchToken(
                {
                    name: coin.name ?? coin.ticker,
                    symbol: coin.ticker,
                    // Whatever mints here is the coin's art forever, so fall
                    // back to the creator's face rather than launching blank.
                    image: coin.imageUrl || creatorAvatar || "",
                    description: coin.description ?? "",
                },
                {
                    earningsEnabled: true,
                    ticker: coin.ticker,
                    creatorFee: coin.creatorFeePercent ?? 0,
                    splits: (coin.splits as never[] | null) ?? [],
                    buyAmount: amountSol,
                },
                // Creator keeps the pool identity + fees even when a fan launches it.
                creatorPk ? { creatorWallet: creatorPk } : undefined,
            );

            if (result.success && result.tokenAddress && result.poolAddress) {
                await activateToken.mutateAsync({
                    tokenId: coin.id,
                    tokenAddress: result.tokenAddress,
                    poolAddress: result.poolAddress,
                });
                appToast.success(`$${coin.ticker} is live — you made the first buy`);
                onLaunched();
                onOpenChange(false);
            }
        } catch (e) {
            appToast.error(e instanceof Error ? e.message : "launch failed");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[420px] rounded-[28px] border-baseborder/10 bg-panel p-6">
                <VisuallyHidden.Root>
                    <DialogTitle>Launch ${coin.ticker}</DialogTitle>
                </VisuallyHidden.Root>

                <div className="flex items-center gap-3">
                    {(coin.imageUrl || creatorAvatar) && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={coin.imageUrl || creatorAvatar || ""}
                            alt=""
                            className="size-11 shrink-0 rounded-full object-cover"
                        />
                    )}
                    <div className="min-w-0">
                        <p className="truncate text-lg font-bold text-zinc-100">${coin.ticker}</p>
                        {coin.name && <p className="truncate text-sm font-medium text-zinc-500">{coin.name}</p>}
                    </div>
                </div>

                <p className="mt-4 text-sm font-medium leading-relaxed text-zinc-500">
                    this coin isn&apos;t on-chain yet. the first buy launches it — the creator keeps the
                    fees, you get the first tokens.
                </p>

                <div className="mt-5 flex items-center justify-center gap-1">
                    <input
                        type="text"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => {
                            const v = e.target.value.replace(/[^0-9.]/g, "");
                            if ((v.match(/\./g)?.length ?? 0) <= 1) setAmount(v);
                        }}
                        placeholder="0"
                        className="bg-transparent text-center text-5xl font-bold text-zinc-100 outline-none placeholder:text-zinc-600"
                        style={{ width: `${Math.max(1.5, (amount.length || 1) * 0.72)}ch` }}
                    />
                    <div className="ml-2 rounded-full bg-zinc-800 px-3 py-1 text-xs font-semibold text-zinc-400">
                        SOL
                    </div>
                </div>

                <div className="mt-5 flex items-center gap-2">
                    {FIRST_BUY_PRESETS.map((v) => (
                        <button
                            key={v}
                            type="button"
                            onClick={() => setAmount(String(v))}
                            className="text-md flex-1 cursor-pointer rounded-full border border-zinc-800 bg-zinc-900 py-3 font-semibold text-zinc-300 transition-colors hover:bg-zinc-800"
                        >
                            {v} SOL
                        </button>
                    ))}
                </div>

                <Squircle asChild radius={24}>
                    <button
                        type="button"
                        onClick={firstBuy}
                        disabled={!!walletAddress && (amountSol <= 0 || busy)}
                        className="mt-6 h-12 w-full cursor-pointer bg-white text-lg font-bold text-black transition-colors hover:bg-white/90 disabled:cursor-default disabled:opacity-40"
                    >
                        {!walletAddress
                            ? "connect wallet"
                            : busy
                                ? "launching…"
                                : `buy & launch $${coin.ticker}`}
                    </button>
                </Squircle>

                <p className="mt-3 text-right text-sm font-semibold text-zinc-500">+ ~0.03 SOL launch fees</p>
            </DialogContent>
        </Dialog>
    );
}
