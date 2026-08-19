import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
    title: "Privacy Policy",
    description: "What watchparty collects, why, and what you can do about it.",
};

// DRAFT POLICY COPY — describes this app's real data flows (better-auth
// accounts, Supabase/Postgres, Cloudflare, Resend email, AWS IVS + Deepgram for
// streams and captions, chain data providers, the ads system). Update it when a
// processor changes; it names categories rather than exhaustive vendor lists so
// it stays true. Needs review by counsel before launch.

const SECTIONS: LegalSection[] = [
    {
        id: "summary",
        heading: "The short version",
        body: (
            <ul>
                <li>We collect what an account needs to work, plus what the law makes us keep.</li>
                <li><strong>We do not sell your personal information</strong>, and we don&apos;t run cross-site advertising trackers.</li>
                <li>We never see your wallet&apos;s private keys or seed phrase, and we don&apos;t track your balances for advertising.</li>
                <li>Anything you do on a blockchain is public and permanent. That is the chain, not us, and it can&apos;t be deleted.</li>
                <li>You can export or delete your account data from settings, or by emailing us.</li>
            </ul>
        ),
    },
    {
        id: "what-we-collect",
        heading: "What we collect",
        body: (
            <>
                <p><strong>Things you give us.</strong></p>
                <ul>
                    <li>Account basics: email address or the identifier from the login provider you chose (Google, Apple, X, a passkey, or a wallet signature), your handle, display name, avatar, and bio.</li>
                    <li>Public wallet addresses you link to your account.</li>
                    <li>Content: posts, comments, streams and their replays, uploads, messages, and reactions.</li>
                    <li>Support and verification correspondence, and anything you send us in it.</li>
                    <li>Payment and payout details you enter for subscriptions, creator earnings, or ads.</li>
                </ul>
                <p><strong>Things we collect automatically.</strong></p>
                <ul>
                    <li>Device and connection data: IP address, user agent, approximate region, and language.</li>
                    <li>Usage data: pages and streams you open, what you watch and for how long, and what you interact with.</li>
                    <li>Security and abuse signals: sign-in attempts, rate-limit hits, and bot-detection results.</li>
                </ul>
                <p><strong>Things we read from public sources.</strong> On-chain activity for addresses you link, and market data about tokens shown in the app. This information is already public; we index it so the app can show it.</p>
            </>
        ),
    },
    {
        id: "why",
        heading: "Why we use it",
        body: (
            <ul>
                <li><strong>To run the service</strong> — authenticate you, deliver streams, send messages, and show your feed.</li>
                <li><strong>To personalise</strong> — rank your feed and recommend streams, creators, and coins.</li>
                <li><strong>To keep it safe</strong> — detect spam, scams, fraud, and abuse, and enforce the <Link href="/guidelines">guidelines</Link>.</li>
                <li><strong>To handle money</strong> — process subscriptions, creator payouts, and ad credits, and meet our accounting and compliance duties.</li>
                <li><strong>To support you</strong> — answer your emails and investigate problems.</li>
                <li><strong>To improve</strong> — understand which features get used and where the product breaks.</li>
            </ul>
        ),
    },
    {
        id: "wallets",
        heading: "Wallets and on-chain data",
        body: (
            <>
                <p>
                    Wallets on watchparty are non-custodial. Keys are held by you or split so that
                    signing requires your participation — <strong>we never receive your seed
                    phrase</strong>, and we can&apos;t move your funds.
                </p>
                <p>
                    Linking a wallet does associate that public address with your account for us.
                    Because the chain is public, anyone can look up that address&apos;s history,
                    and once you post from a linked address the association can be inferred by
                    others too. Unlinking removes the association on our side; it does not remove
                    anything from the chain.
                </p>
            </>
        ),
    },
    {
        id: "sharing",
        heading: "Who we share it with",
        body: (
            <>
                <p>We share personal information only in these cases:</p>
                <ul>
                    <li><strong>Service providers</strong> who process it on our instructions — hosting and edge delivery, our database, transactional email, live-video and caption processing, blockchain data providers, and payment providers. They may only use it to provide their service to us.</li>
                    <li><strong>Apps you connect</strong> through &ldquo;Sign in with watchparty&rdquo;, limited to the scopes you approved. You can revoke them any time in settings.</li>
                    <li><strong>Other users</strong>, for anything you make public: your profile, posts, streams, and public interactions.</li>
                    <li><strong>Legal reasons</strong> — when we&apos;re required by valid legal process, or where it&apos;s necessary to protect someone&apos;s safety or our rights.</li>
                    <li><strong>A successor</strong>, if the company is acquired or merges, subject to this policy.</li>
                </ul>
                <p>We do not sell personal information, and we do not share it for cross-context behavioural advertising.</p>
            </>
        ),
    },
    {
        id: "ads",
        heading: "Advertising",
        body: (
            <p>
                Ads on watchparty are targeted using activity on watchparty — what you watch and
                follow here — and coarse signals like country and device type. We don&apos;t use
                your wallet balances or your on-chain holdings to target ads, and we don&apos;t
                buy audience data about you from data brokers. Advertisers get aggregate
                performance reporting, never your identity. There&apos;s more detail, including
                how to see fewer personalised ads, on the{" "}
                <Link href="/ads-info">Ads info</Link> page.
            </p>
        ),
    },
    {
        id: "cookies",
        heading: "Cookies",
        body: (
            <p>
                We use cookies and similar storage to keep you signed in, remember preferences
                like your theme, and protect against abuse. We don&apos;t run third-party
                advertising cookies. The <Link href="/cookies">Cookie Policy</Link> lists what is
                set and what each one does.
            </p>
        ),
    },
    {
        id: "retention",
        heading: "How long we keep it",
        body: (
            <ul>
                <li>Account data: while your account exists, then deleted or anonymised within 30 days of deletion.</li>
                <li>Content: until you delete it, or your account is deleted. Backups age out within 90 days.</li>
                <li>Security logs: up to 12 months.</li>
                <li>Financial records: as long as tax and accounting law requires, typically 7 years.</li>
                <li>On-chain data: forever, by design. Nobody can delete it.</li>
            </ul>
        ),
    },
    {
        id: "rights",
        heading: "Your rights",
        body: (
            <>
                <p>
                    Depending on where you live — including under the GDPR in the EEA and UK, and
                    the CCPA/CPRA in California — you can ask us to give you a copy of your data,
                    correct it, delete it, restrict or object to certain processing, or port it
                    elsewhere. Exercising a right never costs you service or a worse price.
                </p>
                <p>
                    Most of it is self-serve in settings. For anything else, email{" "}
                    <a href="mailto:privacy@watchparty.xyz">privacy@watchparty.xyz</a> from the
                    address on your account and we&apos;ll respond within 30 days. If you&apos;re
                    in the EEA or UK, you also have the right to complain to your local data
                    protection authority.
                </p>
            </>
        ),
    },
    {
        id: "security",
        heading: "Security and transfers",
        body: (
            <p>
                We use encryption in transit, encryption at rest for sensitive fields,
                end-to-end encryption for direct and group messages, and least-privilege access
                for staff. No system is perfect; if a breach affects you we&apos;ll notify you and
                the relevant regulator as the law requires. We operate globally, so your data may
                be processed in countries other than yours — including the United States — under
                appropriate safeguards such as standard contractual clauses.
            </p>
        ),
    },
    {
        id: "children",
        heading: "Children",
        body: (
            <p>
                watchparty is not for children under 13, and financial features are limited to
                adults. We don&apos;t knowingly collect data from children under 13; if we learn
                we have, we delete the account. If you believe a child has an account here, email{" "}
                <a href="mailto:privacy@watchparty.xyz">privacy@watchparty.xyz</a>.
            </p>
        ),
    },
    {
        id: "changes",
        heading: "Changes",
        body: (
            <p>
                When this policy changes we update the date at the top, and we give notice in the
                app or by email before a material change takes effect.
            </p>
        ),
    },
];

export default function PrivacyPage() {
    return (
        <LegalDoc
            title="Privacy Policy"
            summary="What watchparty collects, why we collect it, who sees it, and how to get it back or get rid of it."
            updated="August 19, 2026"
            sections={SECTIONS}
        />
    );
}
