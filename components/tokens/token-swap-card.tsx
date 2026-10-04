"use client"

import React, { useState, useEffect, useCallback, useMemo } from "react"
import { motion } from "framer-motion"
import { useConnection, useWallet } from "@solana/wallet-adapter-react"
import { toast } from "sonner"
import { Token } from "@/db/schema/content"
import { trpc } from "@/lib/trpc/client"
import { useAuthSession } from "@/hooks/use-auth-session"
import { useWalletSigning } from "@/hooks/use-wallet-signing"
import { useFirstBuy } from "@/hooks/use-first-buy"
import { toPublicKey } from "@/lib/solana/pubkey"
import { showSwapToast } from "@/components/wallet/wallet-drawer/views/swap/swap-transaction-toast"
import { OPEN_WALLET_DRAWER_EVENT } from "@/components/wallet/sol-balance-chip"
import { SettingsIcon } from "../icons"

// SOL mints: quotes use wSOL; the price API keys SOL under the native mint.
const SOL_WSOL = "So11111111111111111111111111111111111111112"
const SOL_NATIVE = "So11111111111111111111111111111111111111111"

const SLIPPAGE_KEY = "token:swap:slippage"
const SLIPPAGES = [0.5, 1, 2, 5] as const

const USD_PRESETS = [25, 100, 250] as const
const SELL_PRESETS = [25, 50, 100] as const // percent of balance

interface QuoteResponse {
    inputMint: string
    inAmount: string
    outputMint: string
    outAmount: string
    priceImpactPct: number
}

function formatAmount(v: number): string {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
    if (v >= 1) return v.toFixed(2)
    return v.toPrecision(3)
}

// First-buy panel for DRAFT tokens: content creates the token record, but the
// pool only exists once SOMEONE makes the first buy — creator or anyone else.
// The buyer pays and gets the first tokens; the pool identity, trading fees,
// and leftover supply stay with the creator.
const FIRST_BUY_PRESETS = [0.1, 0.5, 1] as const

export function FirstBuyCard({ token, creatorWallet, creatorAvatar }: { token: Token; creatorWallet: string | null; creatorAvatar?: string | null }) {
    const [amount, setAmount] = useState("")
    const amountSol = parseFloat(amount) || 0
    // The launch itself lives in hooks/use-first-buy, shared with the regular
    // buy panel (which is what the coin page renders for a draft now).
    const { firstBuy: runFirstBuy, launching, walletAddress } = useFirstBuy({ token, creatorWallet, creatorAvatar })
    const firstBuy = () => void runFirstBuy(amountSol)

    return (
        <div className="bg-panel rounded-[25px] p-5 flex flex-col">
            <p className="text-lg font-bold text-zinc-200">Be the first buyer</p>
            <p className="mt-1 text-sm font-medium leading-relaxed text-zinc-500">
                This token isn&apos;t on-chain yet. The first buy launches it — the creator keeps the fees, you get the first tokens.
            </p>

            <div className="mt-5 flex items-center justify-center gap-1">
                <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, "")
                        if ((v.match(/\./g)?.length ?? 0) <= 1) setAmount(v)
                    }}
                    placeholder="0"
                    className="bg-transparent text-5xl font-bold outline-none text-center text-zinc-100 placeholder:text-zinc-600"
                    style={{ width: `${Math.max(1.5, (amount.length || 1) * 0.72)}ch` }}
                />
                <div className="bg-zinc-800 rounded-full px-3 py-1 text-xs font-semibold text-zinc-400 ml-2">SOL</div>
            </div>

            <div className="mt-5 mb-6 flex items-center gap-2">
                {FIRST_BUY_PRESETS.map((v) => (
                    <button
                        key={v}
                        onClick={() => setAmount(String(v))}
                        className="cursor-pointer flex-1 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors text-md font-semibold text-zinc-300"
                    >
                        {v} SOL
                    </button>
                ))}
            </div>

            <button
                onClick={firstBuy}
                disabled={!!walletAddress && (amountSol <= 0 || launching)}
                className="cursor-pointer w-full h-15 bg-white hover:bg-white/90 text-black font-bold rounded-full text-lg transition-colors disabled:opacity-40 disabled:cursor-default"
            >
                {!walletAddress
                    ? "Connect wallet"
                    : launching
                        ? "Launching…"
                        : `Buy & launch $${token.ticker}`}
            </button>

            <p className="mt-4 text-right text-sm font-semibold text-zinc-500">
                + ~0.03 SOL launch fees
            </p>
        </div>
    )
}

