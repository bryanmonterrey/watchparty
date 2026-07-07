"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from 'next/navigation'
import { useWallet } from "@solana/wallet-adapter-react";
import { useQueryClient } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { authClient } from "@/lib/auth/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { signInWithSolana } from "@/lib/solana/sign-in";
import { appToast } from "@/components/app-ui/app-toast";
import { Loader2 } from "lucide-react";
import { WalletButtonSkeleton } from "./wallet-button-skeleton";
import { Squircle } from "@/components/ui/squircle";
import { OPEN_WALLET_DRAWER_EVENT, useHeaderWalletLoading } from "./sol-balance-chip";
import "@/lib/types";

// WalletConnectModal + WalletDrawer are interaction-only and HEAVY (the drawer
// pulls swap/send/settings/NFT views + @solana/web3.js + spl-token). Lazy-load
// them so they stay OUT of the initial authenticated bundle — mobile Safari was
// killing the tab on the eager load. They fetch on first hover/click.
const WalletDrawer = dynamic(
  () => import("./wallet-drawer").then((m) => ({ default: m.WalletDrawer })),
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
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    // Lazy-mount gates: don't fetch the drawer/modal chunks until the user shows
    // intent (hover/click), so /home's first load stays light.
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [drawerReady, setDrawerReady] = useState(false);
    const [modalReady, setModalReady] = useState(false);
    const isSigningOut = useRef(false);
    const isAutoSignInTriggered = useRef(false);

    const { publicKey, connected, connecting, disconnecting, disconnect, signMessage } = useWallet();
    const { data: session, isLoading: loading } = useAuthSession();
    // Shared with the balance chip + Create button so all three header tiles
    // leave their skeletons in the same paint (see useHeaderWalletLoading).
    const { loading: headerLoading } = useHeaderWalletLoading();
    const [isSigningIn, startSigningIn] = useTransition();

    const isSignedIn = !!session?.user;
    const walletAddress = session?.user?.wallet_address;

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
    useEffect(() => {
        const open = () => {
            if (walletAddress) {
                setDrawerReady(true);
                setDrawerOpen(true);
            } else {
                setModalReady(true);
                setIsModalOpen(true);
            }
        };
        window.addEventListener(OPEN_WALLET_DRAWER_EVENT, open);
        return () => window.removeEventListener(OPEN_WALLET_DRAWER_EVENT, open);
    }, [walletAddress]);

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
            await authClient.signOut();

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

    // Auto sign-in when wallet connects
    useEffect(() => {
        let timer: NodeJS.Timeout | number;

        if (
            connected &&
            !isSignedIn &&
            !loading &&
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

        return () => {
            if (timer) clearTimeout(timer as any);
        };
    }, [connected, isSignedIn, loading, isSigningIn, handleSignIn]);

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
            handleSignIn();
        } else if (!connected) {
            handleConnect();
        }
    };

    if ((loading && session === undefined) || headerLoading) {
        return <WalletButtonSkeleton />;
    }

    const isProcessing = connecting || disconnecting || isSigningIn || isSigningOut.current;
    const buttonText = getButtonText();

    // Signed-in state: show wallet drawer
    if (isSignedIn) {
        return (
            <>
                {/* Avatar-only trigger — the avatar IS the button (no address
                    text). Squircle clip defines the shape, so the avatar's own
                    rounding is disabled and it fills the tile edge-to-edge. */}
                <Squircle asChild radius={16} autoEffects={false}>
                    <Button
                        variant="outline"
                        aria-label="Open wallet"
                        className="rounded-none border-none size-11 p-0 overflow-hidden bg-[#6A6A6A]/35 hover:bg-[#6A6A6A]/50 backdrop-blur-xs"
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
                </Squircle>

                {drawerReady && (
                    <WalletDrawer
                        open={drawerOpen}
                        onOpenChange={setDrawerOpen}
                        username={session?.user?.username || "User"}
                        avatarUrl={session?.user?.avatar_url || ""}
                        walletAddress={walletAddress}
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
                className="bg-twitter2 text-white2 h-11 text-[18px] backdrop-blur-xs font-medium hover:bg-twitter cursor-pointer px-6 gap-3"
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
