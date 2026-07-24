import { SendPaperIcon, ReceiveQrIcon, SwapArrowsIcon, BuyCartIcon } from "@/components/icons";
import { Squircle } from "@/components/ui/squircle";
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
                        // radius 16 matches the rounded-2xl this replaced. No rounded-*
                        // here (redundant under the clip-path), and autoEffects is left
                        // ON (default) so Lisse re-renders the CSS border as an SVG
                        // effect tracing the squircle — passing autoEffects={false}
                        // would clip the border away.
                        //
                        // w-full/h-full are load-bearing: with autoEffects on, Lisse
                        // wraps the child in a relative <div> (needsWrapper), so the
                        // button is no longer the grid item and stops stretching to
                        // the cell. Filling the wrapper restores the tile shape.
                        <Squircle key={action.id} asChild radius={16}>
                            <button
                                className="cursor-pointer ease-in-out flex duration-150 w-full h-full flex-col items-center gap-1.5 p-3 py-5 bg-panel border border-baseborder hover:bg-baseborder/45 transition-all"
                                onClick={() => onNavigate(action.id)}
                            >
                                <Icon className="size-7 text-white/80" />
                                <span className="text-xs font-medium text-zinc-300">{action.label}</span>
                            </button>
                        </Squircle>
                    );
                })}
            </div>
        </div>
    );
}
