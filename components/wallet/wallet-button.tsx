"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from 'next/navigation'
import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { signOutAndClearSnapshots } from "@/lib/auth/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { signInWithSolana } from "@/lib/solana/sign-in";
import { appToast } from "@/components/app-ui/app-toast";
import { Loader2 } from "lucide-react";
import { WalletButtonSkeleton } from "./wallet-button-skeleton";
import { OPEN_WALLET_DRAWER_EVENT, useHeaderWalletLoading } from "./sol-balance-chip";
import "@/lib/types";

// WalletConnectModal + WalletDrawer are interaction-only and HEAVY (the drawer
// pulls swap/send/settings/NFT views + @solana/web3.js + spl-token). Lazy-load
// them so they stay OUT of the initial authenticated bundle — mobile Safari was
// killing the tab on the eager load. They fetch on first hover/click.
// Points at wallet-drawer2 — the redesign copy. The original wallet-drawer/ is
// kept untouched as a reference (same "2" convention as app-header2 /
// global-search2 / sol-balance-chip2).
const WalletDrawer = dynamic(
  () => import("./wallet-drawer2").then((m) => ({ default: m.WalletDrawer })),
  { ssr: false },
);
const WalletConnectModal = dynamic(
  () => import("./wallet-connect-modal").then((m) => ({ default: m.WalletConnectModal })),
  { ssr: false },
);

