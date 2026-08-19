import Link from "next/link";

// Policy pages (terms / privacy / cookies / accessibility / ads-info /
// guidelines).
//
// ITS OWN ROUTE GROUP, not (marketing) — the marketing layout redirects any
// signed-in visitor to /home, and these pages are linked from the app's own
// right-rail footer, so a signed-in reader has to be able to reach them. Same
// reason (directory) exists.
//
// Provider-free, per the speed rule: static server pages, no query/wallet/chain
// providers, so a policy page costs nothing beyond the document.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="flex min-h-dvh flex-col bg-background text-foreground">
            <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur-xl">
                <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
                    <Link href="/" className="font-pixel text-2xl tracking-tighter">
                        watchparty
                    </Link>
                    <Link
                        href="/home"
                        className="rounded-full px-4 py-2 text-sm font-bold text-muted-foreground transition-colors hover:text-foreground"
                    >
                        Back to app
                    </Link>
                </div>
            </header>
            <main className="flex-1">{children}</main>
        </div>
    );
}
