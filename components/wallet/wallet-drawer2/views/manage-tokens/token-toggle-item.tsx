"use client";

import { motion } from "motion/react";
import { Token } from "../../types";
import { TokenIcon } from "../../components/token-icon";
import { Switch } from "@/components/ui/switch";

interface TokenToggleItemProps {
    token: Token;
    shown: boolean;
    onToggle: (mint: string) => void;
}

export function TokenToggleItem({ token, shown, onToggle }: TokenToggleItemProps) {
    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="group flex items-center justify-between rounded-3xl border border-baseborder/20 bg-panel2 p-4 transition-colors hover:bg-white/[0.05]"
        >
            <div className="flex items-center gap-4">
                <TokenIcon
                    src={token.icon}
                    symbol={token.symbol}
                    className="size-12 rounded-full"
                    showChainBadge={true}
                />
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                        <h3 className="max-w-[160px] truncate text-15 font-bold leading-tight tracking-tight text-white">
                            {token.name}
                        </h3>
                    </div>
                    <p className="text-13 font-medium tabular-nums text-zinc-500">
                        {token.balance.toLocaleString(undefined, { maximumFractionDigits: 5 })} {token.symbol}
                    </p>
                </div>
            </div>

            {/* The app's Switch, not a hand-rolled one. This was a 52x32 pill
                that turned LANTERN when on — the app's positive-value green
                used as an interactive state, which is exactly the colour rule
                the design system reserves. */}
            <Switch checked={shown} onCheckedChange={() => onToggle(token.mint)} />
        </motion.div>
    );
}
