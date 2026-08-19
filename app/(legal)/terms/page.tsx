import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
    title: "Terms of Service",
    description: "The agreement between you and watchparty.",
};

// DRAFT POLICY COPY — written to describe how this product actually works
// (non-custodial wallets, USDC subscriptions, creator coins, streaming), not
// lifted from a generator. It still needs review by counsel before launch.
// Keep it in sync with what the code does: the 5% platform fee lives in
// lib/premium/tiers.ts (PLATFORM_FEE_BPS) and the wallet model in lib/chains/.

const SECTIONS: LegalSection[] = [
    {
        id: "agreement",
        heading: "1. The agreement",
        body: (
            <>
                <p>
                    These terms are the agreement between you and watchparty for your use of
                    watchparty.xyz, our mobile apps, our APIs, and everything we build on top of
                    them (the <strong>service</strong>). By creating an account or using the
                    service, you accept them.
                </p>
                <p>
                    Some parts of the service have extra rules that sit alongside these terms:
                    the <Link href="/guidelines">Community Guidelines</Link> govern what you can
                    post and stream, the <Link href="/privacy">Privacy Policy</Link> covers what
                    we do with data, and developers building on our API agree to the developer
                    terms shown when they create an app.
                </p>
            </>
        ),
    },
    {
        id: "eligibility",
        heading: "2. Who can use watchparty",
        body: (
            <>
                <p>
                    You must be at least 13 to hold an account, and at least 18 to use anything
                    that moves money or tokens — wallets, swaps, coin launches, subscriptions,
                    payouts, and ads. If you are under the age of majority where you live, a
                    parent or guardian has to agree to these terms on your behalf.
                </p>
                <p>
                    You may not use the service if you are subject to sanctions, are located in a
                    sanctioned jurisdiction, or are barred from using it under applicable law.
                    Some features are unavailable in some places, and we may geo-restrict them
                    without notice.
                </p>
            </>
        ),
    },
    {
        id: "account",
        heading: "3. Your account",
        body: (
            <>
                <p>
                    You are responsible for your account and for everything that happens through
                    it. Keep your login method secure, and tell us promptly at{" "}
                    <a href="mailto:support@watchparty.xyz">support@watchparty.xyz</a> if you
                    think someone else has access.
                </p>
                <ul>
                    <li>One human per account. Bot and automation accounts are allowed only through the developer platform, and must identify themselves as bots.</li>
                    <li>Handles are assigned, not owned. We can reclaim a handle that impersonates someone, squats a brand, or has been dormant.</li>
                    <li>Don&apos;t buy, sell, or rent accounts.</li>
                </ul>
            </>
        ),
    },
    {
        id: "wallets",
        heading: "4. Wallets, coins, and trading",
        body: (
            <>
                <p>
                    <strong>watchparty is not a bank, broker, exchange, or custodian.</strong>{" "}
                    Wallets on watchparty are non-custodial: transactions are signed with keys you
                    control, and we cannot reverse, freeze, or refund an on-chain transaction once
                    it is confirmed. Blockchains are public and permanent — anything you do on one
                    is visible to everyone, forever.
                </p>
                <p>
                    Tokens launched, traded, or promoted on watchparty are created by users, not
                    by us. We do not endorse them, we do not vouch for them, and nothing on the
                    service is investment, legal, or tax advice. Prices, market data, and
                    projections shown in the app come from third-party sources and can be wrong,
                    stale, or missing.
                </p>
                <ul>
                    <li><strong>You can lose everything you put in.</strong> Crypto assets are volatile and many go to zero.</li>
                    <li>Network fees, slippage, and a platform fee may apply to a swap or a launch. The fee is shown before you confirm.</li>
                    <li>You are responsible for your own taxes and for any reporting your jurisdiction requires.</li>
                    <li>Don&apos;t use watchparty for market manipulation, wash trading, money laundering, or to promote a token you are secretly paid to promote.</li>
                </ul>
            </>
        ),
    },
    {
        id: "content",
        heading: "5. Your content",
        body: (
            <>
                <p>
                    You keep ownership of what you post, stream, and upload. To run the service we
                    need permission to use it: you grant watchparty a worldwide, non-exclusive,
                    royalty-free license to host, store, transcode, cache, reproduce, adapt,
                    publish, and distribute your content for the purpose of operating and
                    promoting the service, including in previews, clips, thumbnails, and
                    recommendations. The license ends when you delete the content, except for
                    copies already shared by others, retained in backups, or required by law.
                </p>
                <p>
                    You promise you have the rights to what you post — including music, clips,
                    and anything else you didn&apos;t make. Repeat copyright infringement gets an
                    account terminated. Send takedown notices to{" "}
                    <a href="mailto:copyright@watchparty.xyz">copyright@watchparty.xyz</a>.
                </p>
                <p>
                    Live streams may be recorded and kept as replays. Captions, moderation, and
                    recommendation systems process content automatically; see the{" "}
                    <Link href="/privacy">Privacy Policy</Link> for what that involves.
                </p>
            </>
        ),
    },
    {
        id: "conduct",
        heading: "6. Rules of the road",
        body: (
            <>
                <p>
                    The <Link href="/guidelines">Community Guidelines</Link> are part of these
                    terms. Beyond them, don&apos;t do any of the following:
                </p>
                <ul>
                    <li>Break the law, or help someone else break it.</li>
                    <li>Scrape, crawl, or bulk-download the service outside our published API and its rate limits.</li>
                    <li>Probe, overload, or interfere with the service, or bypass a rate limit, paywall, or access control.</li>
                    <li>Reverse-engineer the service except where that right can&apos;t be waived by law.</li>
                    <li>Impersonate a person or organisation, or misrepresent your affiliation.</li>
                    <li>Use the service to distribute malware, phishing, drainers, or fake token approvals.</li>
                </ul>
            </>
        ),
    },
    {
        id: "payments",
        heading: "7. Payments, subscriptions, and payouts",
        body: (
            <>
                <p>
                    Premium plans and creator subscriptions are billed in USDC on-chain through a
                    recurring allowance you approve in your wallet. Each period, the amount you
                    approved is collected automatically until you cancel. Cancelling stops future
                    collections; it does not refund the period you are in, and access runs to the
                    end of that period.
                </p>
                <ul>
                    <li>Prices are shown before you subscribe and can change with notice for future periods.</li>
                    <li>A failed collection puts a subscription into a short grace window before access ends.</li>
                    <li>Creators are paid from their balance minus a platform fee of 5%, shown in the app at claim time.</li>
                    <li>Advertising is prepaid with ad credits. Credits are not currency, have no cash value, and are not refundable except where the law requires it.</li>
                </ul>
                <p>
                    Because payments settle on-chain, we can&apos;t reverse them. If something is
                    genuinely broken on our side, email{" "}
                    <a href="mailto:support@watchparty.xyz">support@watchparty.xyz</a> and we will
                    make it right where we can.
                </p>
            </>
        ),
    },
    {
        id: "third-parties",
        heading: "8. Third parties",
        body: (
            <p>
                The service depends on things we don&apos;t run: blockchains and their validators,
                RPC and indexing providers, wallet apps and browser extensions, payment and
                on-ramp providers, streaming infrastructure, and apps you connect to your account
                through &ldquo;Sign in with watchparty&rdquo;. We are not responsible for how they
                behave, for outages on their side, or for what a third-party app does with access
                you granted it. You can review and revoke connected apps at any time in your
                settings.
            </p>
        ),
    },
    {
        id: "enforcement",
        heading: "9. Suspension and termination",
        body: (
            <>
                <p>
                    We can limit, suspend, or terminate an account that breaks these terms or the
                    guidelines, that creates legal risk for us or for other people, or that we are
                    required to act on. Where it is reasonable to do so, we tell you why and give
                    you a way to appeal.
                </p>
                <p>
                    You can delete your account at any time from settings. Deleting your account
                    does not remove content from a blockchain, and does not cancel an on-chain
                    allowance you approved — revoke that from your wallet.
                </p>
            </>
        ),
    },
    {
        id: "disclaimers",
        heading: "10. Disclaimers and liability",
        body: (
            <>
                <p>
                    The service is provided <strong>&ldquo;as is&rdquo;</strong>, without
                    warranties of any kind, to the fullest extent the law allows. We don&apos;t
                    promise the service will be uninterrupted, error-free, or that data shown in
                    it is accurate.
                </p>
                <p>
                    To the fullest extent permitted by law, watchparty is not liable for indirect,
                    incidental, special, consequential, or punitive damages, or for lost profits,
                    lost tokens, or lost data. Where liability cannot be excluded, our total
                    liability to you is limited to the greater of the amount you paid us in the
                    twelve months before the claim, or USD 100. Nothing here limits liability that
                    can&apos;t be limited under the law that applies to you.
                </p>
            </>
        ),
    },
    {
        id: "disputes",
        heading: "11. Disputes and governing law",
        body: (
            <p>
                These terms are governed by the laws of the State of Delaware, USA, without regard
                to its conflict-of-laws rules, and the courts located there have exclusive
                jurisdiction — except where the law of your home country gives you the right to
                bring a claim locally, which we do not take away. Before filing anything, email{" "}
                <a href="mailto:legal@watchparty.xyz">legal@watchparty.xyz</a>; most things are
                faster to fix than to litigate.
            </p>
        ),
    },
    {
        id: "changes",
        heading: "12. Changes to these terms",
        body: (
            <p>
                We update these terms as the product changes. If a change is material we will give
                notice in the app or by email before it takes effect, and the date at the top of
                this page always reflects the current version. Continuing to use the service after
                a change means you accept it.
            </p>
        ),
    },
];

export default function TermsPage() {
    return (
        <LegalDoc
            title="Terms of Service"
            summary="What you agree to when you use watchparty — the account rules, how money and tokens work, and what we each owe the other."
            updated="August 19, 2026"
            sections={SECTIONS}
        />
    );
}
