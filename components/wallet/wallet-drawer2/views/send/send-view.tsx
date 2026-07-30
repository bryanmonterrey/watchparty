"use client";

import * as React from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
    PublicKey,
    SystemProgram,
    Transaction,
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
import { getChainOrDefault } from "@/lib/chains/registry";
import { validateAddressFormat } from "@/lib/chains/address";
import { toBaseUnits } from "@/lib/chains/amounts";
import type { ChainId } from "@/lib/chains/types";

const RECENTS_KEY = "send_recents_v1";
const MAX_RECENTS = 10;
import { toPublicKey } from "@/lib/solana/pubkey";

const TREASURY = new PublicKey(process.env.NEXT_PUBLIC_TREASURY_PUBKEY!);
const PLATFORM_FEE_BPS = 50; // 0.5%
const SOL_MINT = "So11111111111111111111111111111111111111111";

/**
 * A row in the aggregated list is a native coin when it has no contract — the
 * list synthesizes `native:<chain>` for those, and SOL keeps its wrapped mint
 * as its id. Everything else is a token contract to transfer.
 */
function contractOf(token: SendToken): string | undefined {
    if (token.mint === SOL_MINT || token.mint.startsWith("native:")) return undefined;
    return token.mint;
}

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
    /** Asset to open on — set when Send is reached from a specific token. */
    initialToken?: SendToken;
}

