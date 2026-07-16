"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Notification01Icon, NotificationOff01Icon } from "@hugeicons/core-free-icons"
import { toast } from "sonner"
import { trpc } from "@/lib/trpc/client"
import { enrollPush, pushSupported } from "@/lib/push/client"
import { cn } from "@/lib/utils"

// Coin notifications — real web push. Turning it on enrolls this browser
// (service worker + permission) and subscribes the user to this token's
// price-move + migration alerts.
export function TokenNotifiedBanner({ tokenId }: { tokenId: string }) {
    const utils = trpc.useUtils()
    const [busy, setBusy] = useState(false)

    const { data } = trpc.notificationPrefs.getTokenAlert.useQuery({ tokenId })
    const subscribed = data?.subscribed ?? false

    const subscribePush = trpc.notificationPrefs.subscribePush.useMutation()
    const setTokenAlert = trpc.notificationPrefs.setTokenAlert.useMutation({
        onSuccess: () => utils.notificationPrefs.getTokenAlert.invalidate({ tokenId }),
    })

    const toggle = async () => {
        if (busy) return
        setBusy(true)
        try {
            if (!subscribed) {
                const enrollment = await enrollPush()
                await subscribePush.mutateAsync(enrollment)
                await setTokenAlert.mutateAsync({ tokenId, enabled: true })
                toast.success("You'll get price and migration alerts for this coin")
            } else {
                await setTokenAlert.mutateAsync({ tokenId, enabled: false })
                toast.success("Alerts turned off")
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Couldn't enable notifications")
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="bg-panel rounded-[25px] p-5 flex flex-col gap-3 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-lantern/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
            <div>
                <span className="text-lg font-bold text-zinc-200">Get notified</span>
                <p className="text-base text-zinc-500">
                    {subscribed
                        ? "Price moves and migration alerts are on for this coin"
                        : "Price moves of 20%+ and migration, straight to this device"}
                </p>
            </div>
            <button
                onClick={toggle}
                disabled={busy || !pushSupported()}
                className={cn(
                    "flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[14px] font-bold transition-colors disabled:opacity-50",
                    subscribed
                        ? "bg-white/[0.06] text-zinc-300 hover:bg-white/10 hover:text-white"
                        : "bg-lantern text-black hover:bg-lantern/90",
                )}
            >
                <HugeiconsIcon
                    icon={subscribed ? NotificationOff01Icon : Notification01Icon}
                    className="size-4"
                    strokeWidth={2}
                />
                {busy ? "One sec…" : subscribed ? "Turn off alerts" : pushSupported() ? "Notify me" : "Not supported in this browser"}
            </button>
        </div>
    )
}
