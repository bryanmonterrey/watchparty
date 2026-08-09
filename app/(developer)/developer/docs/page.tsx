import { Metadata } from "next";
import Link from "next/link";
import { CodeCard, K, S, P } from "@/components/developer/dev-mocks";

export const metadata: Metadata = { title: "API docs" };

// Public API documentation for the 402 gate. Static on purpose — this page is
// the contract, and a contract shouldn't need a client bundle. Content mirrors
// docs/api-monetization.md minus the ops half (secrets, rollout, exemptions).

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
        <section id={id} className="scroll-mt-28 border-t border-black/[0.08] py-12 first:border-t-0 first:pt-0">
            <h2 className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl">{title}</h2>
            <div className="mt-4 flex flex-col gap-4 text-[15px] font-semibold leading-relaxed text-black/65">
                {children}
            </div>
        </section>
    );
}

function Mono({ children }: { children: React.ReactNode }) {
    return <code className="rounded-md bg-black/[0.06] px-1.5 py-0.5 font-mono text-[13px] font-semibold text-black">{children}</code>;
}

const TOC = [
    ["overview", "Overview"],
    ["auth", "Authentication"],
    ["pricing", "Pricing"],
    ["x402", "Paying per request (x402)"],
    ["errors", "Errors"],
] as const;