export function TokenSwapCard({ token, creatorWallet = null, creatorAvatar = null }: { token: Token; creatorWallet?: string | null; creatorAvatar?: string | null }) {
    const { connection } = useConnection()
    const { publicKey: adapterPublicKey, sendTransaction } = useWallet()
    const { signAndSubmit } = useWalletSigning()
    const { data: session } = useAuthSession()

    const walletAddress = adapterPublicKey?.toBase58() || session?.user?.wallet_address || null
    const mint = token.tokenAddress

    const [side, setSide] = useState<"buy" | "sell">("buy")
    // Buy is denominated in USD (converted to SOL), sell in token amount
    const [input, setInput] = useState("")
    const [quote, setQuote] = useState<QuoteResponse | null>(null)
    const [quoting, setQuoting] = useState(false)
    const [swapping, setSwapping] = useState(false)
    const [showSlippage, setShowSlippage] = useState(false)
    // Lazy read keeps SSR at the default; the footer suppresses the mismatch
    const [slippage, setSlippage] = useState(() => {
        if (typeof window === "undefined") return 2
        const saved = Number(localStorage.getItem(SLIPPAGE_KEY))
        return SLIPPAGES.includes(saved as (typeof SLIPPAGES)[number]) ? saved : 2
    })
    const [decimals, setDecimals] = useState<number | null>(null)
    const [balance, setBalance] = useState<number | null>(null)

    const getQuoteMutation = trpc.wallet.getQuote.useMutation()
    const getSwapTxMutation = trpc.wallet.getSwapTransaction.useMutation()
    const reportSwapSignature = trpc.wallet.reportSwapSignature.useMutation()
    const syncToken = trpc.trade.syncToken.useMutation()

    // SOL price for the USD-denominated buy side
    const { data: priceData } = trpc.wallet.getPrices.useQuery(
        { ids: [SOL_NATIVE] },
        { refetchInterval: 15_000, enabled: !!mint },
    )
    const solPrice = priceData?.data[SOL_NATIVE]?.price || 0

    // Token decimals (needed to scale sell amounts) — one RPC per page view
    useEffect(() => {
        if (!mint) return
        let cancelled = false
        connection.getTokenSupply(toPublicKey(mint)!).then((res) => {
            if (!cancelled) setDecimals(res.value.decimals)
        }).catch(() => {})
        return () => { cancelled = true }
    }, [mint, connection])

    // Token balance for sell presets
    useEffect(() => {
        if (!mint || !walletAddress || side !== "sell") return
        let cancelled = false
        connection.getParsedTokenAccountsByOwner(toPublicKey(walletAddress)!, { mint: toPublicKey(mint)! })
            .then((res) => {
                if (cancelled) return
                const ui = res.value.reduce((sum, a) => sum + (a.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0), 0)
                setBalance(ui)
            })
            .catch(() => {})
        return () => { cancelled = true }
    }, [mint, walletAddress, side, connection])

    // Raw integer amount for the quote request
    const rawAmount = useMemo(() => {
        const n = parseFloat(input)
        if (!n || n <= 0) return 0
        if (side === "buy") {
            if (!solPrice) return 0
            return Math.floor((n / solPrice) * 1e9) // USD → SOL lamports
        }
        if (decimals == null) return 0
        return Math.floor(n * 10 ** decimals) // token amount → raw
    }, [input, side, solPrice, decimals])

    const inputMint = side === "buy" ? SOL_WSOL : mint
    const outputMint = side === "buy" ? mint : SOL_WSOL

    // Debounced quote
    const fetchQuote = useCallback(async () => {
        if (!mint || !rawAmount || !walletAddress) { setQuote(null); return }
        setQuoting(true)
        try {
            const q = await getQuoteMutation.mutateAsync({
                inputMint: inputMint!,
                outputMint: outputMint!,
                amount: rawAmount,
                slippageBps: Math.round(slippage * 100),
            })
            setQuote(q)
        } catch {
            setQuote(null)
        } finally {
            setQuoting(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mint, rawAmount, inputMint, outputMint, slippage, walletAddress])

    useEffect(() => {
        const t = setTimeout(fetchQuote, 450)
        return () => clearTimeout(t)
    }, [fetchQuote])

    // Estimated output line under the input
    const estimate = useMemo(() => {
        if (!quote) return null
        const out = Number(quote.outAmount)
        if (side === "buy") {
            if (decimals == null) return null
            return `≈ ${formatAmount(out / 10 ** decimals)} $${token.ticker}`
        }
        const sol = out / 1e9
        return `≈ ${sol.toFixed(4)} SOL${solPrice ? ` ($${(sol * solPrice).toFixed(2)})` : ""}`
    }, [quote, side, decimals, token.ticker, solPrice])

    const executeSwap = async () => {
        if (!walletAddress) {
            window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT))
            return
        }
        if (!quote || !mint || swapping) return

        setSwapping(true)
        const inSymbol = side === "buy" ? "SOL" : token.ticker
        const outSymbol = side === "buy" ? token.ticker : "SOL"
        const swapToast = showSwapToast({
            inputSymbol: inSymbol,
            outputSymbol: outSymbol,
            inputAmount: side === "buy" && solPrice ? (parseFloat(input) / solPrice).toFixed(4) : input,
            outputAmount: estimate?.replace("≈ ", "") ?? "",
            outputIcon: side === "buy" ? (token.imageUrl ?? undefined) : undefined,
            inputIcon: side === "sell" ? (token.imageUrl ?? undefined) : undefined,
        })

        try {
            const { swapTransaction, tradeId } = await getSwapTxMutation.mutateAsync({
                quoteResponse: quote,
                userPublicKey: walletAddress,
                wrapAndUnwrapSol: true,
            })

            // Heavy web3 class loads only when someone actually swaps
            const { VersionedTransaction } = await import("@solana/web3.js")
            const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"))

            swapToast.setStep("signing")
            let signature: string
            if (adapterPublicKey) {
                signature = await sendTransaction(transaction, connection)
            } else {
                const result = await signAndSubmit({ transaction: swapTransaction })
                signature = result.signature
            }

            // Attach the signature so the trade-verify cron settles it even if
            // this tab dies mid-confirm. Fire-and-forget.
            if (tradeId) reportSwapSignature.mutate({ tradeId, signature })

            swapToast.setStep("confirming")
            await connection.confirmTransaction(signature, "confirmed")
            swapToast.success(signature)
            setInput("")
            setQuote(null)
            // Event-driven freshness: this token's market row updates now,
            // not on the next minute sweep.
            syncToken.mutate({ mint })
        } catch (error) {
            const msg = (error as Error)?.message || "Something went wrong. Please try again."
            swapToast.error(msg.includes("address table") ? "Route unavailable — try a different amount." : msg)
        } finally {
            setSwapping(false)
        }
    }

    const setSlippageAndSave = (v: number) => {
        setSlippage(v)
        localStorage.setItem(SLIPPAGE_KEY, String(v))
    }

    // Drafts have no pool yet — the first buy IS the launch, and anyone can
    // make it (content creates the token; the crowd puts it on-chain).
    if (!mint || token.status === "draft") {
        return <FirstBuyCard token={token} creatorWallet={creatorWallet} creatorAvatar={creatorAvatar} />
    }

    const buttonLabel = !walletAddress
        ? "Connect wallet"
        : swapping
            ? "Swapping…"
            : quoting
                ? "Fetching quote…"
                : side === "buy"
                    ? `Buy $${token.ticker}`
                    : `Sell $${token.ticker}`
    const buttonDisabled = !!walletAddress && (!quote || swapping || quoting || rawAmount <= 0)

    return (
        <div className="bg-panel rounded-[25px] p-5 flex flex-col">
            {/* Side toggle */}
            <div className="relative flex bg-[#16181c] rounded-full p-1 mb-6 shadow-inner w-full">
                {(["buy", "sell"] as const).map((s) => {
                    const active = side === s
                    return (
                        <button
                            key={s}
                            onClick={() => { setSide(s); setInput(""); setQuote(null) }}
                            className={`relative z-10 cursor-pointer flex-1 py-2.5 text-lg font-bold rounded-full capitalize transition-colors duration-200 select-none focus:outline-none ${
                                active ? (s === "buy" ? "text-lantern" : "text-pastelred") : "text-zinc-500 hover:text-zinc-300"
                            }`}
                        >
                            {s}
                            {active && (
                                <motion.div
                                    layoutId="swap-side-bg"
                                    className={`absolute inset-0 rounded-full -z-10 ${s === "buy" ? "bg-lantern/15" : "bg-pastelred/15"}`}
                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                />
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Amount */}
            <div className="flex items-center justify-center gap-1 mb-2">
                {side === "buy" && <span className="text-zinc-500 text-3xl font-medium">$</span>}
                <input
                    type="text"
                    inputMode="decimal"
                    value={input}
                    onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, "")
                        if ((v.match(/\./g)?.length ?? 0) <= 1) setInput(v)
                    }}
                    placeholder="0"
                    className="bg-transparent text-5xl font-bold outline-none text-center text-zinc-100 placeholder:text-zinc-600"
                    style={{ width: `${Math.max(1.5, (input.length || 1) * 0.72)}ch` }}
                />
                <div className="bg-zinc-800 rounded-full px-3 py-1 text-xs font-semibold text-zinc-400 ml-2">
                    {side === "buy" ? "USD" : `$${token.ticker}`}
                </div>
            </div>

            {/* Live estimate */}
            <p className="mb-5 h-5 text-center text-sm font-semibold text-zinc-500">
                {quoting ? "…" : estimate ?? (side === "sell" && balance != null ? `Balance: ${formatAmount(balance)}` : "")}
            </p>

            {/* Presets */}
            <div className="flex items-center gap-2 mb-6">
                {side === "buy"
                    ? USD_PRESETS.map((amt) => (
                        <button
                            key={amt}
                            onClick={() => setInput(String(amt))}
                            className="cursor-pointer flex-1 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors text-md font-semibold text-zinc-300"
                        >
                            ${amt}
                        </button>
                    ))
                    : SELL_PRESETS.map((pct) => (
                        <button
                            key={pct}
                            onClick={() => {
                                if (balance == null) return
                                const amt = (balance * pct) / 100
                                setInput(pct === 100 ? String(amt) : amt.toFixed(2))
                            }}
                            disabled={balance == null || balance <= 0}
                            className="cursor-pointer flex-1 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors text-md font-semibold text-zinc-300 disabled:opacity-40 disabled:cursor-default"
                        >
                            {pct === 100 ? "Max" : `${pct}%`}
                        </button>
                    ))}
                <button
                    onClick={() => setShowSlippage((v) => !v)}
                    aria-label="Slippage settings"
                    className="cursor-pointer px-3 flex items-center justify-center py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors"
                >
                    <SettingsIcon className="size-4 text-zinc-400" />
                </button>
            </div>

            {/* Slippage picker */}
            {showSlippage && (
                <div className="mb-6 flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-500">Slippage</span>
                    {SLIPPAGES.map((v) => (
                        <button
                            key={v}
                            onClick={() => setSlippageAndSave(v)}
                            className={`h-9 cursor-pointer rounded-full px-3.5 text-[13px] font-bold transition-colors ${
                                slippage === v ? "bg-white text-black" : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            {v}%
                        </button>
                    ))}
                </div>
            )}

            <button
                onClick={executeSwap}
                disabled={buttonDisabled}
                className="cursor-pointer w-full h-15 bg-white hover:bg-white/90 text-black font-bold rounded-full text-lg transition-colors disabled:opacity-40 disabled:cursor-default"
            >
                {buttonLabel}
            </button>

            <div className="flex items-center justify-end gap-1 mt-4 text-sm font-semibold text-zinc-500">
                <SettingsIcon className="size-3.5" />
                <span suppressHydrationWarning>{slippage}% slippage</span>
            </div>
        </div>
    )
}
