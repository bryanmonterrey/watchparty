import Link from "next/link";

// Phantom-style footer: one big rounded dark panel (floats on the page, no hard
// full-bleed edge) holding a newsletter capture on the left and link columns on
// the right, with a status pill + legal row underneath. watchparty brand: pixel
// wordmark, lantern accent, aggressive rounding, inset highlight (no drop shadow).

const COLUMNS: { heading: string; links: { label: string; href: string; external?: boolean }[] }[] = [
    {
        heading: "Product",
        links: [
            { label: "Explore", href: "/explore" },
            { label: "Go live", href: "/live" },
            { label: "Creators", href: "/creators" },
            { label: "Coins", href: "/coins" },
            { label: "Communities", href: "/community" },
            { label: "Safety", href: "/safety" },
        ],
    },
    {
        heading: "Company",
        links: [
            { label: "About", href: "/about" },
            { label: "Log in", href: "/login" },
            { label: "Get started", href: "/login" },
        ],
    },
    {
        // TODO: point these at the real handles once they exist.
        heading: "Social",
        links: [
            { label: "X", href: "#", external: true },
            { label: "Discord", href: "#", external: true },
            { label: "YouTube", href: "#", external: true },
        ],
    },
];

export function MarketingFooter() {
    return (
        <footer className="px-4 pb-6 pt-4 sm:px-6">
            <div className="mx-auto w-full max-w-8xl overflow-hidden rounded-[40px] bg-black px-6 py-12 text-white ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-12 sm:py-16">
                <div className="flex flex-col gap-12 lg:flex-row lg:justify-between">
                    {/* Newsletter / join */}
                    <div className="max-w-sm">
                        <Link href="/" className="font-pixel text-2xl tracking-tighter">watchparty</Link>
                        <p className="mt-4 text-lg font-semibold leading-snug text-white/55">
                            One login for the whole internet. Join the party.
                        </p>
                        <form action="/login" className="mt-6 flex items-center gap-1.5 rounded-full bg-white/[0.06] p-1.5 ring-1 ring-white/10">
                            <input
                                type="email"
                                name="email"
                                aria-label="Email address"
                                placeholder="Enter your email"
                                className="min-w-0 flex-1 bg-transparent px-4 text-sm font-semibold text-white placeholder:text-white/35 focus:outline-none"
                            />
                            <button
                                type="submit"
                                className="shrink-0 rounded-full bg-lantern px-5 py-2.5 text-sm font-bold text-black transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                            >
                                Sign up
                            </button>
                        </form>
                    </div>

                    {/* Link columns */}
                    <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:gap-16">
                        {COLUMNS.map((col) => (
                            <div key={col.heading}>
                                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">{col.heading}</p>
                                <ul className="mt-4 space-y-3">
                                    {col.links.map((l) => (
                                        <li key={l.label}>
                                            {l.external ? (
                                                <a href={l.href} className="text-sm font-semibold text-white/70 transition-colors hover:text-white">{l.label}</a>
                                            ) : (
                                                <Link href={l.href} className="text-sm font-semibold text-white/70 transition-colors hover:text-white">{l.label}</Link>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Status + legal */}
                <div className="mt-14 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold text-white/50">
                        <span className="size-2 rounded-full bg-lantern" /> All systems go
                    </span>
                    <div className="flex items-center gap-5 text-xs font-semibold text-white/40">
                        <Link href="/safety" className="transition-colors hover:text-white/70">Terms</Link>
                        <Link href="/safety" className="transition-colors hover:text-white/70">Privacy</Link>
                        <span className="text-white/30">© 2026 watchparty</span>
                    </div>
                </div>
            </div>
        </footer>
    );
}
