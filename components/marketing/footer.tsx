import Link from "next/link";

// Phantom-shaped footer (matched 1:1 on layout, watchparty colors): a big rounded
// panel with the wordmark on a left rail; a large email "card" (giant placeholder
// + caption + Sign up) on the right with the link columns beneath it; an
// "operational" status pill bottom-left; and © + legal OUTSIDE the panel.
// The whole footer fills ~one screen: min-h-svh with a ~spacing-7 frame around
// the panel; the space UNDER the link columns is deliberate breathing room
// (the user hid the giant wordmark that used to sit there — keep it out).

const COLUMNS: { heading: string; links: { label: string; href: string; external?: boolean }[] }[] = [
    {
        heading: "Watch",
        links: [
            { label: "Explore", href: "/explore" },
            { label: "Go live", href: "/live" },
            { label: "Communities", href: "/community" },
        ],
    },
    {
        heading: "Build",
        links: [
            { label: "Creators", href: "/creators" },
            { label: "Coins", href: "/coins" },
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
        heading: "Social",
        links: [
            { label: "X.com", href: "https://x.com/watchparty.xyz", external: true },
            // TODO: real invite once the Discord exists.
            { label: "Discord", href: "#", external: true },
        ],
    },
];

export function MarketingFooter() {
    return (
        <footer className="flex min-h-svh flex-col p-4 sm:p-7">
            <div className="mx-auto flex w-full max-w-8xl flex-1 flex-col">
                <div className="flex flex-1 flex-col justify-between overflow-hidden rounded-[40px] bg-black px-6 py-12 text-white ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-12 sm:py-14">
                    <div className="flex flex-col gap-10 lg:flex-row lg:gap-16">
                        {/* Left rail — wordmark. */}
                        <div className="lg:w-56">
                            <Link href="/" className="font-pixel text-3xl tracking-tighter">watchparty</Link>
                        </div>

                        {/* Right — big email card, then the link columns beneath it. */}
                        <div className="flex-1">
                            <form
                                action="/login"
                                className="rounded-[28px] bg-white/[0.05] p-6 ring-1 ring-white/10 transition-colors focus-within:ring-white/25 sm:p-8"
                            >
                                <input
                                    type="email"
                                    name="email"
                                    aria-label="Email address"
                                    placeholder="Enter your email"
                                    className="w-full bg-transparent text-3xl font-semibold tracking-tight text-white placeholder:text-white/30 focus:outline-none sm:text-5xl"
                                />
                                <div className="mt-6 flex flex-col gap-4 sm:mt-8 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="max-w-sm text-sm font-medium leading-snug text-white/45">
                                        Sign up for the newsletter and join the growing watchparty community.
                                    </p>
                                    <button
                                        type="submit"
                                        className="shrink-0 self-start rounded-full bg-lantern px-7 py-3 text-sm font-bold text-black transition-transform duration-[160ms] ease-out hover:scale-[1.02] active:scale-[0.97] sm:self-auto"
                                    >
                                        Sign up
                                    </button>
                                </div>
                            </form>

                            <div className="mt-12 grid grid-cols-2 gap-8 sm:grid-cols-4">
                                {COLUMNS.map((col) => (
                                    <div key={col.heading}>
                                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/35">{col.heading}</p>
                                        <ul className="mt-4 space-y-3">
                                            {col.links.map((l) => (
                                                <li key={l.label}>
                                                    {l.external ? (
                                                        <a
                                                            href={l.href}
                                                            {...(l.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                                                            className="text-sm font-semibold text-white/70 transition-colors hover:text-white"
                                                        >
                                                            {l.label}
                                                        </a>
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
                    </div>

                    {/* Status pill anchors the panel's bottom-left; everything
                        above it breathes. */}
                    <span className="mt-12 inline-flex w-fit items-center gap-2 rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/60 ring-1 ring-white/10">
                        <span className="size-2 rounded-full bg-lantern" /> All systems operational
                    </span>
                </div>

                {/* Legal — outside the panel on the light page base, like Phantom. */}
                <div className="mt-5 flex flex-col gap-3 px-2 text-xs font-semibold text-black/40 sm:flex-row sm:items-center sm:justify-between">
                    <span>© 2026 watchparty</span>
                    <div className="flex items-center gap-5">
                        <Link href="/terms" className="transition-colors hover:text-black/70">Terms</Link>
                        <Link href="/privacy" className="transition-colors hover:text-black/70">Privacy</Link>
                        <Link href="/cookies" className="transition-colors hover:text-black/70">Cookies</Link>
                        <Link href="/guidelines" className="transition-colors hover:text-black/70">Guidelines</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