function shortenWalletAddress(address: string): string {
    if (!address) return "";
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function WalletButtonInner() {
    const router = useRouter();
    const pathname = usePathname();
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    // Lazy-mount gates: don't fetch the drawer/modal chunks until the user shows
    // intent (hover/click), so /home's first load stays light.
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerReady, setDrawerReady] = useState(false);
    const [modalReady, setModalReady] = useState(false);
    const isSigningOut = useRef(false);
    const isAutoSignInTriggered = useRef(false);
    /** True once a real session has been seen on the current wallet connection. */
    const sawSessionRef = useRef(false);

    const { publicKey, connected, connecting, disconnecting, disconnect, signMessage } = useWallet();
    const { data: session, isLoading: loading, isFetching: fetchingSession, isError: sessionError } = useAuthSession();
    // Errored with no answer EVER — unknown, not signed-out. (A later error
    // keeps the previous session as data, so this is only the failed-first-load
    // case; use-auth-session retries it on an interval until an answer lands.)
    const sessionUnknown = sessionError && session === undefined;
    // Shared with the balance chip + Create button so all three header tiles
    // leave their skeletons in the same paint (see useHeaderWalletLoading).
    // `accountAddress`, not `address`: the drawer is the account's wallet hub
    // (its own per-chain rows cover the rest), and its setup CTA keys on this
    // prop being empty. The selection-aware `address` goes undefined when an
    // EVM wallet is picked, which made the drawer offer to GENERATE a wallet
    // to a user who already has one.
    const { loading: headerLoading, accountAddress: walletAddress, selectedEvm } = useHeaderWalletLoading();
    const [isSigningIn, startSigningIn] = useTransition();

    const isSignedIn = !!session?.user;
    // walletAddress comes from the shared hook rather than being resolved here
    // a second time, so the chip, this button and the drawer can't disagree
    // about whose wallet is on screen. The rule it applies (connected extension
    // first, embedded Swig address as the fallback, and a brief wait for
    // autoConnect before choosing) is documented in use-header-wallet.

    const trpcUtils = trpc.useUtils();
    const handlePrefetch = useCallback(() => {
        if (!walletAddress) return;
        trpcUtils.wallet.getWalletAssets.prefetch({ address: walletAddress });
    }, [trpcUtils, walletAddress]);

    // Warm the wallet cache as soon as the session is available — before the user opens the drawer
    useEffect(() => {
        if (walletAddress) {
            trpcUtils.wallet.getWalletAssets.prefetch({ address: walletAddress });
        }
    }, [walletAddress, trpcUtils]);

    const handleConnect = useCallback(() => {
        setModalReady(true);
        setIsModalOpen(true);
    }, []);

    // Header siblings (the SOL balance chip) open the drawer via this event —
    // the drawer state lives here, next to its lazy-mount gates. Users with no
    // linked wallet get the connect modal instead of an empty drawer.
    // Signed-out visitors go to /login, exactly like the Sign In button below:
    // the connect modal offers only the wallet methods, and it used to open
    // here for anyone pressing the empty chip's "Deposit" while signed out.
    useEffect(() => {
        const open = () => {
            if (!isSignedIn && !connected) {
                router.push(`/login?callbackUrl=${encodeURIComponent(pathname || "/home")}`);
            } else if (walletAddress) {
                setDrawerReady(true);
                setDrawerOpen(true);
            } else {
                setModalReady(true);
                setIsModalOpen(true);
            }
        };
        window.addEventListener(OPEN_WALLET_DRAWER_EVENT, open);
        return () => window.removeEventListener(OPEN_WALLET_DRAWER_EVENT, open);
    }, [walletAddress, isSignedIn, connected, router, pathname]);

    const handleSignIn = useCallback(async () => {
        if (!connected || !publicKey) {
            appToast.error("Please connect your wallet first");
            return;
        }

        if (!signMessage) {
            appToast.error("Wallet does not support message signing");
            return;
        }

        startSigningIn(async () => {
            try {
                const result = await signInWithSolana({
                    publicKey,
                    signMessage
                });

                // Invalidate session cache to update all components
                queryClient.invalidateQueries({ queryKey: ["session"] });
                router.refresh();
                appToast.success("Successfully signed in!");
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                if (message.includes("rejected") || message.includes("denied")) {
                    appToast.error("Sign-in cancelled");
                } else if (message.includes("nonce")) {
                    appToast.error("Session expired. Please try again.");
                } else {
                    appToast.error(`Sign-in failed: ${message}`);
                }
            }
        });
    }, [connected, publicKey, queryClient, router, signMessage]);

    const handleSignOut = useCallback(async () => {
        if (isSigningOut.current) return;

        try {
            isSigningOut.current = true;
            await signOutAndClearSnapshots();

            // Invalidate session cache to immediately update UI
            queryClient.invalidateQueries({ queryKey: ["session"] });

            if (disconnect) {
                await disconnect();
            }

            router.refresh();
            appToast.success("Signed out successfully");
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            appToast.error(`Sign-out failed: ${message}`);
        } finally {
            isSigningOut.current = false;
        }
    }, [disconnect, queryClient, router]);

    const handleCopyAddress = useCallback(() => {
        if (walletAddress) {
            navigator.clipboard.writeText(walletAddress);
            appToast.success("Address copied to clipboard");
        }
    }, [walletAddress]);

    const handleChangeWallet = useCallback(() => {
        setModalReady(true);
        setIsModalOpen(true);
    }, []);

    // Auto sign-in when wallet connects.
    //
    // This fires a WALLET SIGNATURE PROMPT, so it must only run when we're
    // certain the user isn't signed in. It wasn't: `loading` is react-query's
    // isLoading, which goes false the moment any value is cached — including a
    // null. So a session refetch that transiently resolved null (window focus
    // is enough, and this query refetches on focus) flipped isSignedIn false
    // while the wallet stayed connected, and this asked a signed-in user to
    // sign. Twice, when the value flapped. Reported 2026-08-05 as "hanging out
    // on home and it asked me to sign in and sign again".
    //
    // Two guards, on top of the original conditions:
    //
    //   fetchingSession — never prompt while the answer is in flight.
    //   sawSessionRef   — once a real session has been observed on THIS
    //                     connection, a later null is a blip, not a sign-out.
    //                     A genuine sign-out disconnects the wallet, which
    //                     clears the latch below.
    useEffect(() => {
        if (session?.user) sawSessionRef.current = true;
    }, [session]);

    useEffect(() => {
        let timer: NodeJS.Timeout | number;

        if (
            connected &&
            !isSignedIn &&
            !loading &&
            !fetchingSession &&
            // Never fire a signature prompt off an ERRORED session read — "we
            // couldn't ask" is not "they're signed out". Same class as the
            // 2026-08-05 report the guards above fixed.
            !sessionUnknown &&
            !sawSessionRef.current &&
            !isSigningIn &&
            !isAutoSignInTriggered.current
        ) {
            isAutoSignInTriggered.current = true;

            timer = setTimeout(() => {
                handleSignIn();
            }, 100);
        }

        if (!connected || isSignedIn) {
            isAutoSignInTriggered.current = false;
        }

        // Disconnecting ends the connection this latch describes, so the next
        // wallet to connect can still be signed in automatically.
        if (!connected) {
            sawSessionRef.current = false;
        }

        return () => {
            if (timer) clearTimeout(timer as any);
        };
    }, [connected, isSignedIn, loading, fetchingSession, sessionUnknown, session, isSigningIn, handleSignIn]);

    const getButtonText = () => {
        if (connecting) return "Connecting...";
        if (isSigningIn) return "Signing In...";
        if (isSigningOut.current || disconnecting) return "Signing Out...";

        if (isSignedIn && walletAddress) return shortenWalletAddress(walletAddress);
        if (isSignedIn) return session?.user?.username || "Account";
        if (connected) return "Sign In";
        return "Sign In";
    };

    const handleButtonClick = () => {
        if (connected && !isSignedIn) {
            // A wallet is already connected — this is the SIWS step, not a
            // choice of method.
            handleSignIn();
        } else if (!connected) {
            // Straight to /login rather than the wallet modal. A signed-out
            // visitor browsing the app most likely has no wallet at all, and
            // /login is the page carrying every method (OAuth, email code,
            // passkey, QR) — the modal offers only the wallet ones. The current
            // path rides along so pressing Sign In returns them to what they
            // were looking at.
            router.push(`/login?callbackUrl=${encodeURIComponent(pathname || "/home")}`);
        }
    };

    // Skeleton whenever we don't yet KNOW, not just on the very first load.
    //
    // isLoading is false the instant any value is cached — including a null —
    // so a session query that resolved null once dropped the button straight to
    // "Sign In" and left it there for the whole staleTime. Holding the skeleton
    // while a refetch is in flight with no user means the worst case is a
    // shimmer for a moment, instead of telling a signed-in person they're
    // signed out.
    //
    // "Sign In" IS reachable now — PUBLIC_BROWSING lets signed-out visitors
    // browse the app (lib/auth/public-browsing.ts), so this button is how they
    // start. What must not happen is showing it to someone who IS signed in
    // while their session is merely still in flight, which is the case above.
    if (loading || headerLoading || sessionUnknown || (fetchingSession && !session?.user)) {
        return <WalletButtonSkeleton />;
    }

    const isProcessing = connecting || disconnecting || isSigningIn || isSigningOut.current;
    const buttonText = getButtonText();

    // Signed-in state: show wallet drawer
    if (isSignedIn) {
        return (
            <>
                {/* Avatar-only trigger — the avatar IS the button (no address
                    text). Plain rounded-full circle (matches the Create button /
                    balance chip); overflow-hidden clips the avatar to the circle.
                    NOTE: intentionally NOT wrapped in <Squircle> — its clip-path
                    would clip the border off, which is why border-baseborder
                    wouldn't render here (it works fine on the non-squircled
                    siblings). */}
                <Button
                    aria-label="Open wallet"
                    className="rounded-full size-11 border border-baseborder/5 p-0 overflow-hidden bg-soft-gray/10 hover:bg-soft-gray/20 backdrop-blur-xs"
                    disabled={isProcessing}
                    onMouseEnter={() => { handlePrefetch(); setDrawerReady(true); }}
                    onClick={() => { setDrawerReady(true); setDrawerOpen(true); }}
                >
                    <Avatar className="size-full rounded-none">
                        <AvatarImage src={session?.user?.avatar_url || undefined} alt={session?.user?.username || "User"} />
                        <AvatarFallback className="bg-transparent text-white/90 font-semibold rounded-none">
                            {(session?.user?.username ?? "?")[0]?.toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                </Button>

                {drawerReady && (
                    <WalletDrawer
                        open={drawerOpen}
                        onOpenChange={setDrawerOpen}
                        username={session?.user?.username || "User"}
                        avatarUrl={session?.user?.avatar_url || ""}
                        walletAddress={walletAddress}
                        inUseEvmAddress={selectedEvm}
                        onSignOut={handleSignOut}
                        onChangeWallet={handleChangeWallet}
                    />
                )}

                {modalReady && (
                    <WalletConnectModal
                        open={isModalOpen}
                        onOpenChange={setIsModalOpen}
                    />
                )}
            </>
        );
    }

    // Not signed in: show regular button
    return (
        <>
            <Button
                onClick={handleButtonClick}
                disabled={isProcessing}
                variant="default"
                className="bg-white text-black h-11 text-base backdrop-blur-xs font-medium hover:bg-white/80 cursor-pointer px-6 gap-3"
            >
                <span>{buttonText}</span>
            </Button>

            {modalReady && (
                <WalletConnectModal
                    open={isModalOpen}
                    onOpenChange={setIsModalOpen}
                />
            )}
        </>
    );
}

// Skip SSR to prevent hydration mismatch: the server-side QueryClient has no session
// pre-populated, causing a loading→signed-in state mismatch during hydration.
// The boneyard Skeleton loading state renders client-only with no server HTML to reconcile.
export default dynamic(() => Promise.resolve(WalletButtonInner), {
    ssr: false,
    // Show the skeleton the instant the chunk starts resolving, so the wallet
    // placeholder appears in lockstep with the header's Create skeleton instead
    // of popping in a frame later.
    loading: () => <WalletButtonSkeleton />,
});