export default function DocsPage() {
    return (
        <div className="bg-white pb-24 pt-28 sm:pt-32">
            <div className="mx-auto w-full max-w-3xl px-6">
                <p className="text-sm font-bold text-black/45">
                    <Link href="/developer" className="hover:text-black">Developers</Link>
                    <span className="mx-2">/</span>Docs
                </p>
                <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-black sm:text-5xl">API documentation</h1>
                <p className="mt-4 max-w-xl text-lg font-semibold leading-snug text-black/60">
                    Everything billed, priced, and authenticated in one page. If something here surprises you, the page is wrong — tell us.
                </p>

                <nav className="mt-8 flex flex-wrap gap-2">
                    {TOC.map(([id, label]) => (
                        <a key={id} href={`#${id}`} className="rounded-full bg-black/[0.05] px-4 py-2 text-[13px] font-bold text-black/70 transition-colors hover:bg-black/[0.09] hover:text-black">
                            {label}
                        </a>
                    ))}
                </nav>

                <div className="mt-12">
                    <Section id="overview" title="Overview">
                        <p>
                            The API is the same one the app runs on, served from{" "}
                            <Mono>https://watchparty.xyz/api</Mono>. Using the app — web, mobile,
                            embeds — is free. Programmatic access from outside the app is billed
                            per request, and there are two ways to pay: a funded <strong>API key</strong>,
                            or <strong>x402</strong> — a per-request USDC payment with no account at all.
                        </p>
                        <p>
                            Data reads go through tRPC at{" "}
                            <Mono>/api/trpc/&lt;procedure&gt;</Mono> (GET for queries, with{" "}
                            <Mono>?input=</Mono> as URL-encoded JSON). Chart data is at{" "}
                            <Mono>/api/udf</Mono> in TradingView UDF shape, and a Solana RPC proxy
                            lives at <Mono>/api/rpc</Mono>.
                        </p>
                        <CodeCard label="terminal">
                            <span className="text-white/40">$ </span>curl <S>&quot;https://watchparty.xyz/api/trpc/trade.getFeed?batch=1&amp;input=%7B%7D&quot;</S> \{"\n"}
                            {"    "}-H <S>&quot;x-api-key: wp_live_9f2c…&quot;</S>
                        </CodeCard>
                    </Section>

                    <Section id="auth" title="Authentication">
                        <p>
                            Send your key in the <Mono>x-api-key</Mono> header on every request.
                            That&apos;s the entire integration — no OAuth, no signing, no app review.
                        </p>
                        <p>
                            Keys look like <Mono>wp_live_&lt;id&gt;.&lt;secret&gt;</Mono> and are shown{" "}
                            <strong>once</strong>, at creation, in the{" "}
                            <Link href="/developer/console" className="font-bold text-black underline underline-offset-4">console</Link>.
                            We store a hash, never the key. Revoking a key stops it within seconds;
                            treat a leaked key like leaked money, because it is.
                        </p>
                    </Section>

                    <Section id="pricing" title="Pricing">
                        <p>
                            A flat <strong>$0.001 per billed request</strong>, deducted from your
                            key&apos;s credit balance. 1 credit = $1 = 1 USDC = 1,000 requests. No
                            monthly fee, no minimum, no rate-limit tiers to buy. Balances and
                            lifetime spend are always visible in the console.
                        </p>
                        <p>
                            Responses to a request you didn&apos;t pay for (bad key, empty balance)
                            are free and answer <Mono>402</Mono> — you are never charged for a
                            rejection.
                        </p>
                    </Section>

                    <Section id="x402" title="Paying per request (x402)">
                        <p>
                            No key? Call anyway. The response is <Mono>402 Payment Required</Mono>{" "}
                            with an{" "}
                            <a href="https://www.x402.org" className="font-bold text-black underline underline-offset-4" rel="noreferrer" target="_blank">x402</a>{" "}
                            challenge describing exactly what to pay, in USDC on Solana:
                        </p>
                        <CodeCard label="402 · payment required">
                            <P>{"{"}</P>{"\n"}
                            {"  "}<K>&quot;x402Version&quot;</K><P>:</P> 1<P>,</P>{"\n"}
                            {"  "}<K>&quot;error&quot;</K><P>:</P> <S>&quot;Payment or API key required…&quot;</S><P>,</P>{"\n"}
                            {"  "}<K>&quot;accepts&quot;</K><P>: [{"{"}</P>{"\n"}
                            {"    "}<K>&quot;scheme&quot;</K><P>:</P> <S>&quot;exact&quot;</S><P>,</P>{"\n"}
                            {"    "}<K>&quot;network&quot;</K><P>:</P> <S>&quot;solana&quot;</S><P>,</P>{"\n"}
                            {"    "}<K>&quot;maxAmountRequired&quot;</K><P>:</P> <S>&quot;1000&quot;</S><P>,</P>{"\n"}
                            {"    "}<K>&quot;payTo&quot;</K><P>:</P> <S>&quot;&lt;treasury&gt;&quot;</S><P>,</P>{"\n"}
                            {"    "}<K>&quot;asset&quot;</K><P>:</P> <S>&quot;EPjFWdd5…&quot;</S> <P>// USDC mint</P>{"\n"}
                            {"  "}<P>{"}]"}</P>{"\n"}
                            <P>{"}"}</P>
                        </CodeCard>
                        <p>
                            Retry the same request with an <Mono>X-PAYMENT</Mono> header carrying
                            the signed payment (any x402 client library builds it from the
                            challenge). On success the response includes an{" "}
                            <Mono>X-PAYMENT-RESPONSE</Mono> header with the settlement receipt.
                            <Mono>maxAmountRequired</Mono> is in USDC base units — 1000 = $0.001.
                        </p>
                    </Section>

                    <Section id="errors" title="Errors">
                        <p>Every gate rejection is a <Mono>402</Mono> with the challenge body above and one of these messages:</p>
                        <ul className="list-disc space-y-2 pl-5">
                            <li><Mono>Invalid API key</Mono> — the key is malformed or doesn&apos;t verify. Check for truncation.</li>
                            <li><Mono>API key revoked</Mono> — the key was revoked in the console. Create a new one.</li>
                            <li><Mono>Insufficient credits</Mono> — the balance can&apos;t cover this request. Fund the key.</li>
                            <li><Mono>Payment verification failed</Mono> — the <Mono>X-PAYMENT</Mono> header didn&apos;t verify or settle. Rebuild it from a fresh challenge.</li>
                        </ul>
                        <p>
                            Past the gate, endpoints answer their normal statuses — a billed
                            request can still 404 or 400 on its own terms, exactly as it would
                            for the app.
                        </p>
                    </Section>
                </div>
            </div>
        </div>
    );
}
