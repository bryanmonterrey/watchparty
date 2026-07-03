import { Button } from "@/components/ui/button";
import { Squircle } from "@/components/ui/squircle";

/**
 * Standalone wallet-button loading placeholder.
 *
 * Kept in its own module — free of the heavy `@solana/wallet-adapter-react`
 * imports that `wallet-button.tsx` pulls in — so the header can render it
 * server-side without dragging the wallet SDK into the initial bundle. Used as
 * both the header's pre-mount placeholder and the dynamic import's `loading`
 * fallback, so the wallet skeleton appears in lockstep with the Create skeleton.
 */
export function WalletButtonSkeleton() {
    return (
        <Squircle asChild radius={16} autoEffects={false}>
            <Button
                disabled
                variant="outline"
                className="text-zinc-300 size-11 p-0 overflow-hidden bg-[#6A6A6A]/35 backdrop-blur-xs border-none"
            >
                <div className="size-full shimmer-skeleton shrink-0" />
            </Button>
        </Squircle>
    );
}
