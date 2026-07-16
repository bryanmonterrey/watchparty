// Server-side web push fan-out. Workers-compatible (@block65/webcrypto-web-push
// is pure WebCrypto — no Node crypto/https). Dead subscriptions (404/410 from
// the push service) are pruned on the spot.
import { buildPushPayload, type PushMessage, type PushSubscription } from "@block65/webcrypto-web-push";
import { db } from "@/db";
import { webPushSubscriptions } from "@/db/schema/content/notification_prefs";
import { inArray } from "drizzle-orm";

export type PushNotificationData = {
    title: string;
    body: string;
    /** in-app path the notification opens */
    url: string;
    /** same tag replaces the previous notification instead of stacking */
    tag?: string;
};

function vapid() {
    return {
        subject: process.env.VAPID_SUBJECT ?? "https://watchparty.xyz",
        publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
    };
}

export function pushConfigured(): boolean {
    return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Send one notification to every push subscription of the given users. */
export async function sendPushToUsers(userIds: string[], data: PushNotificationData): Promise<number> {
    if (userIds.length === 0 || !pushConfigured()) return 0;

    const subs = await db
        .select()
        .from(webPushSubscriptions)
        .where(inArray(webPushSubscriptions.userId, userIds));
    if (subs.length === 0) return 0;

    const message: PushMessage = { data, options: { ttl: 60 * 60, urgency: "normal" } };
    let delivered = 0;
    const dead: string[] = [];

    await Promise.allSettled(
        subs.map(async (sub) => {
            const subscription: PushSubscription = {
                endpoint: sub.endpoint,
                expirationTime: null,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
            };
            try {
                const payload = await buildPushPayload(message, subscription, vapid());
                // The lib types body as Uint8Array; runtime fetch accepts it fine.
                const res = await fetch(sub.endpoint, payload as unknown as RequestInit);
                if (res.status === 404 || res.status === 410) {
                    dead.push(sub.id);
                } else if (res.ok || res.status === 201) {
                    delivered++;
                }
            } catch {
                // network hiccup — leave the subscription alone
            }
        }),
    );

    if (dead.length) {
        await db.delete(webPushSubscriptions).where(inArray(webPushSubscriptions.id, dead)).catch(() => {});
    }
    return delivered;
}
