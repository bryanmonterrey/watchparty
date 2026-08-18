import { HugeiconsIcon } from "@hugeicons/react";
import { ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { PopNumber } from "@/components/ui/pop-number";

interface WalletBalanceProps {
    totalUsdBalance: number | null;
    usdChange24h?: number;
    pctChange24h?: number;
    hideBalances?: boolean;
    onToggleHideBalances?: () => void;
    loading?: boolean;
}

export function WalletBalance({ totalUsdBalance, usdChange24h = 0, pctChange24h = 0, hideBalances, onToggleHideBalances, loading }: WalletBalanceProps) {
    const isPositive = usdChange24h > 0;
    const isNegative = usdChange24h < 0;
    // lantern / pastelred, the app's two semantic colours — these were #75ba80
    // and #e07d6f, minted here and repeated by hand in the coin row, the token
    // header and the 24h performance card.
    const changeColor = isPositive ? "text-lantern" : isNegative ? "text-pastelred" : "text-zinc-500";
    const changeBg = isPositive ? "bg-lantern/15 text-lantern" : isNegative ? "bg-pastelred/15 text-pastelred" : "bg-white/[0.06] text-zinc-500";

    return (
        <div className="px-5 pt-3 pb-3 bg-canvas">
            {/* Label + eye above the number, per the wallet-card block. The eye
                lives here rather than appearing only once the balance is hidden,
                so hiding is discoverable instead of one-way. */}
            {/* Each skeleton below sits in the same line box as the type it
                replaces (12px label, 60px number, 15px change + its pill), so
                the block is exactly as tall loading as loaded and the tabs
                underneath don't shift when the balance lands. Bars are
                rounded-full like every other skeleton in the app — these were
                rounded-sm, the one square-ish thing in the drawer. */}
            <div className="flex h-4 items-center gap-1.5">
                {loading ? (
                    <div className="h-3 w-14 rounded-full shimmer-skeleton" />
                ) : (
                    <>
                        <p className="text-11 font-medium text-zinc-500">Balance</p>
                        <button
                            onClick={onToggleHideBalances}
                            aria-label={hideBalances ? "show balance" : "hide balance"}
                            aria-pressed={hideBalances}
                            className="cursor-pointer text-zinc-500 transition-colors hover:text-white"
                        >
                            <HugeiconsIcon
                                icon={hideBalances ? ViewOffSlashIcon : ViewIcon}
                                className="size-3.5"
                                strokeWidth={2}
                            />
                        </button>
                    </>
                )}
            </div>

            <div className="mt-1 flex items-end gap-2">
                {loading ? (
                    // text-6xl at leading-none is exactly 60px tall; h-14 (56px)
                    // left the number a touch shorter than what replaced it.
                    <div className="h-[60px] w-56 rounded-2xl shimmer-skeleton" />
                ) : hideBalances ? (
                    <p className="text-6xl font-bold text-white tracking-[0.2em] leading-none">••••••</p>
                ) : (
                    <p className="text-6xl font-bold tracking-tight text-white">
                        <PopNumber
                            value={`$${totalUsdBalance !== null ? totalUsdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`}
                        />
                    </p>
                )}
            </div>

            <div className="mt-2 flex h-6 items-center gap-2">
                {loading ? (
                    // Two shapes, because there are two: the dollar change and
                    // the percentage badge. One wide bar read as a single
                    // sentence and then split in half on load.
                    <>
                        <div className="h-[15px] w-20 rounded-full shimmer-skeleton" />
                        <div className="h-6 w-14 rounded-full shimmer-skeleton" />
                    </>
                ) : hideBalances ? (
                    // Masked to the same height as the pills, so revealing doesn't
                    // shift the rows below it.
                    <span className="text-14 font-bold leading-none tracking-[0.3em] text-zinc-600">•••••</span>
                ) : (
                    <>
                        <span className={cn("text-14 font-bold tabular-nums", changeColor)}>
                            <PopNumber
                                value={`${isPositive ? "+" : isNegative ? "-" : ""}$${Math.abs(usdChange24h).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            />
                        </span>
                        <div className={cn("rounded-full px-2 py-0.5 text-12 font-bold tabular-nums", changeBg)}>
                            <PopNumber value={`${isPositive ? "+" : ""}${pctChange24h.toFixed(2)}%`} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
