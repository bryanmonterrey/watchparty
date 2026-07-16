// Browser-side web push enrollment. Registers the service worker, asks for
// notification permission, and returns the PushSubscription fields the server
// stores (notificationPrefs.subscribePush). Import from client components only.

export function pushSupported(): boolean {
    return (
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window
    );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
    const padding = "=".repeat((4 - (base64.length % 4)) % 4);
    const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
    const raw = window.atob(b64);
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export type PushEnrollment = { endpoint: string; p256dh: string; auth: string };

/**
 * Ensure this browser has an active push subscription. Throws with a
 * user-showable message when unsupported or permission is denied.
 */
export async function enrollPush(): Promise<PushEnrollment> {
    if (!pushSupported()) {
        throw new Error("This browser doesn't support notifications");
    }
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) throw new Error("Notifications aren't configured");

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
        throw new Error("Notifications are blocked — enable them in your browser's site settings");
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Could not create a push subscription");
    }
    return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}
