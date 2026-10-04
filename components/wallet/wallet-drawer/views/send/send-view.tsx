"use client";

import * as React from "react";
import { confirmSignature } from "@/lib/solana/confirm";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
    PublicKey,
    SystemProgram,
    Transaction,
    LAMPORTS_PER_SOL,
    ComputeBudgetProgram,
} from "@solana/web3.js";
import { ArrowLeft } from "lucide-react";
import { showSendToast } from "./send-transaction-toast";
import { trpc } from "@/lib/trpc/client";
import { motion } from "framer-motion";
import { SendAmountInput } from "./send-amount-input";
import { RecentRecipient } from "./send-recipient";
import { SendToken } from "./send-token-selector";
import { SendRecipientSelector } from "./send-recipient-selector";
import { ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { getRecommendedMicrolamports } from "@/lib/solana/priority-fees";

const RECENTS_KEY = "send_recents_v1";
const MAX_RECENTS = 10;
import { toPublicKey } from "@/lib/solana/pubkey";

import { PLATFORM_FEE_BPS } from "@/lib/chains/fee-bps";
import { formatUsd } from "@/lib/utils";

const TREASURY = new PublicKey(process.env.NEXT_PUBLIC_TREASURY_PUBKEY!);

function loadRecents(): RecentRecipient[] {
    try {
        const raw = localStorage.getItem(RECENTS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function saveRecent(
    existing: RecentRecipient[],
    address: string,
    display?: { username?: string; name?: string; avatar_url?: string }
): RecentRecipient[] {
    const idx = existing.findIndex((r) => r.address === address);
    const now = Date.now();
    let updated: RecentRecipient[];
    if (idx >= 0) {
        updated = [...existing];
        updated[idx] = {
            ...updated[idx],
            ...display,
            sendCount: updated[idx].sendCount + 1,
            lastSentAt: now,
        };
    } else {
        updated = [
            { address, ...display, sendCount: 1, lastSentAt: now },
            ...existing,
        ].slice(0, MAX_RECENTS);
    }
    localStorage.setItem(RECENTS_KEY, JSON.stringify(updated));
    return updated;
}

// ─────────────────────────────────────────────────────────────────────────────

interface SendViewProps {
    walletAddress: string;
    tokens: SendToken[];
    onBack: () => void;
    solPrice?: number | null;
}

function isValidSolanaAddress(addr: string): boolean {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr.trim());
}

export function SendView({
    walletAddress: custodialWalletAddress,
    tokens,
    onBack,
    solPrice,
}: SendViewProps) {
    const { connection } = useConnection();
    const { publicKey: adapterPublicKey, sendTransaction } = useWallet();
    const { signAndSubmit: signAndSendCustodialTx } = useWalletSigning();
    const trpcUtils = trpc.useUtils();

    const activePublicKeyStr = adapterPublicKey?.toBase58() || custodialWalletAddress;
    const publicKey = toPublicKey(activePublicKeyStr);

    const solToken = tokens.find((t) => t.mint === "So11111111111111111111111111111111111111111") ?? tokens[0] ?? null;
    const [selectedToken, setSelectedToken] = React.useState<SendToken | null>(solToken);
    const [tokenAmount, setTokenAmount] = React.useState("");
    const [usdAmount, setUsdAmount] = React.useState("");
    const [inputMode, setInputMode] = React.useState<"usd" | "token">("usd");

    // Recipient: resolved address + what the input shows
    const [recipient, setRecipient] = React.useState("");
    const [recipientDisplay, setRecipientDisplay] = React.useState("");
    // Metadata for recents (populated when user is selected from dropdown)
    const [recipientMeta, setRecipientMeta] = React.useState<{ username?: string; name?: string; avatar_url?: string } | undefined>();

    const [isSending, setIsSending] = React.useState(false);
    const [recents, setRecents] = React.useState<RecentRecipient[]>([]);
    const [recipientSelectorOpen, setRecipientSelectorOpen] = React.useState(false);

    React.useEffect(() => {
        setRecents(loadRecents());
    }, []);

    React.useEffect(() => {
        if (!selectedToken && tokens.length > 0) setSelectedToken(tokens[0]);
    }, [tokens, selectedToken]);

    const currentPrice =
        selectedToken?.usdValue && selectedToken.balance > 0
            ? selectedToken.usdValue / selectedToken.balance
            : selectedToken?.symbol === "SOL" && solPrice
                ? solPrice
                : undefined;

    const handleTokenAmountChange = (val: string) => {
        setTokenAmount(val);
        const n = parseFloat(val);
        if (!isNaN(n) && currentPrice) setUsdAmount((n * currentPrice).toFixed(2));
        else setUsdAmount("");
    };

    const handleUsdAmountChange = (val: string) => {
        setUsdAmount(val);
        const n = parseFloat(val);
        if (!isNaN(n) && currentPrice)
            setTokenAmount((n / currentPrice).toFixed(selectedToken?.decimals ?? 6));
        else setTokenAmount("");
    };

    const handleRecipientChange = (address: string, display: string, meta?: { username?: string; name?: string; avatar_url?: string }) => {
        setRecipient(address);
        setRecipientDisplay(display);
        if (meta) setRecipientMeta(meta);
        else setRecipientMeta(undefined);
    };

    const handleRecipientSelect = ({ address, display, username, name, avatar_url }: { address: string; display: string; username?: string; name?: string; avatar_url?: string }) => {
        handleRecipientChange(address, display, { username, name, avatar_url });
    };

    const parsedTokenAmount = parseFloat(tokenAmount);
    const hasAmount = !isNaN(parsedTokenAmount) && parsedTokenAmount > 0;
    const hasValidRecipient = isValidSolanaAddress(recipient);
    const canSend = hasAmount && hasValidRecipient && !isSending && !!selectedToken;

    const handleSend = async () => {
        if (!publicKey || !connection || !selectedToken) return;
        if (!recipient || !hasAmount) return;

        const sendToast = showSendToast({
            tokenSymbol: selectedToken.symbol,
            tokenIcon: selectedToken.icon,
            amount: tokenAmount,
            recipientDisplay: recipientDisplay || recipient.slice(0, 4) + "..." + recipient.slice(-4),
        });

        try {
            setIsSending(true);
            const recipientPubkey = new PublicKey(recipient.trim());
            const lamports = Math.floor(parsedTokenAmount * LAMPORTS_PER_SOL);
            const feeLamports = Math.max(1, Math.floor(lamports * PLATFORM_FEE_BPS / 10000));
            const microLamports = await getRecommendedMicrolamports([publicKey.toBase58()]);
            const transaction = new Transaction().add(
                ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
                ComputeBudgetProgram.setComputeUnitLimit({ units: 900 }),
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: recipientPubkey,
                    lamports,
                }),
                SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: TREASURY,
                    lamports: feeLamports,
                }),
            );

            let signature: string;

            if (adapterPublicKey) {
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
                transaction.recentBlockhash = blockhash;
                transaction.feePayer = publicKey;
                signature = await sendTransaction(transaction, connection);
                await confirmSignature(connection, { signature, blockhash, lastValidBlockHeight }, "confirmed");
            } else if (custodialWalletAddress) {
                // Don't bake a blockhash here — the server refreshes it right before signing
                // to avoid expiry during Swig/FROST session creation.
                transaction.recentBlockhash = "11111111111111111111111111111111";
                transaction.feePayer = publicKey;
                const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
                const result = await signAndSendCustodialTx({
                    transaction: serialized.toString("base64"),
                });
                signature = result.signature;
                // Confirm using a fresh blockhash — the old one is stale by now.
                const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
                await confirmSignature(connection, { signature, blockhash, lastValidBlockHeight }, "confirmed");
            } else {
                throw new Error("No wallet connected");
            }
            sendToast.success(signature);

            // Immediately refresh balance — don't wait for the 15s poll
            trpcUtils.wallet.getWalletAssets.invalidate();
            trpcUtils.wallet.getTransactions.invalidate();

            // Save to recents
            const updated = saveRecent(recents, recipient, recipientMeta);
            setRecents(updated);

            // Reset
            setRecipient("");
            setRecipientDisplay("");
            setRecipientMeta(undefined);
            setTokenAmount("");
            setUsdAmount("");
        } catch (error) {
            console.error("Send error:", error);
            const msg = error instanceof Error ? error.message : undefined;
            const friendly = msg?.includes("block height exceeded")
                ? "Transaction dropped — network congestion. Please try again."
                : msg;
            sendToast.error(friendly);
        } finally {
            setIsSending(false);
        }
    };

    const buttonLabel = isSending
        ? "Sending..."
        : !hasAmount
            ? "Enter an amount"
            : !hasValidRecipient
                ? "Enter a recipient"
                : `Send ${selectedToken?.symbol ?? ""}`;

    return (
        <motion.div
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="flex flex-col h-full"
        >
            {/* Header */}
            <div className="px-5 pt-5 pb-4 flex items-center relative flex-shrink-0">
                <button
                    onClick={onBack}
                    className="cursor-pointer p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors -ml-1 z-10"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-[18px] font-semibold text-white absolute left-0 right-0 text-center pointer-events-none">
                    Send
                </span>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto h-full overflow-x-hidden px-4 space-y-2.5 pb-4">
                <SendAmountInput
                    token={selectedToken}
                    tokens={tokens}
                    tokenAmount={tokenAmount}
                    usdAmount={usdAmount}
                    inputMode={inputMode}
                    onTokenChange={(t) => { setSelectedToken(t); setTokenAmount(""); setUsdAmount(""); }}
                    onTokenAmountChange={handleTokenAmountChange}
                    onUsdAmountChange={handleUsdAmountChange}
                    onToggleMode={() => setInputMode((p) => (p === "usd" ? "token" : "usd"))}
                    solPrice={solPrice}
                />

                {/* Recipient trigger card */}
                <button
                    onClick={() => setRecipientSelectorOpen(true)}
                    className="cursor-pointer w-full bg-[#1b1b1c] border border-zinc-800/60 rounded-[24px] px-5 py-4 flex items-center gap-3 hover:border-zinc-700/60 transition-colors text-left"
                >
                    {recipient ? (
                        recipientMeta?.avatar_url ? (
                            <Avatar className="w-9 h-9 flex-shrink-0">
                                <AvatarImage src={recipientMeta.avatar_url} />
                                <AvatarFallback className="bg-zinc-700 text-[11px]">
                                   
                                </AvatarFallback>
                            </Avatar>
                        ) : (
                            <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                <span className="text-[11px] font-bold text-zinc-400">◎</span>
                            </div>
                        )
                    ) : null}
                    <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-zinc-500 mb-0.5">To</p>
                        {recipient ? (
                            <p className="text-[14px] font-semibold text-white truncate">{recipientDisplay}</p>
                        ) : (
                            <p className="text-[14px] font-medium text-zinc-600">@username or wallet address</p>
                        )}
                    </div>
                    <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                </button>

                <SendRecipientSelector
                    open={recipientSelectorOpen}
                    onClose={() => setRecipientSelectorOpen(false)}
                    onSelect={handleRecipientSelect}
                    recents={recents}
                />

                {/* Fee line — in dollars, with token units only as a fallback.
                    A percentage of value means nothing quoted in sats. */}
                {hasAmount && (
                    <p className="text-center text-[12px] text-zinc-500">
                        {PLATFORM_FEE_BPS / 100}% platform fee ·{" "}
                        {currentPrice
                            ? formatUsd(((parsedTokenAmount * PLATFORM_FEE_BPS) / 10000) * currentPrice)
                            : `${((parsedTokenAmount * PLATFORM_FEE_BPS) / 10000).toFixed(6)} ${selectedToken?.symbol ?? "SOL"}`}
                    </p>
                )}

                {/* Send button */}
                <button
                    onClick={handleSend}
                    disabled={!canSend}
                    className={`cursor-pointer w-full py-4 rounded-full font-semibold text-lg transition-all flex items-center justify-center gap-2 ${canSend
                            ? "bg-white text-black hover:bg-zinc-100 active:scale-[0.98]"
                            : "bg-zinc-800/60 text-zinc-500 cursor-not-allowed"
                        }`}
                >
                    {buttonLabel}
                </button>
            </div>
        </motion.div>
    );
}
