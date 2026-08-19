import Link from "next/link";
import type { ReactNode } from "react";

// The shell every legal/policy page renders through — Terms, Privacy, Cookies,
// Accessibility, Ads info, Guidelines.
//
// THEME TOKENS ONLY (bg-background / text-foreground / text-muted-foreground).
// These pages are reachable from BOTH the signed-out marketing site and the
// signed-in app footer, so they have to hold in light and dark rather than
// painting a fixed surface — the fixed-dark rule cuts the other way here.
//
// Sections are DATA, not JSX blobs, so the table of contents can be derived
// from the same list the body renders. One array per page keeps the ids, the
// nav and the headings from drifting apart.

export interface LegalSection {
    id: string;
    heading: string;
    body: ReactNode;
}

export function LegalDoc({
    title,
    summary,
    updated,
    sections,
}: {
    title: string;
    /** One-line plain-English framing under the title. */
    summary: string;
    /** Human-readable effective date, e.g. "August 19, 2026". */
    updated: string;
    sections: LegalSection[];
}) {
    return (
        <article className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 pb-24 pt-10 sm:px-8 lg:flex-row lg:gap-16 lg:pt-16">
            {/* Contents. Sticky on desktop; a plain leading block on mobile so
                the reader still sees the shape of the document before the wall
                of text starts. */}
            <nav
                aria-label="On this page"
                className="shrink-0 lg:sticky lg:top-24 lg:h-fit lg:w-56"
            >
                <p className="text-13 font-bold text-foreground">Contents</p>
                <ul className="mt-3 space-y-1.5">
                    {sections.map((section) => (
                        <li key={section.id}>
                            <a
                                href={`#${section.id}`}
                                className="block text-13 font-semibold leading-snug text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {section.heading}
                            </a>
                        </li>
                    ))}
                </ul>
            </nav>

            <div className="min-w-0 max-w-[680px] flex-1">
                <header>
                    <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tighter sm:text-5xl">
                        {title}
                    </h1>
                    <p className="mt-4 text-lg leading-7 text-muted-foreground">{summary}</p>
                    <p className="mt-6 text-13 font-semibold text-muted-foreground">
                        Last updated {updated}
                    </p>
                </header>

                <div className="mt-12 space-y-12">
                    {sections.map((section) => (
                        <section key={section.id} id={section.id} className="scroll-mt-24">
                            <h2 className="text-2xl font-extrabold tracking-tight">{section.heading}</h2>
                            {/* No `prose` — @tailwindcss/typography is not installed here, so
                                every prose-* class is inert. Child selectors do the work. */}
                            <div className="mt-4 space-y-4 text-15 leading-7 text-muted-foreground [&_a]:font-semibold [&_a]:text-twitter2 [&_a:hover]:underline [&_li]:pl-1 [&_strong]:font-semibold [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                                {section.body}
                            </div>
                        </section>
                    ))}
                </div>

                <footer className="mt-16 border-t border-border pt-8 text-13 leading-6 text-muted-foreground">
                    <p>
                        Questions about this page? Email{" "}
                        <a href="mailto:support@watchparty.xyz" className="font-semibold text-foreground hover:underline">
                            support@watchparty.xyz
                        </a>
                        .
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-semibold">
                        <Link href="/terms" className="transition-colors hover:text-foreground">Terms</Link>
                        <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
                        <Link href="/cookies" className="transition-colors hover:text-foreground">Cookies</Link>
                        <Link href="/accessibility" className="transition-colors hover:text-foreground">Accessibility</Link>
                        <Link href="/ads-info" className="transition-colors hover:text-foreground">Ads info</Link>
                        <Link href="/guidelines" className="transition-colors hover:text-foreground">Guidelines</Link>
                    </div>
                </footer>
            </div>
        </article>
    );
}
