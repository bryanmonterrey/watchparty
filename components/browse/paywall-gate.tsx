"use client";

import { useLoginRedirect } from "@/hooks/use-login-redirect";
import { useState } from "react";
import { Lock, Unlock, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWalletSigning } from "@/hooks/use-wallet-signing";

interface PaywallGateProps {
    postId: string;
    paywallPrice: number; // lamports
    authorWalletAddress: string | null;
    onUnlocked: () => void;
}

export function PaywallGate({ postId, paywallPrice, authorWalletAddress, onUnlocked }: PaywallGateProps) {
    const [unlocking, setUnlocking] = useState(false);
    const { data: session } = useAuthSession();
    const goToLogin = useLoginRedirect();
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const unlockPost = trpc.content.unlockPost.useMutation({ onSuccess: onUnlocked });
    const { signAndSubmit: signAndSend } = useWalletSigning();

    const solPrice = paywallPrice / LAMPORTS_PER_SOL;

    const handleUnlock = async () => {
        if (!session?.user) { goToLogin(); return; }
        if (!authorWalletAddress) { toast.error("This creator has no wallet on file to receive payment"); return; }
        setUnlocking(true);
        try {
            const custodialAddress = session.user.wallet_address;
            const fromPubkey = custodialAddress ? new PublicKey(custodialAddress) : publicKey;
            if (!fromPubkey) { toast.error("Connect a wallet to unlock"); setUnlocking(false); return; }

            const { blockhash } = await connection.getLatestBlockhash();
            const tx = new Transaction();
            tx.recentBlockhash = blockhash;
            tx.feePayer = fromPubkey;
            tx.add(SystemProgram.transfer({
                fromPubkey,
                toPubkey: new PublicKey(authorWalletAddress),
                lamports: paywallPrice,
            }));

            let txSignature: string;
            if (custodialAddress) {
                const serialized = Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
                const result = await signAndSend({ transaction: serialized });
                txSignature = result.signature;
            } else {
                txSignature = await sendTransaction(tx, connection);
                await connection.confirmTransaction(txSignature, "confirmed");
            }

            await unlockPost.mutateAsync({ postId, txSignature });
            toast.success("Post unlocked!");
        } catch (err: any) {
            toast.error(err?.message ?? "Failed to unlock post");
        } finally {
            setUnlocking(false);
        }
    };

    return (
        <div className="mb-3 rounded-2xl border border-white/10 bg-zinc-900/60 p-6 flex flex-col items-center gap-3 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                <Lock className="w-5 h-5 text-zinc-400" />
            </div>
            <div>
                <p className="text-sm font-semibold text-zinc-200 mb-0.5">Pay-per-view content</p>
                <p className="text-xs text-zinc-500">Unlock for {solPrice} SOL to view this post</p>
            </div>
            <button
                onClick={handleUnlock}
                disabled={unlocking}
                className={cn(
                    "flex items-center gap-2 px-5 py-2 rounded-full text-sm font-bold transition-colors",
                    "bg-lantern text-black hover:bg-lantern/90 disabled:opacity-60"
                )}
            >
                {unlocking ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Unlocking…</>
                ) : (
                    <><Unlock className="w-4 h-4" /> Unlock for {solPrice} SOL</>
                )}
            </button>
        </div>
    );
}
