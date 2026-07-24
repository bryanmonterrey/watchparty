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
    { id: "receive" as const, label: "Deposit", icon: ReceiveQrIcon, iconClass: "size-5 text-twitter2" },
    { id: "send" as const, label: "Send", icon: SendPaperIcon, iconClass: "size-5 text-long" },
    { id: "swap" as const, label: "Swap", icon: SwapArrowsIcon, iconClass: "size-5 text-short" },
];

export function WalletActions({ onNavigate }: WalletActionsProps) {
    return (
        <div className="px-5 pt-3 pb-3">
            <div className="grid grid-cols-3 gap-2">
                {ACTIONS.map((action) => {
                    const Icon = action.icon;
                    return (
                        <Button
                            key={action.id}
                            variant="ghost"
                            size="wide"
                            onClick={() => onNavigate(action.id)}
                            className="bg-panel2 px-3 text-[15px] font-semibold text-white hover:bg-panel2/70 hover:text-white"
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
