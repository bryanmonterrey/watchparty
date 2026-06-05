import { Eye } from "lucide-react";
import { Skeleton } from "boneyard-js/react";
import { cn } from "@/lib/utils";

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
        <div className="px-5 pt-3 pb-5 bg-gray1">
            <div className="flex items-end gap-2">
                {loading ? (
                    <Skeleton name="wallet-balance-amount" loading>
                        <div className="h-10 w-40 rounded-3xl bg-zinc-700/10" />
                    </Skeleton>
                ) : hideBalances ? (
                    <p className="text-5xl font-bold text-white tracking-[0.2em] leading-none">••••••</p>
                ) : (
                    <p className="text-5xl font-bold text-white">
                        ${totalUsdBalance !== null ? totalUsdBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                    </p>
                )}
            </div>
            <div className="mt-2 flex items-center gap-2">
                {loading ? (
                    <Skeleton name="wallet-balance-change" loading>
                        <div className="h-5 w-24 rounded-full bg-zinc-700/10" />
                    </Skeleton>
                ) : hideBalances ? (
                    <button
                        onClick={onToggleHideBalances}
                        className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                        <Eye className="w-4 h-4" />
                        <span className="text-sm font-medium">Show Balance</span>
                    </button>
                ) : (
                    <>
                        <span className={cn("text-[15px] font-bold", changeColor)}>
                            {isPositive ? "+" : isNegative ? "-" : ""}${Math.abs(usdChange24h).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <div className={cn("px-2 py-0.5 rounded-md text-[13px] font-bold", changeBg)}>
                            {isPositive ? "+" : ""}{pctChange24h.toFixed(2)}%
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