export function SendView({
    walletAddress: custodialWalletAddress,
    tokens,
    onBack,
    solPrice,
    initialToken,
}: SendViewProps) {
    const { connection } = useConnection();
    const { publicKey: adapterPublicKey, sendTransaction } = useWallet();
    const { signAndSubmit: signAndSendCustodialTx } = useWalletSigning();
    const trpcUtils = trpc.useUtils();

    const activePublicKeyStr = adapterPublicKey?.toBase58() || custodialWalletAddress;
    const publicKey = toPublicKey(activePublicKeyStr);
    const sendOnChain = trpc.wallet.sendOnChain.useMutation();

    const solToken = tokens.find((t) => t.mint === SOL_MINT) ?? tokens[0] ?? null;
    const [selectedToken, setSelectedToken] = React.useState<SendToken | null>(initialToken ?? solToken);
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
        // Capped below the asset's precision on purpose: an 18-decimal token
        // would otherwise fill the input with noise, and fewer decimals always
        // converts cleanly.
        if (!isNaN(n) && currentPrice)
            setTokenAmount((n / currentPrice).toFixed(Math.min(sendDecimals, 8)));
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

    // Which network this send happens on, and therefore which of the three
    // paths below moves it. Solana rows are tagged "solana" upstream; a missing
    // tag can only be a Solana row from before the list was aggregated.
    const sendChain: ChainId = selectedToken?.chain ?? "solana";
    const chainConfig = getChainOrDefault(sendChain);
    const isSolanaSend = chainConfig.kind === "solana";
    const contract = selectedToken ? contractOf(selectedToken) : undefined;
    const isNativeSend = !contract;

    // Native SOL is pinned to 9 rather than trusting the row's decimals —
    // lamports are not negotiable, and this used to be a hardcoded
    // LAMPORTS_PER_SOL. Everything else moves at its own precision.
    const sendDecimals = isSolanaSend && isNativeSend ? 9 : (selectedToken?.decimals ?? 0);

    const parsedTokenAmount = parseFloat(tokenAmount);
    const hasAmount = !isNaN(parsedTokenAmount) && parsedTokenAmount > 0;
    // Precision is checked here rather than at send time: typing more decimals
    // than the asset has must block the button, not throw mid-transaction.
    const amountFitsDecimals =
        !hasAmount ||
        (() => {
            try {
                return toBaseUnits(tokenAmount, sendDecimals) > BigInt(0);
            } catch {
                return false;
            }
        })();
    const overBalance = hasAmount && !!selectedToken && parsedTokenAmount > selectedToken.balance;
    const hasValidRecipient = !!recipient && validateAddressFormat(sendChain, recipient);
    const canSend =
        hasAmount &&
        amountFitsDecimals &&
        !overBalance &&
        hasValidRecipient &&
        !isSending &&
        !!selectedToken;

    // A recipient is only meaningful for the chain it was entered for. Switching
    // from SOL to Base USDC must not carry a Solana address into an EVM send.
    const recipientChainRef = React.useRef(sendChain);
    React.useEffect(() => {
        if (recipientChainRef.current === sendChain) return;
        const previous = getChainOrDefault(recipientChainRef.current);
        recipientChainRef.current = sendChain;
        // Same address kind (all five EVM chains) stays valid — clearing it
        // there would just be annoying.
        if (previous.kind === chainConfig.kind) return;
        setRecipient("");
        setRecipientDisplay("");
        setRecipientMeta(undefined);
    }, [sendChain, chainConfig.kind]);

    // Gas quote for the chains that go through sendOnChain. Solana's fee is a
    // handful of lamports and already priced into the priority-fee helper.
    const { data: feeQuote } = trpc.wallet.estimateChainFee.useQuery(
        {
            chain: sendChain,
            to: recipient,
            amount: hasAmount && amountFitsDecimals
                ? toBaseUnits(tokenAmount, sendDecimals).toString()
                : "0",
            contract,
        },
        {
            enabled: !isSolanaSend && hasValidRecipient && hasAmount && amountFitsDecimals,
            staleTime: 15_000,
            retry: false,
        }
    );

    /**
     * Solana transfer for the selected asset — native SOL or an SPL token.
     *
     * The token branch is the whole reason this function exists: before it, every
     * send built a SystemProgram.transfer of `amount * LAMPORTS_PER_SOL`, so
     * picking USDC and sending 25 moved 25 SOL.
     */
    const buildSolanaTransaction = async (recipientPubkey: PublicKey, amount: bigint) => {
        const microLamports = await getRecommendedMicrolamports([publicKey!.toBase58()]);
        const transaction = new Transaction().add(
            ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
            // 900 covers two system transfers. The token path can carry up to two
            // idempotent account creations plus two transfers, so it needs room —
            // a limit below what the tx actually burns fails the whole transfer.
            ComputeBudgetProgram.setComputeUnitLimit({ units: contract ? 120_000 : 900 }),
        );

        if (!contract) {
            const lamports = Number(amount);
            transaction.add(
                SystemProgram.transfer({ fromPubkey: publicKey!, toPubkey: recipientPubkey, lamports }),
                SystemProgram.transfer({
                    fromPubkey: publicKey!,
                    toPubkey: TREASURY,
                    lamports: Math.max(1, Math.floor((lamports * PLATFORM_FEE_BPS) / 10000)),
                }),
            );
            return transaction;
        }

        // Loaded on click, not on drawer open — spl-token is dead weight for the
        // SOL path and for everyone who never opens Send.
        const spl = await import("@solana/spl-token");
        const mint = new PublicKey(contract);

        // Token-2022 mints live under a different program, and deriving their ATA
        // against the classic one silently produces an address that doesn't exist.
        // The mint account's owner is the authority on which program it is.
        const mintInfo = await connection.getAccountInfo(mint);
        if (!mintInfo) throw new Error("Token mint not found on Solana");
        const tokenProgram = mintInfo.owner;

        // Both owners can be off-curve: the account wallet is a Swig PDA, and so
        // is any recipient who signed up here.
        const fromAta = spl.getAssociatedTokenAddressSync(mint, publicKey!, true, tokenProgram);
        const toAta = spl.getAssociatedTokenAddressSync(mint, recipientPubkey, true, tokenProgram);

        transaction.add(
            spl.createAssociatedTokenAccountIdempotentInstruction(
                publicKey!, toAta, recipientPubkey, mint, tokenProgram,
            ),
            spl.createTransferInstruction(fromAta, toAta, publicKey!, amount, [], tokenProgram),
        );

        // The 0.5% fee rides in the token being sent. Skipped when it floors to
        // nothing — creating a treasury account for zero units would charge the
        // sender rent to move dust.
        const feeUnits = (amount * BigInt(PLATFORM_FEE_BPS)) / BigInt(10_000);
        if (feeUnits > BigInt(0)) {
            const treasuryAta = spl.getAssociatedTokenAddressSync(mint, TREASURY, true, tokenProgram);
            transaction.add(
                spl.createAssociatedTokenAccountIdempotentInstruction(
                    publicKey!, treasuryAta, TREASURY, mint, tokenProgram,
                ),
                spl.createTransferInstruction(fromAta, treasuryAta, publicKey!, feeUnits, [], tokenProgram),
            );
        }

        return transaction;
    };

    const handleSend = async () => {
        if (!selectedToken || !recipient || !hasAmount) return;
        if (isSolanaSend && (!publicKey || !connection)) return;

        const sendToast = showSendToast({
            tokenSymbol: selectedToken.symbol,
            tokenIcon: selectedToken.icon,
            amount: tokenAmount,
            recipientDisplay: recipientDisplay || recipient.slice(0, 4) + "..." + recipient.slice(-4),
        });

        try {
            setIsSending(true);
            const amount = toBaseUnits(tokenAmount, sendDecimals);

            let signature: string;
            let explorerUrl: string | undefined;

            // Everything that isn't Solana signs server-side from the seed-derived
            // key — FROST is ed25519-only, so it can't produce a secp256k1
            // signature. That key owns the same address the receive screen shows,
            // which is what keeps sending consistent with where funds arrived.
            if (!isSolanaSend) {
                const result = await sendOnChain.mutateAsync({
                    chain: sendChain,
                    to: recipient.trim(),
                    amount: amount.toString(),
                    contract,
                });
                signature = result.txId;
                explorerUrl = result.explorerUrl;
            } else {
                const recipientPubkey = new PublicKey(recipient.trim());
                const transaction = await buildSolanaTransaction(recipientPubkey, amount);

                if (adapterPublicKey) {
                    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
                    transaction.recentBlockhash = blockhash;
                    transaction.feePayer = publicKey!;
                    signature = await sendTransaction(transaction, connection);
                    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
                } else if (custodialWalletAddress) {
                    // Don't bake a blockhash here — the server refreshes it right before signing
                    // to avoid expiry during Swig/FROST session creation.
                    transaction.recentBlockhash = "11111111111111111111111111111111";
                    transaction.feePayer = publicKey!;
                    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
                    const result = await signAndSendCustodialTx({
                        transaction: serialized.toString("base64"),
                    });
                    signature = result.signature;
                    // Confirm using a fresh blockhash — the old one is stale by now.
                    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
                    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
                } else {
                    throw new Error("No wallet connected");
                }
            }

            sendToast.success(signature, explorerUrl);

            // Immediately refresh balances — don't wait for the poll. Solana and
            // the aggregated chains are separate queries; refresh the one that moved.
            if (isSolanaSend) {
                trpcUtils.wallet.getWalletAssets.invalidate();
                trpcUtils.wallet.getTransactions.invalidate();
            } else {
                trpcUtils.wallet.getAllChainAssets.invalidate();
                trpcUtils.wallet.getAllChainActivity.invalidate();
            }

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
            : !amountFitsDecimals
                ? `${selectedToken?.symbol ?? "This token"} only has ${selectedToken?.decimals ?? 0} decimals`
                : overBalance
                    ? `Not enough ${selectedToken?.symbol ?? ""}`
                    : !recipient
                        ? "Enter a recipient"
                        // Naming the network is the whole point: the reason a
                        // recipient is rejected is almost always that it belongs
                        // to a different chain than the asset.
                        : !hasValidRecipient
                            ? `Enter a ${chainConfig.name} recipient`
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
                    chain={sendChain}
                />

                {/* What this send actually costs, per path. Solana takes the 0.5%
                    platform fee in the asset being sent; the chains that go
                    through sendOnChain take no platform fee and quote gas. */}
                {hasAmount && (
                    <p className="text-center text-[12px] text-zinc-500">
                        {isSolanaSend ? (
                            <>
                                0.5% platform fee · {((parsedTokenAmount * PLATFORM_FEE_BPS) / 10000).toFixed(Math.min(6, sendDecimals))}{" "}
                                {selectedToken?.symbol ?? "SOL"}
                            </>
                        ) : feeQuote ? (
                            <>network fee · ~{feeQuote.feeFormatted.toFixed(6)} {feeQuote.symbol}</>
                        ) : (
                            <>network fee · {chainConfig.nativeCurrency.symbol} gas</>
                        )}
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
