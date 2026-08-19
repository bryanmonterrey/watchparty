import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
    title: "Ads info",
    description: "How ads on watchparty work, what they're targeted with, and how to advertise.",
};

// DRAFT POLICY COPY. Reflects the ads system as built: first-party targeting
// from on-platform activity, prepaid ad credits (1 credit = $1), no wallet
// balance or holdings used for targeting. Keep in sync with the ads schema and
// lib/api-pricing / ad credits model if the commercial terms change.

const SECTIONS: LegalSection[] = [
    {
        id: "why-ads",
        heading: "Why you see ads",
        body: (
            <>
                <p>
                    Ads keep watchparty free to watch. They&apos;re labelled{" "}
                    <strong>Sponsored</strong> wherever they appear — in the feed, on stream
                    pages, and in discovery surfaces — and they follow the same{" "}
                    <Link href="/guidelines">Community Guidelines</Link> as everything else, plus
                    the extra rules below.
                </p>
                <p>
                    Paying for the app changes the ad load: the Basic plan reduces it, and the
                    Premium and Business plans remove it entirely. Ads are never inserted into a
                    creator&apos;s live stream without them opting in and getting a share.
                </p>
            </>
        ),
    },
    {
        id: "targeting",
        heading: "What ads are targeted with",
        body: (
            <>
                <p>An advertiser can ask us to show an ad based on:</p>
                <ul>
                    <li>What you watch, follow, and interact with <strong>on watchparty</strong>.</li>
                    <li>Coarse location — country or region, derived from your IP address.</li>
                    <li>Device type and language.</li>
                    <li>Topics and categories associated with the content you&apos;re looking at right now.</li>
                </ul>
                <p>And never on:</p>
                <ul>
                    <li><strong>Your wallet balances or token holdings.</strong> The ad system has no access to them.</li>
                    <li>The contents of your direct or group messages, which are end-to-end encrypted.</li>
                    <li>Audience data bought from data brokers — we don&apos;t buy any.</li>
                    <li>Sensitive categories such as health, religion, sexual orientation, or political affiliation.</li>
                </ul>
                <p>
                    Advertisers see aggregate performance — impressions, clicks, conversions — not
                    who you are.
                </p>
            </>
        ),
    },
    {
        id: "controls",
        heading: "Your controls",
        body: (
            <>
                <p>Today:</p>
                <ul>
                    <li><strong>Report an ad</strong> from the report action on it, or by emailing <a href="mailto:ads@watchparty.xyz">ads@watchparty.xyz</a>. Reported ads jump the review queue.</li>
                    <li><strong>Block the account</strong> behind an ad to stop its content reaching you.</li>
                    <li><strong>Subscribe</strong> — the Basic plan reduces ads, Premium and Business remove them.</li>
                    <li><strong>Opt out of personalisation</strong> by emailing <a href="mailto:privacy@watchparty.xyz">privacy@watchparty.xyz</a>. We&apos;ll switch your account to ads targeted only on what you&apos;re currently viewing.</li>
                </ul>
                <p>
                    In progress: a per-ad &ldquo;hide this&rdquo; control and a self-serve
                    personalisation toggle in settings, so the last item stops needing an email.
                </p>
            </>
        ),
    },
    {
        id: "advertisers",
        heading: "If you want to advertise",
        body: (
            <>
                <p>
                    Advertising is prepaid with <strong>ad credits</strong>: 1 credit = 1 USD of
                    delivery. You top up a balance, campaigns spend against it, and delivery stops
                    when it hits zero. Credits are not a currency, have no cash value, can&apos;t
                    be transferred between accounts, and are refundable only where the law
                    requires it.
                </p>
                <p>Every campaign is reviewed before it runs. We reject ads that:</p>
                <ul>
                    <li>Promise or imply investment returns, guaranteed yield, or &ldquo;risk-free&rdquo; trading.</li>
                    <li>Impersonate a person, project, or token, or use a lookalike ticker or domain.</li>
                    <li>Promote drainers, fake airdrops, giveaways, or token approvals.</li>
                    <li>Target minors, or run in a jurisdiction where the product is unlawful.</li>
                    <li>Mislead about who is paying — the paying account is always disclosed.</li>
                </ul>
                <p>
                    Financial-product ads may require additional verification and are geo-limited
                    to places where the advertiser is licensed to promote them.
                </p>
            </>
        ),
    },
    {
        id: "creators",
        heading: "Creators and paid promotion",
        body: (
            <p>
                If someone pays you to feature a coin, a product, or a project, you must disclose
                it in the stream or post — clearly, in the content itself, not just in a
                description. Undisclosed paid promotion is a guidelines violation and, for
                financial products, is illegal in many countries.
            </p>
        ),
    },
    {
        id: "report",
        heading: "Reporting an ad",
        body: (
            <p>
                Use the report action on the ad itself, or email{" "}
                <a href="mailto:ads@watchparty.xyz">ads@watchparty.xyz</a> with a screenshot. We
                review reported ads ahead of the normal queue, and we pull anything that looks
                like a scam while we investigate. Data questions are covered in the{" "}
                <Link href="/privacy">Privacy Policy</Link>.
            </p>
        ),
    },
];

export default function AdsInfoPage() {
    return (
        <LegalDoc
            title="Ads info"
            summary="Why you see ads on watchparty, what they can and can't be targeted with, and the rules advertisers have to follow."
            updated="August 19, 2026"
            sections={SECTIONS}
        />
    );
}
