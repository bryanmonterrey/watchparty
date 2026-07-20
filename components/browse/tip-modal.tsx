"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useAuthSession } from "@/hooks/use-auth-session";
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

export function TipModal({ open, onOpenChange, recipient }: TipModalProps) {
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
            <DialogContent className="w-full max-w-sm border-none ring-1 ring-white/10">
                <DialogHeader className="items-center text-center">
                    <div className="relative mb-2">
                        <div className="size-16 overflow-hidden rounded-full bg-zinc-800 ring-4 ring-lantern/15">
                            {recipient.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={recipient.avatar_url} alt={recipient.name ?? ""} className="size-full object-cover" />
                            ) : (
                                <div className="flex size-full items-center justify-center text-xl font-bold text-zinc-400">
                                    {(recipient.name ?? recipient.username ?? "?")[0]?.toUpperCase()}
                                </div>
                            )}
                        </div>
                        <div className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-lantern">
                            <Zap className="size-3.5 text-black" />
                        </div>
                    </div>
                    <DialogTitle className="text-white">Tip {recipient.name || recipient.username}</DialogTitle>
                    <DialogDescription className="text-zinc-500">Sends SOL directly to their wallet — a one-off thank-you, not a subscription.</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    {/* Presets */}
                    <div className="grid grid-cols-4 gap-2">
                        {TIP_PRESETS.map((p) => (
                            <button
                                key={p.sol}
                                onClick={() => { setSelectedSol(p.sol); setCustomSol(""); }}
                                className={cn(
                                    "flex h-14 flex-col items-center justify-center rounded-2xl border text-sm font-bold transition-colors",
                                    selectedSol === p.sol
                                        ? "border-lantern/50 bg-lantern/10 text-lantern"
                                        : "border-white/10 text-zinc-300 hover:border-white/25",
                                )}
                            >
                                {p.label}
                                <span className="mt-0.5 text-[10px] font-semibold text-zinc-500">SOL</span>
                            </button>
                        ))}
                    </div>

                    {/* Custom amount */}
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-500">◎</span>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Custom amount"
                            value={customSol}
                            onChange={(e) => handleCustomChange(e.target.value)}
                            className="h-11 w-full rounded-full border border-white/10 bg-zinc-900 pl-9 pr-4 text-center text-sm text-zinc-100 placeholder:text-zinc-600 transition-colors focus:border-lantern/50 focus:outline-none"
                        />
                    </div>

                    {finalSol > 100 && (
                        <p className="text-center text-xs font-semibold text-red-400">Maximum tip is 100 SOL</p>
                    )}

                    <button
                        onClick={handleSend}
                        disabled={!isValid || sending}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-lantern text-sm font-bold text-black transition-colors hover:bg-lantern/90 disabled:opacity-50"
                    >
                        {sending ? (
                            <><Loader2 className="size-4 animate-spin" /> Sending…</>
                        ) : (
                            <><Zap className="size-4" /> Send {finalSol > 0 ? `${finalSol} SOL` : ""}</>
                        )}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
