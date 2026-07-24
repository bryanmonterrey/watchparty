import { SendPaperIcon, ReceiveQrIcon, SwapArrowsIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DrawerView } from "../types";

interface WalletActionsProps {
    onNavigate: (view: DrawerView) => void;
}

// Three pills across: Deposit / Send / Swap (Buy is intentionally omitted).
// Each icon carries its own accent — twitter2 blue, long green, short salmon —
// against a shared panel2 fill with white labels.
//
// Pills => plain rounded-full with NO <Squircle> (project rule), and the height
// comes from the Button primitive's `wide` size (h-12 w-full) rather than being
// hand-set. Deposit routes to the existing "receive" view.
const ACTIONS = [
    { id: "receive" as const, label: "Deposit", icon: ReceiveQrIcon, iconClass: "size-6 text-twitter2" },
    { id: "send" as const, label: "Send", icon: SendPaperIcon, iconClass: "size-6 text-long" },
    { id: "swap" as const, label: "Swap", icon: SwapArrowsIcon, iconClass: "size-6 text-short" },
];

export function WalletActions({ onNavigate }: WalletActionsProps) {
    return (
        <div className="px-5 pt-3 pb-3">
            <div className="grid grid-cols-3 gap-1">
                {ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                        <Button
                            key={action.id}
                            size="wide"
                            onClick={() => onNavigate(action.id)}
                            className="bg-panel2 hover:bg-white/10 rounded-3xl flex flex-col items-start px-3 h-24 text-base font-semibold text-zinc-500 hover:text-white"
                        >
                            <Icon className={action.iconClass} />
                            {action.label}
                        </Button>
                    );
                })}
            </div>
        </div>
    );
}
