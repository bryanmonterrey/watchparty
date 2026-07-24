import { SendPaperIcon, ReceiveQrIcon, SwapArrowsIcon, BuyCartIcon } from "@/components/icons";
import { DrawerView } from "../types";

interface WalletActionsProps {
    onNavigate: (view: DrawerView) => void;
}

export function WalletActions({ onNavigate }: WalletActionsProps) {
    const ACTIONS = [
        { id: "receive" as const, label: "Receive", icon: ReceiveQrIcon },
        { id: "send" as const, label: "Send", icon: SendPaperIcon },
        { id: "swap" as const, label: "Swap", icon: SwapArrowsIcon },
        { id: "buy" as const, label: "Buy", icon: BuyCartIcon },
    ];

    return (
        <div className="px-5 pt-3 pb-3">
            <div className="grid grid-cols-4 gap-1">
                {ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                        <button
                            key={action.id}
                            className="cursor-pointer ease-in-out flex duration-150 flex-col items-center gap-1.5 p-3 rounded-2xl bg-zinc-900 border-zinc-500/5 border hover:bg-zinc-800/70 transition-all"
                            onClick={() => onNavigate(action.id)}
                        >
                            <Icon className="size-7 text-white/80" />
                            <span className="text-xs font-medium text-zinc-300">{action.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
