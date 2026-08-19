import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, type LegalSection } from "@/components/legal/legal-doc";

export const metadata: Metadata = {
    title: "Community Guidelines",
    description: "What's allowed on watchparty, what isn't, and what happens when someone crosses the line.",
};

// DRAFT POLICY COPY. These are referenced from the upload flow
// (components/app-ui/create-dialog.tsx) and from the Terms, which incorporate
// them by reference — so keep the section ids stable once links point at them.

const SECTIONS: LegalSection[] = [
    {
        id: "principle",
        heading: "The one rule",
        body: (
            <p>
                watchparty is a place to stream, post, and trade with people. Everything below
                follows from one idea: <strong>don&apos;t use this platform to hurt or deceive
                someone.</strong> If a thing you&apos;re about to post only works because the
                person on the other end doesn&apos;t know something, it&apos;s probably against
                these guidelines.
            </p>
        ),
    },
    {
        id: "financial",
        heading: "Scams and financial harm",
        body: (
            <>
                <p>
                    Coins are core to watchparty, which makes financial deception the harm we
                    police hardest. Not allowed:
                </p>
                <ul>
                    <li>Drainers, fake token approvals, phishing links, and malicious contracts.</li>
                    <li>Impersonating a project, a creator, or a token, including lookalike tickers, handles, and domains.</li>
                    <li>Pump-and-dumps, wash trading, spoofing, and coordinated manipulation.</li>
                    <li>Guaranteed returns, &ldquo;risk-free&rdquo; trading, signal groups, and recovery scams.</li>
                    <li>Promoting a coin you are paid to promote, or that you are quietly dumping, without saying so.</li>
                    <li>Fake giveaways and airdrops, including &ldquo;send 1 to get 2 back&rdquo;.</li>
                </ul>
                <p>
                    Launching a coin as a joke is fine. Launching one while telling people it will
                    make them rich is not.
                </p>
            </>
        ),
    },
    {
        id: "safety",
        heading: "Safety and violence",
        body: (
            <ul>
                <li>No threats, incitement to violence, or glorification of violent extremism.</li>
                <li>No content promoting self-harm, suicide, or eating disorders. If you&apos;re struggling, contact your local crisis line — we&apos;ll surface resources when we detect this.</li>
                <li>No graphic violence or gore for shock value. Newsworthy footage may be allowed behind a warning.</li>
                <li>No coordination of illegal activity, including trafficking in weapons, drugs, or people.</li>
            </ul>
        ),
    },
    {
        id: "abuse",
        heading: "Harassment and hate",
        body: (
            <ul>
                <li>No targeted harassment, brigading, or pile-ons, including organising one off-platform.</li>
                <li>No slurs or dehumanising content aimed at people based on race, ethnicity, national origin, caste, religion, disability, disease, age, sex, gender identity, or sexual orientation.</li>
                <li>No doxxing — home addresses, phone numbers, private documents, or a person&apos;s wallet identity when they haven&apos;t linked it publicly themselves.</li>
                <li>No non-consensual intimate imagery, and no sexualised content involving minors of any kind. This is reported to the authorities, always.</li>
            </ul>
        ),
    },
    {
        id: "authenticity",
        heading: "Authenticity",
        body: (
            <ul>
                <li>No impersonation of people, brands, or organisations. Parody and fan accounts are fine when they say so in the name and the bio.</li>
                <li>No engagement farming through bought followers, view botting, or coordinated inauthentic accounts.</li>
                <li>Label synthetic and AI-generated media that could be mistaken for real, especially of real people.</li>
                <li>Bots are welcome through the developer platform, and must identify themselves as bots.</li>
            </ul>
        ),
    },
    {
        id: "adult",
        heading: "Adult and sensitive content",
        body: (
            <p>
                Nudity and sexual content are not permitted in streams, thumbnails, avatars, or
                banners. Mature themes — strong language, mature games, frank discussion — are
                fine when the stream is marked as mature so it stays out of general discovery
                surfaces.
            </p>
        ),
    },
    {
        id: "ip",
        heading: "Other people's work",
        body: (
            <p>
                Only stream and upload what you have the rights to. Music, films, sports feeds,
                and other people&apos;s clips are the usual way accounts get struck. Copyright
                complaints go to{" "}
                <a href="mailto:copyright@watchparty.xyz">copyright@watchparty.xyz</a>; repeat
                infringement ends an account.
            </p>
        ),
    },
    {
        id: "enforcement",
        heading: "How we enforce",
        body: (
            <>
                <p>
                    We weigh severity, intent, and history. In rough order: removing the content,
                    limiting reach, restricting a feature, a temporary suspension, and permanent
                    termination. Scams, CSAM, and credible threats skip straight to the end.
                </p>
                <p>
                    Creators moderate their own chats and communities and can ban and time out
                    people there. That doesn&apos;t replace platform enforcement — reports still
                    come to us.
                </p>
            </>
        ),
    },
    {
        id: "reporting",
        heading: "Reporting and appeals",
        body: (
            <>
                <p>
                    Report from the ⋯ menu on any post, stream, message, or profile. Urgent safety
                    issues go to{" "}
                    <a href="mailto:safety@watchparty.xyz">safety@watchparty.xyz</a> and are
                    triaged first.
                </p>
                <p>
                    If we act on your account we tell you what rule was broken. You can reply to
                    that notice to appeal, and a different person reviews it. We do get things
                    wrong, and we reverse them when we do.
                </p>
                <p>
                    These guidelines are part of the <Link href="/terms">Terms of Service</Link>.
                </p>
            </>
        ),
    },
];

export default function GuidelinesPage() {
    return (
        <LegalDoc
            title="Community Guidelines"
            summary="What's allowed on watchparty, what isn't, and what happens when someone crosses the line."
            updated="August 19, 2026"
            sections={SECTIONS}
        />
    );
}
