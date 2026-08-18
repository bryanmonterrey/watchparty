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
                            // Same card as every other surface in the drawer —
                            // panel2 + one baseborder hairline. It was the only
                            // card here with no edge, which is why the block
                            // read as floating chips above hairlined rows.
                            className="flex h-24 flex-col items-start rounded-3xl border border-baseborder/20 bg-panel2 px-3 text-12 font-semibold text-zinc-400 hover:bg-white/[0.09] hover:text-white"
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
