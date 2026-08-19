import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
    title: "Cookie Policy",
    description: "The cookies and local storage watchparty uses, and what each one does.",
};

// DRAFT POLICY COPY. The named cookies are the ones this app actually sets:
// better-auth's session token + session-data cache (both `__Secure-` prefixed in
// production, see lib/auth/server.ts useSecureCookies), and Cloudflare's own
// security cookies. Theme is localStorage via next-themes, not a cookie — say
// so rather than pretending it is one.

function Row({ name, purpose, life }: { name: string; purpose: string; life: string }) {
    return (
        <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0 sm:flex-row sm:gap-6">
            <code className="shrink-0 font-mono text-13 font-semibold text-foreground sm:w-64">{name}</code>
            <p className="flex-1">{purpose}</p>
            <span className="shrink-0 text-13 font-semibold sm:w-24 sm:text-right">{life}</span>
        </div>
    );
}

const SECTIONS: LegalSection[] = [
    {
        id: "what",
        heading: "What we use, and what we don't",
        body: (
            <>
                <p>
                    A cookie is a small file a site stores in your browser. We use them for three
                    things only: keeping you signed in, remembering a preference you set, and
                    keeping the site up under attack.
                </p>
                <p>
                    <strong>We do not use advertising or cross-site tracking cookies</strong>, and
                    we don&apos;t embed third-party ad pixels. Ads on watchparty are targeted from
                    activity on watchparty — see <Link href="/ads-info">Ads info</Link>.
                </p>
            </>
        ),
    },
    {
        id: "essential",
        heading: "Strictly necessary",
        body: (
            <>
                <p>These can&apos;t be turned off — without them you can&apos;t sign in.</p>
                <div className="mt-4">
                    <Row
                        name="better-auth.session_token"
                        purpose="Identifies your signed-in session. HttpOnly, so scripts can't read it."
                        life="30 days"
                    />
                    <Row
                        name="better-auth.session_data"
                        purpose="A short-lived cache of your session so pages render without a round trip on every request."
                        life="5 minutes"
                    />
                    <Row
                        name="__cf_bm, cf_clearance"
                        purpose="Set by Cloudflare to distinguish humans from bots and to remember that a challenge was passed."
                        life="30 min – 1 year"
                    />
                </div>
                <p className="mt-4">
                    In production these carry the <code className="font-mono">__Secure-</code>{" "}
                    prefix and the <code className="font-mono">.watchparty.xyz</code> domain, so
                    one sign-in works across the app, studio, and console.
                </p>
            </>
        ),
    },
    {
        id: "preferences",
        heading: "Preferences",
        body: (
            <p>
                Your theme (dark, light, or system) and a handful of small UI choices — rail
                collapsed, last-used tab — are stored in your browser&apos;s{" "}
                <strong>local storage</strong>, not in a cookie. They never leave your device and
                are cleared when you clear site data.
            </p>
        ),
    },
    {
        id: "control",
        heading: "How to control them",
        body: (
            <>
                <p>
                    Every browser lets you view, block, and delete cookies for a site, usually
                    under Settings → Privacy. Clearing ours signs you out; blocking them entirely
                    means sign-in won&apos;t work at all.
                </p>
                <p>
                    There is no consent banner here because nothing we set is optional — we have
                    no analytics or advertising cookies to ask you about. If that ever changes,
                    you&apos;ll get the choice before anything is set.
                </p>
            </>
        ),
    },
    {
        id: "more",
        heading: "More",
        body: (
            <p>
                Cookies are one part of a bigger picture; the{" "}
                <Link href="/privacy">Privacy Policy</Link> covers everything else we collect and
                why.
            </p>
        ),
    },
];

export default function CookiesPage() {
    return (
        <LegalDoc
            title="Cookie Policy"
            summary="The handful of cookies watchparty sets, what each one is for, and how to get rid of them."
            updated="August 19, 2026"
            sections={SECTIONS}
        />
    );
}
