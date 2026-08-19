import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
    title: "Accessibility",
    description: "How watchparty works with assistive technology, and what we're still fixing.",
};

// DRAFT STATEMENT. Written to be honest about the current state rather than
// claiming conformance we haven't audited — an accessibility statement that
// overclaims is worse than none. Update the "known gaps" list as they close.

const SECTIONS: LegalSection[] = [
    {
        id: "commitment",
        heading: "Our commitment",
        body: (
            <>
                <p>
                    watchparty should be usable with a keyboard, with a screen reader, at any zoom
                    level, and by people who need motion turned down. We build against{" "}
                    <strong>WCAG 2.2 level AA</strong> as the target and treat accessibility bugs
                    as bugs, not as feature requests.
                </p>
                <p>
                    We haven&apos;t completed a formal third-party audit yet, so we don&apos;t
                    claim full conformance. What follows is what actually holds today and what
                    doesn&apos;t.
                </p>
            </>
        ),
    },
    {
        id: "what-works",
        heading: "What we build to",
        body: (
            <>
                <p>
                    These are the rules the app is built against. They are self-assessed, not yet
                    verified by an external audit, so treat them as our standard rather than as a
                    guarantee.
                </p>
                <ul>
                    <li><strong>Keyboard</strong> — interactive controls are reachable and operable by keyboard, with a visible focus ring. Dialogs trap focus and return it to the trigger when they close.</li>
                    <li><strong>Screen readers</strong> — landmarks, headings, labelled controls, and alt text on uploaded images.</li>
                    <li><strong>Contrast</strong> — text and UI chrome target the 4.5:1 (text) and 3:1 (non-text) thresholds in both light and dark themes.</li>
                    <li><strong>Reduced motion</strong> — animation honours <code className="font-mono">prefers-reduced-motion</code>.</li>
                    <li><strong>Zoom and reflow</strong> — layouts are built mobile-first and reflow rather than scrolling horizontally.</li>
                    <li><strong>Captions</strong> — live streams carry automatic captions, and creators can supply their own for replays.</li>
                    <li><strong>Themes</strong> — a light theme, a dark theme, and a system-follow option.</li>
                </ul>
            </>
        ),
    },
    {
        id: "gaps",
        heading: "Known gaps we're working on",
        body: (
            <ul>
                <li>Automatic captions are machine-generated and get names, tickers, and slang wrong.</li>
                <li>Some data-dense trading surfaces — candlestick charts and depth views — have no equivalent non-visual presentation yet.</li>
                <li>A few older screens carry inherited markup with weaker heading structure than the rest of the app.</li>
                <li>Emoji and reaction pickers are keyboard-operable but not yet comfortable with a screen reader.</li>
            </ul>
        ),
    },
    {
        id: "feedback",
        heading: "Tell us what's broken",
        body: (
            <>
                <p>
                    If something blocks you, we want to hear about it — that&apos;s the fastest
                    route to a fix. Email{" "}
                    <a href="mailto:accessibility@watchparty.xyz">accessibility@watchparty.xyz</a>{" "}
                    with the page, what you were trying to do, and the assistive technology and
                    browser you use.
                </p>
                <p>
                    We aim to acknowledge within 2 business days and to give you a timeline, or a
                    workaround, within 10. Accessibility reports jump the normal support queue.
                </p>
            </>
        ),
    },
    {
        id: "related",
        heading: "Related",
        body: (
            <p>
                See also the <Link href="/terms">Terms of Service</Link> and the{" "}
                <Link href="/guidelines">Community Guidelines</Link>, which cover conduct that
                makes the platform harder to use for everyone.
            </p>
        ),
    },
];

export default function AccessibilityPage() {
    return (
        <LegalDoc
            title="Accessibility"
            summary="What holds today, what doesn't, and how to reach a human when something blocks you."
            updated="August 19, 2026"
            sections={SECTIONS}
        />
    );
}
