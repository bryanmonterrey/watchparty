"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Bell, BellOff } from "lucide-react";
import { toast } from "sonner";

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
            <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-lantern" />
                <h2 className="text-base font-bold text-zinc-100">Notification Preferences</h2>
            </div>

            <div className="rounded-xl bg-zinc-900/60 border border-white/10 divide-y divide-white/5">
                {TOGGLES.map(({ key, label, description }) => (
                    <div key={key} className="flex items-center justify-between px-4 py-3">
                        <div>
                            <p className="text-sm font-medium text-zinc-200">{label}</p>
                            <p className="text-xs text-zinc-500">{description}</p>
                        </div>
                        <button
                            onClick={() => toggle(key)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${prefs[key] ? "bg-lantern" : "bg-zinc-700"}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${prefs[key] ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Push notifications */}
            {pushSupported && (
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {pushGranted ? <Bell className="w-5 h-5 text-lantern" /> : <BellOff className="w-5 h-5 text-zinc-500" />}
                        <div>
                            <p className="text-sm font-medium text-zinc-200">Push Notifications</p>
                            <p className="text-xs text-zinc-500">{pushGranted ? "Enabled on this device" : "Get notified even when the app is closed"}</p>
                        </div>
                    </div>
                    <button
                        onClick={handlePushToggle}
                        disabled={subscribePush.isPending || unsubscribePush.isPending}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${pushGranted ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600" : "bg-lantern text-zinc-950 hover:bg-lantern/90"}`}
                    >
                        {pushGranted ? "Disable" : "Enable"}
                    </button>
                </div>
            )}

            <button
                onClick={() => update.mutate(prefs as Record<PrefKey, boolean> & { pushEnabled: boolean })}
                disabled={update.isPending}
                className="w-full py-2 rounded-lg bg-lantern text-zinc-950 font-bold text-sm hover:bg-lantern/90 transition-colors disabled:opacity-50"
            >
                {update.isPending ? "Saving…" : "Save Preferences"}
            </button>
        </div>
    );
}
