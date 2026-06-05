"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";
import { useWalletSigning } from "@/hooks/use-wallet-signing";

const TIP_PRESETS = [
    { sol: 0.01, label: "0.01" },
    { sol: 0.05, label: "0.05" },
    { sol: 0.1,  label: "0.1"  },
    { sol: 0.5,  label: "0.5"  },
];

interface TipModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    recipient: {
        id: string;
        name: string | null;
        username: string | null;
        avatar_url: string | null;
        wallet_address: string | null;
    };
    postId?: string;
}

export function TipModal({ open, onOpenChange, recipient, postId }: TipModalProps) {
    const [selectedSol, setSelectedSol] = useState<number | null>(null);
    const [customSol, setCustomSol] = useState("");
    const [sending, setSending] = useState(false);

    const { data: session } = useAuthSession();
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const { signAndSubmit: signAndSend } = useWalletSigning();

    const finalSol = selectedSol ?? (customSol ? parseFloat(customSol) : 0);
    const lamports = Math.floor(finalSol * LAMPORTS_PER_SOL);
    const isValid = finalSol > 0 && finalSol <= 100 && !isNaN(finalSol);

    const handleSend = async () => {
        if (!isValid) return;
        if (!session?.user) { toast.error("Sign in to send a tip"); return; }
        if (!recipient.wallet_address) { toast.error("Recipient has no wallet"); return; }

        setSending(true);
        try {
            const custodialAddress = session.user.wallet_address;
            const fromPubkey = custodialAddress ? new PublicKey(custodialAddress) : publicKey;
            if (!fromPubkey) { toast.error("Connect a wallet to tip"); return; }

            const { blockhash } = await connection.getLatestBlockhash();
            const tx = new Transaction();
            tx.recentBlockhash = blockhash;
            tx.feePayer = fromPubkey;
            tx.add(SystemProgram.transfer({
                fromPubkey,
                toPubkey: new PublicKey(recipient.wallet_address),
                lamports,
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

            toast.success(`Tipped ${finalSol} SOL to ${recipient.name || recipient.username}!`);
            onOpenChange(false);
            setSelectedSol(null);
            setCustomSol("");
        } catch (err: any) {
            toast.error(err?.message ?? "Failed to send tip");
        } finally {
            setSending(false);
        }
    };

    const handleCustomChange = (val: string) => {
        setCustomSol(val.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"));
        setSelectedSol(null);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm bg-zinc-950 border border-white/10">
                <DialogHeader className="text-center items-center">
                    <div className="relative mb-3">
                        <div className="w-16 h-16 rounded-full bg-zinc-800 overflow-hidden ring-4 ring-lantern/20">
                            {recipient.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={recipient.avatar_url} alt={recipient.name ?? ""} className="object-cover w-full h-full" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-400 text-xl font-bold">
                                    {(recipient.name ?? recipient.username ?? "?")[0]?.toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-lantern flex items-center justify-center">
                            <Zap className="w-3.5 h-3.5 text-black" />
                        </div>
                    </div>
                    <DialogTitle className="text-zinc-100">Tip {recipient.name || recipient.username}</DialogTitle>
                    <DialogDescription className="text-zinc-500">Send SOL directly to their wallet</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Presets */}
                    <div className="grid grid-cols-4 gap-2">
                        {TIP_PRESETS.map((p) => (
                            <button
                                key={p.sol}
                                onClick={() => { setSelectedSol(p.sol); setCustomSol(""); }}
                                className={cn(
                                    "flex flex-col items-center justify-center py-3 rounded-xl border-2 transition-all text-sm font-bold",
                                    selectedSol === p.sol
                                        ? "border-lantern bg-lantern/10 text-lantern"
                                        : "border-white/10 text-zinc-300 hover:border-white/25"
                                )}
                            >
                                {p.label}
                                <span className="text-[10px] font-normal text-zinc-500 mt-0.5">SOL</span>
                            </button>
                        ))}
                    </div>

                    {/* Custom amount */}
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm font-bold">◎</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Custom amount"
                            value={customSol}
                            onChange={(e) => handleCustomChange(e.target.value)}
                            className="w-full pl-8 pr-4 py-2.5 rounded-xl bg-zinc-900 border border-white/10 text-zinc-100 text-sm text-center placeholder:text-zinc-600 focus:outline-none focus:border-lantern/50 transition-colors"
                        />
                    </div>

                    {finalSol > 100 && (
                        <p className="text-xs text-red-400 text-center">Maximum tip is 100 SOL</p>
                    )}

                    <button
                        onClick={handleSend}
                        disabled={!isValid || sending}
                        className="w-full py-2.5 rounded-full bg-lantern text-black text-sm font-bold flex items-center justify-center gap-2 hover:bg-lantern/90 disabled:opacity-50 transition-colors"
                    >
                        {sending ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                        ) : (
                            <><Zap className="w-4 h-4" /> Send {finalSol > 0 ? `${finalSol} SOL` : ""}</>
                        )}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
