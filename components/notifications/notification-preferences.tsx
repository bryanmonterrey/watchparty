"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { HugeiconsIcon } from "@hugeicons/react";
import { Notification01Icon, NotificationOff01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelHeader, PillButton } from "@/components/settings/ui";

const TOGGLES = [
    { key: "likes", label: "Likes", description: "When someone likes your content" },
    { key: "comments", label: "Comments", description: "When someone comments on your post" },
    { key: "reposts", label: "Reposts", description: "When someone reposts your content" },
    { key: "follows", label: "New followers", description: "When someone follows you" },
    { key: "tips", label: "Tips", description: "When someone tips you SOL" },
    { key: "mentions", label: "Mentions", description: "When someone @mentions you" },
    { key: "quotes", label: "Quotes", description: "When someone quotes your post" },
    { key: "systemAlerts", label: "System alerts", description: "Platform announcements and updates" },
] as const;

type PrefKey = typeof TOGGLES[number]["key"];

export function NotificationPreferences() {
    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();
    const [prefs, setPrefs] = useState<Record<string, boolean>>({});
    const [pushSupported] = useState(() => typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator);
    const [pushGranted, setPushGranted] = useState(false);

    const { data } = trpc.notificationPrefs.get.useQuery(undefined, { enabled: !!session?.user });

    useEffect(() => {
        if (data) {
            const p: Record<string, boolean> = {};
            const d = data as unknown as Record<string, boolean>;
            TOGGLES.forEach(t => { p[t.key] = d[t.key] ?? true; });
            p.pushEnabled = d.pushEnabled ?? false;
            setPrefs(p);
        }
        if (typeof window !== "undefined" && "Notification" in window) {
            setPushGranted(Notification.permission === "granted");
        }
    }, [data]);

    const update = trpc.notificationPrefs.update.useMutation({
        onSuccess: () => { toast.success("Preferences saved"); utils.notificationPrefs.get.invalidate(); },
        onError: (e) => toast.error(e.message),
    });
    const subscribePush = trpc.notificationPrefs.subscribePush.useMutation({
        onSuccess: () => { toast.success("Push notifications enabled"); setPushGranted(true); },
        onError: (e) => toast.error(e.message),
    });
    const unsubscribePush = trpc.notificationPrefs.unsubscribePush.useMutation({
        onSuccess: () => { toast.success("Push notifications disabled"); setPushGranted(false); },
        onError: (e) => toast.error(e.message),
    });

    function toggle(key: string) {
        setPrefs(p => ({ ...p, [key]: !p[key] }));
    }

    async function handlePushToggle() {
        if (!pushGranted) {
            const permission = await Notification.requestPermission();
            if (permission !== "granted") { toast.error("Permission denied"); return; }
            const reg = await navigator.serviceWorker.ready;
            const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
            if (!vapidPublicKey) { toast.error("Push not configured"); return; }
            const sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: vapidPublicKey,
            });
            const json = sub.toJSON();
            await subscribePush.mutateAsync({
                endpoint: sub.endpoint,
                p256dh: (json.keys as Record<string, string>)?.p256dh ?? "",
                auth: (json.keys as Record<string, string>)?.auth ?? "",
            });
        } else {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
                await unsubscribePush.mutateAsync({ endpoint: sub.endpoint });
                await sub.unsubscribe();
            }
        }
    }

    return (
        <div className="space-y-4">
            <PanelHeader title="Notifications" />

            <Panel className="p-1.5">
                {TOGGLES.map(({ key, label, description }) => (
                    <div key={key} className="flex items-center justify-between gap-4 rounded-[18px] px-3.5 py-3 transition-colors hover:bg-white/[0.04]">
                        <div>
                            <p className="text-[14px] font-semibold text-zinc-200">{label}</p>
                            <p className="text-[12px] font-medium text-zinc-500">{description}</p>
                        </div>
                        <Switch checked={!!prefs[key]} onCheckedChange={() => toggle(key)} />
                    </div>
                ))}
            </Panel>

            {/* Push notifications */}
            {pushSupported && (
                <Panel className="flex items-center justify-between gap-4 p-5">
                    <div className="flex items-center gap-3">
                        <HugeiconsIcon icon={pushGranted ? Notification01Icon : NotificationOff01Icon} className={pushGranted ? "size-5 text-white" : "size-5 text-zinc-500"} strokeWidth={2} />
                        <div>
                            <p className="text-[14px] font-semibold text-zinc-200">Push notifications</p>
                            <p className="text-[12px] font-medium text-zinc-500">{pushGranted ? "Enabled on this device" : "Get notified even when the app is closed"}</p>
                        </div>
                    </div>
                    <PillButton
                        variant={pushGranted ? "secondary" : "primary"}
                        className="h-9"
                        onClick={handlePushToggle}
                        disabled={subscribePush.isPending || unsubscribePush.isPending}
                    >
                        {pushGranted ? "Disable" : "Enable"}
                    </PillButton>
                </Panel>
            )}

            <PillButton
                variant="primary"
                className="h-12 w-full"
                onClick={() => update.mutate(prefs as Record<PrefKey, boolean> & { pushEnabled: boolean })}
                disabled={update.isPending}
            >
                {update.isPending ? "Saving…" : "Save preferences"}
            </PillButton>
        </div>
    );
}
