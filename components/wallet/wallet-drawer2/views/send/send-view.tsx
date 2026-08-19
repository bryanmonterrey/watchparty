"use client";

import { DrawerHeader } from "../../components/drawer-chrome";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Wallet01Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
    PublicKey,
    SystemProgram,
    Transaction,
    ComputeBudgetProgram,
} from "@solana/web3.js";
import { showSendToast } from "./send-transaction-toast";
import { HoldToConfirm } from "@/components/ui/hold-to-confirm";
import { trpc } from "@/lib/trpc/client";
import { motion } from "motion/react";
import { SendAmountInput } from "./send-amount-input";
import { RecentRecipient } from "./send-recipient";
import { SendToken } from "./send-token-selector";
import { SendRecipientSelector } from "./send-recipient-selector";
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

import { PLATFORM_FEE_BPS } from "@/lib/chains/fee-bps";

const TREASURY = new PublicKey(process.env.NEXT_PUBLIC_TREASURY_PUBKEY!);
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
        if (!mintInfo) throw new Error("Coin mint not found on Solana");
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

        // The fee rides in the token being sent. Skipped when it floors to
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
                ? `${selectedToken?.symbol ?? "This coin"} only has ${selectedToken?.decimals ?? 0} decimals`
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
            <DrawerHeader title="Send" onBack={onBack} />

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
                    className="flex w-full cursor-pointer items-center gap-3 rounded-3xl border border-baseborder/20 bg-panel2 px-5 py-4 text-left transition-colors hover:bg-white/[0.09]"
                >
                    {recipient ? (
                        recipientMeta?.avatar_url ? (
                            <Avatar className="size-9 shrink-0">
                                <AvatarImage src={recipientMeta.avatar_url} />
                                <AvatarFallback />
                            </Avatar>
                        ) : (
                            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.08]">
                                <HugeiconsIcon icon={Wallet01Icon} className="size-4 text-zinc-500" strokeWidth={2} />
                            </div>
                        )
                    ) : null}
                    <div className="flex-1 min-w-0">
                        <p className="text-12 font-medium text-zinc-500 mb-0.5">To</p>
                        {recipient ? (
                            <p className="text-13 font-semibold text-white truncate">{recipientDisplay}</p>
                        ) : (
                            <p className="text-13 font-medium text-zinc-600">@username or wallet address</p>
                        )}
                    </div>
                    <HugeiconsIcon icon={ArrowDown01Icon} className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                </button>

                <SendRecipientSelector
                    open={recipientSelectorOpen}
                    onClose={() => setRecipientSelectorOpen(false)}
                    onSelect={handleRecipientSelect}
                    recents={recents}
                    chain={sendChain}
                />

                {/* What this send costs. The fee is charged on every path — as
                    an instruction on Solana, an output on Bitcoin, and accrued
                    for a batched sweep on EVM, where a transfer can only pay one
                    address. Either way the sender covers it and the recipient
                    receives the full amount. Gas is quoted where we can. */}
                {hasAmount && (
                    <p className="text-center text-11 text-zinc-500">
                        {PLATFORM_FEE_BPS / 100}% platform fee ·{" "}
                        {((parsedTokenAmount * PLATFORM_FEE_BPS) / 10000).toFixed(Math.min(6, sendDecimals))}{" "}
                        {selectedToken?.symbol ?? "SOL"}
                        {!isSolanaSend && feeQuote && (
                            <> · network fee ~{feeQuote.feeFormatted.toFixed(6)} {feeQuote.symbol}</>
                        )}
                    </p>
                )}

                {/* Send button.

                    Hold-to-confirm once the transfer is actually valid: this is
                    the last step before funds leave, and it's irreversible in a
                    way almost nothing else in the app is. The hold replaces a
                    confirmation dialog — cheaper to back out of (slide off, let
                    go) and impossible to fat-finger.

                    EMBEDDED WALLETS ONLY. An extension wallet answers with
                    Phantom's own approve sheet, which is already a deliberate,
                    reviewable confirmation — and it shows the decoded transfer,
                    which we can't. Stacking a hold in front of it would be two
                    confirmations for one action, and the weaker of the two
                    first. `adapterPublicKey` is the app-wide discriminator for
                    "extension is driving" (same branch handleSend takes at
                    :345), so the hold fills the gap that exists only when
                    nothing else is going to ask.

                    Only when `canSend`. In every other state the button is
                    carrying an explanation ("Enter a recipient", "Not enough
                    SOL"), and there is nothing to confirm — asking someone to
                    hold a disabled button would be nonsense.

                    h-14 keeps this button taller than the h-12 wide-button
                    standard on purpose — it is the wallet's primary action and
                    the last step before funds leave. Its LABEL came down with
                    the rest of the drawer's copy (it was text-lg). */}
                {!canSend ? (
                    <button
                        disabled
                        className="w-full py-4 rounded-full font-semibold text-15 transition-all flex items-center justify-center gap-2 bg-white/[0.06] text-zinc-500 cursor-not-allowed"
                    >
                        {buttonLabel}
                    </button>
                ) : adapterPublicKey ? (
                    // Extension: tap, then confirm in the wallet's own sheet.
                    <button
                        onClick={handleSend}
                        className="cursor-pointer w-full py-4 rounded-full font-semibold text-15 transition-all flex items-center justify-center gap-2 bg-white text-black hover:bg-zinc-100 active:scale-[0.98]"
                    >
                        {buttonLabel}
                    </button>
                ) : (
                    <HoldToConfirm
                        label={buttonLabel}
                        holdingLabel="Keep holding…"
                        onConfirm={handleSend}
                        className="h-14 text-15"
                    />
                )}
            </div>
        </motion.div>
    );
}
