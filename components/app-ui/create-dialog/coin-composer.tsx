"use client"

import * as React from "react"
import { useDropzone } from "react-dropzone"
import { X } from "lucide-react"
import { HugeiconsIcon } from "@hugeicons/react"
import { ImageAdd02Icon } from "@hugeicons/core-free-icons"
import { XIcon, TelegramIcon, GlobeIcon, SolanaIcon } from "@/components/icons"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { AnimatedSlider } from "@/components/ui/motion-slider"
import { Squircle } from "@/components/ui/squircle"
import { nanoid } from "nanoid"
import { cn } from "@/lib/utils"
import { appToast } from "@/components/app-ui/app-toast"
import { supabase } from "@/lib/supabase/client"
import { trpc } from "@/lib/trpc/client"
import { useAuthSession } from "@/hooks/use-auth-session"
import { useTokenLaunch } from "@/hooks/use-token-launch"
import { ShareFees } from "@/components/tokens/share-fees"
import type { SplitShare } from "./token-launch-section"

interface CoinComposerProps {
    onClose: () => void
}

// Standalone coin launch (pump.fun-style). Unlike the Post tab — where a token
// is an opt-in add-on to a post — the whole point here IS the coin: image,
// ticker, name, description, socials, creator fee, optional first buy. It still
// creates a content record (the coin's post) so the coin is a first-class,
// tradable object in the feed, matching the token-first-buy model (anyone can
// be the first buyer of a draft; the first buy is the on-chain launch).
export function CoinComposer({ onClose }: CoinComposerProps) {
    const { data: session } = useAuthSession()
    const { launchToken, isLaunching } = useTokenLaunch()

    const [image, setImage] = React.useState<File | null>(null)
    const [ticker, setTicker] = React.useState("")
    const [name, setName] = React.useState("")
    const [description, setDescription] = React.useState("")
    const [twitterUrl, setTwitterUrl] = React.useState("")
    const [telegramUrl, setTelegramUrl] = React.useState("")
    const [websiteUrl, setWebsiteUrl] = React.useState("")
    const [creatorFee, setCreatorFee] = React.useState(5)
    const [buyAmount, setBuyAmount] = React.useState<number | undefined>(undefined)
    // The Coin tab had no fee sharing at all and hardcoded splits: [] into the
    // launch, so the same product launched from Post and from Coin came out
    // different. Same ShareFees component the ticker dialog uses.
    const [splits, setSplits] = React.useState<SplitShare[]>([])
    const [isSubmitting, setIsSubmitting] = React.useState(false)

    const previewUrl = React.useMemo(() => (image ? URL.createObjectURL(image) : null), [image])
    React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation()
    const createPostMutation = trpc.content.createPost.useMutation({
        onSuccess: () => {
            appToast.success(buyAmount && buyAmount > 0 ? "Coin launched!" : "Coin created!")
            setIsSubmitting(false)
            onClose()
        },
        onError: (error) => {
            appToast.error(error.message)
            setIsSubmitting(false)
        },
    })

    const onDrop = React.useCallback((accepted: File[]) => {
        if (accepted[0]) setImage(accepted[0])
    }, [])

    const { getRootProps, getInputProps, isDragActive, open: openFileDialog } = useDropzone({
        onDrop,
        accept: { "image/*": [] },
        maxFiles: 1,
        noClick: true,
        noKeyboard: true,
    })

    const uploadToPosts = async (file: File) => {
        const filename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_")
        const { token, path } = await getPresignedUrl.mutateAsync({ bucket: "posts", filename, contentType: file.type })
        const { data, error } = await supabase.storage.from("posts").uploadToSignedUrl(path, token, file)
        if (error) throw error
        return supabase.storage.from("posts").getPublicUrl(data!.path).data.publicUrl
    }

    const canSubmit = !!image && ticker.trim().length > 0 && !isSubmitting && !isLaunching

    const handleLaunch = async () => {
        if (!image) { appToast.error("Add a coin image"); return }
        if (!ticker.trim()) { appToast.error("Ticker is required"); return }
        if (isSubmitting || isLaunching) return

        setIsSubmitting(true)
        try {
            // Generated up front: the coin's metadata embeds this post's url as
            // external_url, and the launch happens before the post is created.
            const newPostId = nanoid()

            // 1. Upload the coin image.
            const imageUrl = await uploadToPosts(image)

            // 2. Launch (draft if no first buy, on-chain if a first-buy amount is
            //    set). The metadata JSON used to be built and uploaded HERE;
            //    useTokenLaunch owns it now because external_url needs the mint,
            //    which only exists inside the launch. Doing it here as well
            //    would upload a document nothing reads.
            const tokenName = name.trim() || ticker.trim()
            const launchResult = await launchToken(
                { name: tokenName, symbol: ticker, image: imageUrl, description, postId: newPostId },
                { earningsEnabled: true, ticker, creatorFee, splits, buyAmount }
            )
            if (!launchResult.success) { setIsSubmitting(false); return }

            // 4. Persist the coin as a content record.
            createPostMutation.mutate({
                id: newPostId,
                content: description.trim() || undefined,
                imageUrl,
                visibility: "public",
                audience: "everyone",
                replyPrivacy: "everyone",
                earningsEnabled: true,
                ticker: ticker.trim(),
                tokenName,
                token_image: imageUrl,
                twitterUrl: twitterUrl.trim() || undefined,
                telegramUrl: telegramUrl.trim() || undefined,
                websiteUrl: websiteUrl.trim() || undefined,
                creatorFeePercent: creatorFee,
                // The launch call above already carries these; createPost is
                // what persists them onto the token row, so it needs them too.
                splits,
                tokenAddress: launchResult.tokenAddress,
                poolAddress: launchResult.poolAddress,
                tokenStatus: (launchResult.status as "draft" | "live" | undefined) ?? "draft",
                status: "published",
            })
        } catch (error) {
            console.error(error)
            appToast.error("Failed to create coin")
            setIsSubmitting(false)
        }
    }

    return (
        <div className="mx-auto w-full max-w-[520px] space-y-7 pb-6">
            {/* Image + ticker hero */}
            <div className="flex flex-col items-center gap-4">
                <div {...getRootProps()} className="w-full">
                    <input {...getInputProps()} />
                    <Squircle asChild radius={28} autoEffects={false}>
                        <button
                            type="button"
                            onClick={openFileDialog}
                            className={cn(
                                "relative flex aspect-square w-32 items-center justify-center overflow-hidden bg-panel transition-colors mx-auto",
                                isDragActive ? "ring-2 ring-lantern/60" : "hover:bg-panel2",
                            )}
                        >
                            {previewUrl ? (
                                <>
                                    <img src={previewUrl} alt="Coin" className="size-full object-cover" />
                                    <span
                                        role="button"
                                        onClick={(e) => { e.stopPropagation(); setImage(null) }}
                                        className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                                    >
                                        <X className="size-3.5" />
                                    </span>
                                </>
                            ) : (
                                <span className="flex flex-col items-center gap-1.5 text-zinc-500">
                                    <HugeiconsIcon icon={ImageAdd02Icon} className="size-7" strokeWidth={1.8} />
                                    <span className="text-[11px] font-semibold">Add image</span>
                                </span>
                            )}
                        </button>
                    </Squircle>
                </div>

                <Input
                    radius={22}
                    value={ticker}
                    onChange={(e) => setTicker(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 15))}
                    className="!text-center !text-5xl font-bold tracking-tight placeholder:text-zinc-700 h-20 w-full p-0"
                    placeholder="$TICKER"
                    autoFocus
                />
                <p className="text-center text-[13px] text-zinc-500">
                    Tickers are short nicknames others see when trading your coin.
                </p>
            </div>

            {/* Name */}
            <div className="space-y-2">
                <Label className="text-[15px] font-semibold text-zinc-300">Coin name</Label>
                <Input
                    radius={16}
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 32))}
                    placeholder="e.g. Diamond Hands"
                    maxLength={32}
                    className="h-14 text-[15px]"
                />
            </div>

            {/* Description */}
            <div className="space-y-2">
                <Label className="text-[15px] font-semibold text-zinc-300">Description</Label>
                <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                    placeholder="What's this coin about?"
                    className="min-h-24 resize-none rounded-2xl text-[15px]"
                />
            </div>

            {/* Socials */}
            <div className="space-y-3">
                <Label className="text-[15px] font-semibold text-zinc-300">Socials (optional)</Label>
                {([
                    { Icon: XIcon, value: twitterUrl, set: setTwitterUrl, placeholder: "x.com/yourcoin" },
                    { Icon: TelegramIcon, value: telegramUrl, set: setTelegramUrl, placeholder: "t.me/yourcoin" },
                    { Icon: GlobeIcon, value: websiteUrl, set: setWebsiteUrl, placeholder: "yourcoin.xyz" },
                ]).map(({ Icon, value, set, placeholder }, i) => (
                    <div key={i} className="relative">
                        <Icon className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-zinc-500" />
                        <Input
                            radius={16}
                            value={value}
                            onChange={(e) => set(e.target.value)}
                            placeholder={placeholder}
                            className="h-14 pl-11 text-[15px]"
                        />
                    </div>
                ))}
            </div>

            {/* Creator fee */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <Label className="text-[15px] font-semibold text-zinc-300">Creator fee</Label>
                    <span className="text-[13px] text-zinc-500">You earn {creatorFee}% of every trade</span>
                </div>
                <div className="px-1">
                    <AnimatedSlider label="Fee %" value={creatorFee} onChange={setCreatorFee} min={0} max={5} step={1} />
                </div>
                <p className="text-center text-[11px] text-zinc-500">
                    A fixed 1% platform fee applies to all trading volume. Total curve fee: {creatorFee + 1}%.
                </p>
            </div>

            {/* Share fees — directly under the creator fee it divides up. */}
            <ShareFees splits={splits} onChange={setSplits} />

            {/* First buy */}
            <div className="space-y-3">
                <div className="space-y-1">
                    <Label className="text-[15px] font-semibold text-zinc-300">First buy (optional)</Label>
                    <p className="text-[13px] text-zinc-500">Buy your own coin at launch — this is what mints it on-chain.</p>
                </div>
                <div className="relative">
                    <SolanaIcon className="pointer-events-none absolute left-4 top-1/2 z-10 size-4 -translate-y-1/2 text-zinc-500" />
                    <Input
                        radius={16}
                        type="number"
                        value={buyAmount === undefined ? "" : buyAmount}
                        onChange={(e) => setBuyAmount(e.target.value ? parseFloat(e.target.value) : undefined)}
                        className="h-14 pl-11 text-[15px] [&::-webkit-inner-spin-button]:appearance-none"
                        placeholder="0.00"
                        step="0.01"
                        min="0"
                    />
                </div>
            </div>

            <Button
                onClick={handleLaunch}
                disabled={!canSubmit}
                className="h-12 w-full rounded-full bg-white text-base font-extrabold text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
            >
                {isSubmitting || isLaunching
                    ? "Launching…"
                    : buyAmount && buyAmount > 0
                        ? "Launch coin"
                        : "Create coin"}
            </Button>
        </div>
    )
}
