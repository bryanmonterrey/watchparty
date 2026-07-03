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
 *
 * Skeletons are the only header tiles present in the server-rendered HTML, and
 * Lisse's squircle is a clip-path applied from a client layout effect — so
 * pre-hydration they'd render square. rounded-2xl stands in until Lisse stamps
 * data-state="ready", at which point the clip is the only shape.
 */
export function WalletButtonSkeleton() {
    return (
        <Squircle asChild radius={16} autoEffects={false}>
            <Button
                disabled
                variant="outline"
                className="text-zinc-300 rounded-2xl data-[state=ready]:rounded-none size-11 p-0 overflow-hidden bg-[#6A6A6A]/35 backdrop-blur-xs border-none"
            >
                <div className="size-full shimmer-skeleton shrink-0" />
            </Button>
        </Squircle>
    );
}
