import type { Metadata } from "next";
import Link from "next/link";
import { PinkStarLogo } from "@/components/icons";

export const metadata: Metadata = {
    title: "Get the app",
    description: "watchparty for iOS.",
};

// The rail footer's "Get app" destination. The iOS app (mobile/, Expo) exists
// but has not shipped, so this page says exactly that instead of faking a
// store badge — swap APP_STORE_URL in when it's live and the CTA switches from
// "coming soon" to the real link. Lives in the (legal) shell because it needs
// the same property: reachable signed-in AND signed-out, provider-free.
const APP_STORE_URL: string | null = null;

export default function DownloadPage() {
    return (
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-5 pb-24 pt-20 text-center sm:pt-28">
            <PinkStarLogo className="size-16" />
            <h1 className="mt-8 font-pixel text-4xl tracking-tighter sm:text-5xl">
                watchparty for iOS
            </h1>
            <p className="mt-4 max-w-md text-lg leading-7 text-muted-foreground">
                Streams, coins, and your wallet in your pocket. The mobile app is in
                the works — on the web, everything already runs.
            </p>
            {APP_STORE_URL ? (
                <a
                    href={APP_STORE_URL}
                    className="mt-10 inline-flex h-12 items-center rounded-full bg-foreground px-8 text-base font-bold text-background transition-transform active:scale-[0.97]"
                >
                    Download on the App Store
                </a>
            ) : (
                <>
                    <span className="mt-10 inline-flex h-12 cursor-default items-center rounded-full border border-border px-8 text-base font-bold text-muted-foreground">
                        Coming soon to the App Store
                    </span>
                    <Link
                        href="/home"
                        className="mt-4 text-sm font-semibold text-twitter2 hover:underline"
                    >
                        Use watchparty on the web
                    </Link>
                </>
            )}
        </div>
    );
}
