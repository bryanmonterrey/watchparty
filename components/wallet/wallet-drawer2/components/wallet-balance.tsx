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
    const changeColor = isPositive ? "text-[#75ba80]" : isNegative ? "text-[#e07d6f]" : "text-zinc-500";
    const changeBg = isPositive ? "bg-[#75ba80]/20 text-[#75ba80]" : isNegative ? "bg-[#e07d6f]/20 text-[#e07d6f]" : "bg-zinc-800 text-zinc-500";

    return (
        <div className="px-5 pt-3 pb-3 bg-canvas">
            {/* Label + eye above the number, per the wallet-card block. The eye
                lives here rather than appearing only once the balance is hidden,
                so hiding is discoverable instead of one-way. */}
            <div className="flex items-center gap-1.5">
                {loading ? (
                    <div className="h-3 w-14 rounded-full shimmer-skeleton" />
                ) : (
                    <>
                        <p className="text-xs font-medium text-zinc-500">Balance</p>
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
                    <div className="h-14 w-40 rounded-3xl shimmer-skeleton" />
                ) : hideBalances ? (
                    <p className="text-6xl font-bold text-white tracking-[0.2em] leading-none">••••••</p>
                ) : (
                    <p className="text-6xl font-bold text-white">
                        <PopNumber
                            value={`$${totalUsdBalance !== null ? totalUsdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`}
                        />
                    </p>
                )}
            </div>

            <div className="mt-2 flex items-center gap-2">
                {loading ? (
                    <div className="h-5 w-24 rounded-full shimmer-skeleton" />
                ) : hideBalances ? (
                    // Masked to the same height as the pills, so revealing doesn't
                    // shift the rows below it.
                    <span className="text-[15px] font-bold leading-none tracking-[0.3em] text-zinc-600">•••••</span>
                ) : (
                    <>
                        <span className={cn("text-[15px] font-bold", changeColor)}>
                            <PopNumber
                                value={`${isPositive ? "+" : isNegative ? "-" : ""}$${Math.abs(usdChange24h).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            />
                        </span>
                        <div className={cn("px-2 py-0.5 rounded-md text-[13px] font-bold", changeBg)}>
                            <PopNumber value={`${isPositive ? "+" : ""}${pctChange24h.toFixed(2)}%`} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
