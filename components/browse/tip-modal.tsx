"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { SendPaperIcon } from "@/components/icons";
import { Squircle } from "@/components/ui/squircle";

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
            <DialogContent className="w-full max-w-sm">
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
                            <SendPaperIcon className="size-3.5 text-black" />
                        </div>
                    </div>
                    <DialogTitle className="text-white">Send SOL to {recipient.name || recipient.username}</DialogTitle>
                    <DialogDescription className="text-zinc-500">Goes straight to their wallet — a one-off, not a subscription.</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-4">
                    {/* Amount panel — same dark card + giant numeral as the wallet drawer's Send flow */}
                    <Squircle asChild radius={24}>
                        <div className="border border-zinc-800/60 bg-[#1b1b1c] px-5 py-5 text-center">
                            <p className="mb-3 text-[13px] font-medium text-zinc-500">You&apos;re sending</p>
                            <div className="flex min-h-[56px] items-center justify-center gap-1">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    value={customSol}
                                    onChange={(e) => handleCustomChange(e.target.value)}
                                    className="max-w-[180px] min-w-[24px] bg-transparent text-center text-[44px] font-semibold leading-none text-white outline-none placeholder-zinc-700 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    style={{ width: `${Math.max(24, (customSol.length || 1) * 26)}px` }}
                                />
                                <span className="text-[20px] font-semibold text-zinc-500">SOL</span>
                            </div>
                        </div>
                    </Squircle>

                    {/* Presets */}
                    <div className="flex justify-between gap-2">
                        {TIP_PRESETS.map((p) => (
                            <Squircle asChild radius={16} key={p.sol}>
                                <button
                                    onClick={() => { setSelectedSol(p.sol); setCustomSol(String(p.sol)); }}
                                    className={cn(
                                        "flex-1 cursor-pointer border py-2.5 text-[13px] font-semibold transition-all",
                                        selectedSol === p.sol
                                            ? "border-white bg-white text-black"
                                            : "border-zinc-800/50 bg-zinc-900/40 text-zinc-400 hover:border-zinc-700 hover:text-white",
                                    )}
                                >
                                    {p.label}
                                </button>
                            </Squircle>
                        ))}
                    </div>

                    {finalSol > 100 && (
                        <p className="text-center text-xs font-semibold text-red-400">Maximum is 100 SOL</p>
                    )}

                    <button
                        onClick={handleSend}
                        disabled={!isValid || sending}
                        className="flex h-16 w-full items-center justify-center gap-2 rounded-full bg-white text-base font-bold text-black transition-all hover:bg-zinc-100 active:scale-[0.98] disabled:opacity-50"
                    >
                        {sending ? (
                            <><Loader2 className="size-4 animate-spin" /> Sending…</>
                        ) : (
                            <><SendPaperIcon className="size-4" /> Send {finalSol > 0 ? `${finalSol} SOL` : ""}</>
                        )}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
