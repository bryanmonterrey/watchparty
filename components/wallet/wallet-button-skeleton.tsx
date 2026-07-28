/**
 * Standalone wallet-button loading placeholder.
 *
 * Kept in its own module — free of the heavy `@solana/wallet-adapter-react`
 * imports that `wallet-button.tsx` pulls in — so the header can render it
 * server-side without dragging the wallet SDK into the initial bundle. Used as
 * both the header's pre-mount placeholder and the dynamic import's `loading`
 * fallback, so the wallet skeleton appears in lockstep with the Create skeleton.
 *
 * Shape matches the loaded button exactly: the signed-in wallet trigger is a
 * 52px CIRCLE filled edge-to-edge by the avatar (wallet-button.tsx), so this is
 * a circle with a full-bleed shimmer — no Squircle, no <Button> (whose disabled
 * opacity-50 dimmed the tile below the real one). Every (app) route is
 * session-guarded, so signed-in is the state this always resolves into.
 */
export function WalletButtonSkeleton() {
    return (
        <div
            aria-hidden
            className="size-[52px] overflow-hidden rounded-full border border-baseborder/5 bg-soft-gray/10 backdrop-blur-xs"
        >
            <div className="size-full rounded-full shimmer-skeleton" />
        </div>
    );
}
