import Link from "next/link";

// Shared marketing footer — used by the landing and the marketing sub-pages
// (explore / creators / about) so the nav links stay in one place.
export function MarketingFooter() {
    return (
        <footer className="bg-black px-6 py-14 text-white">
            <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 sm:flex-row sm:justify-between">
                <Link href="/" className="font-pixel text-xl tracking-tighter">watchparty</Link>
                <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-white/70">
                    <Link href="/explore" className="transition-colors hover:text-white">Explore</Link>
                    <Link href="/live" className="transition-colors hover:text-white">Go live</Link>
                    <Link href="/creators" className="transition-colors hover:text-white">Creators</Link>
                    <Link href="/coins" className="transition-colors hover:text-white">Coins</Link>
                    <Link href="/community" className="transition-colors hover:text-white">Communities</Link>
                    <Link href="/safety" className="transition-colors hover:text-white">Safety</Link>
                    <Link href="/about" className="transition-colors hover:text-white">About</Link>
                    <Link href="/login" className="transition-colors hover:text-white">Log in</Link>
                </nav>
                <span className="text-sm text-white/50">© 2026 watchparty</span>
            </div>
        </footer>
    );
}
