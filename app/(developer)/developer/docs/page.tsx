import { Metadata } from "next";
import Link from "next/link";
import { CodeCard, K, S, P } from "@/components/developer/dev-mocks";
import { PRICE_SHEET } from "@/lib/api-pricing";
import { WEBHOOK_EVENTS } from "@/lib/developer/webhook-events";

export const metadata: Metadata = {
    title: "API docs",
    description:
        "watchparty API documentation — x-api-key auth, per-surface USDC pricing, and the x402 pay-per-request flow.",
};

// Public API documentation for the 402 gate. Static on purpose — this page is
// the contract, and a contract shouldn't need a client bundle. Content mirrors
// docs/api-monetization.md minus the ops half (secrets, rollout, exemptions).
// Dark like the rest of the portal shell; every colour fixed, lantern accent.

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
    return (
        <section id={id} className="scroll-mt-28 border-t border-white/[0.08] py-12 first:border-t-0 first:pt-0">
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{title}</h2>
            <div className="mt-4 flex flex-col gap-4 text-[15px] font-semibold leading-relaxed text-white/60">
                {children}
            </div>
        </section>
    );
}

function Mono({ children }: { children: React.ReactNode }) {
    return <code className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[13px] font-semibold text-white">{children}</code>;
}

const TOC = [
    ["overview", "Overview"],
    ["auth", "Authentication"],
    ["pricing", "Pricing"],
    ["x402", "Paying per request (x402)"],
    ["webhooks", "Webhooks"],
    ["stream", "Event stream"],
    ["oauth", "Sign in with watchparty"],
    ["bots", "Bots"],
    ["errors", "Errors"],
] as const;

export default function DocsPage() {
    return (
        <div className="pb-24 pt-28 sm:pt-32">
            <div className="mx-auto w-full max-w-3xl px-6">
                <p className="text-sm font-bold text-white/40">
                    <Link href="/developer" className="transition-colors hover:text-white">Developers</Link>
                    <span className="mx-2">/</span>Docs
                </p>
                <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">API documentation</h1>
                <p className="mt-4 max-w-xl text-lg font-semibold leading-snug text-white/55">
                    Everything billed, priced, and authenticated in one page. If something here surprises you, the page is wrong — tell us.
                </p>

                <nav className="mt-8 flex flex-wrap gap-2">
                    {TOC.map(([id, label]) => (
                        <a key={id} href={`#${id}`} className="rounded-full bg-white/[0.06] px-4 py-2 text-[13px] font-bold text-white/65 transition-colors hover:bg-white/[0.12] hover:text-white">
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
                            per request, and there are two ways to pay: a funded <strong className="text-white">API key</strong>,
                            or <strong className="text-white">x402</strong> — a per-request USDC payment with no account at all.
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
                            <strong className="text-white">once</strong>, at creation, in the{" "}
                            <Link href="/developer/console" className="font-bold text-white underline underline-offset-4">console</Link>.
                            We store a hash, never the key. Revoking a key stops it within seconds;
                            treat a leaked key like leaked money, because it is.
                        </p>
                        <p>
                            CORS is open for paying callers — keyed and x402 requests work from
                            browser apps, not just servers, and the <Mono>402</Mono> challenge is
                            readable cross-origin so the payment flow can start anywhere.
                        </p>
                    </Section>

                    <Section id="pricing" title="Pricing">
                        <p>
                            Priced per surface, deducted from your key&apos;s credit balance.
                            1 credit = $1 = 1 USDC. No monthly fee, no minimum, no rate-limit
                            tiers to buy. Balances and lifetime spend are always visible in the
                            console.
                        </p>
                        <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
                            {PRICE_SHEET.map((row, i) => (
                                <div
                                    key={row.key}
                                    className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4 ${i > 0 ? "border-t border-white/[0.06]" : ""}`}
                                >
                                    <div className="min-w-0">
                                        <p className="font-bold text-white">{row.name}</p>
                                        <p className="mt-0.5 text-[13px] font-semibold text-white/45">{row.desc}</p>
                                    </div>
                                    <p className="shrink-0 font-mono text-[14px] font-bold text-lantern">${row.usd.toFixed(3)}</p>
                                </div>
                            ))}
                        </div>
                        <p>
                            The unit is a <strong className="text-white">procedure, not an HTTP request</strong>: a tRPC
                            batch URL (<Mono>/api/trpc/a,b,c</Mono>) is priced as the sum of its
                            procedures — batching saves connections, not money. Responses to a
                            request you didn&apos;t pay for (bad key, empty balance) are free and
                            answer <Mono>402</Mono> — you are never charged for a rejection.
                        </p>
                    </Section>

                    <Section id="x402" title="Paying per request (x402)">
                        <p>
                            No key? Call anyway. The response is <Mono>402 Payment Required</Mono>{" "}
                            with an{" "}
                            <a href="https://www.x402.org" className="font-bold text-white underline underline-offset-4" rel="noreferrer" target="_blank">x402</a>{" "}
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
                            <Mono>maxAmountRequired</Mono> is in USDC base units and reflects the
                            price of the resource you called — 1000 = $0.001.
                        </p>
                    </Section>

                    <Section id="webhooks" title="Webhooks">
                        <p>
                            One outbound endpoint per account, configured in the{" "}
                            <a href="https://console.watchparty.xyz/webhooks" className="font-bold text-white underline underline-offset-4">console</a>.
                            We POST JSON to it the moment an event happens. Every event is about{" "}
                            <strong className="text-white">your own account</strong> — your streams, your
                            followers, your coins, your markets.
                        </p>
                        <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
                            {WEBHOOK_EVENTS.map((row, i) => (
                                <div
                                    key={row.type}
                                    className={`flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-4 ${i > 0 ? "border-t border-white/[0.06]" : ""}`}
                                >
                                    <p className="font-mono text-[14px] font-bold text-white">{row.type}</p>
                                    <p className="min-w-0 text-[13px] font-semibold text-white/45">{row.desc}</p>
                                </div>
                            ))}
                        </div>
                        <p>
                            Deliveries are signed. The{" "}
                            <Mono>x-watchparty-signature</Mono> header is{" "}
                            <Mono>t=&lt;unix seconds&gt;,v1=&lt;hex&gt;</Mono> where{" "}
                            <Mono>v1</Mono> is HMAC-SHA256 of{" "}
                            <Mono>{"`${t}.${rawBody}`"}</Mono> under your signing secret
                            (shown once at creation). Verify before trusting anything:
                        </p>
                        <CodeCard label="node · verify">
                            <K>import</K> {"{ createHmac, timingSafeEqual }"} <K>from</K> <S>&quot;node:crypto&quot;</S><P>;</P>{"\n\n"}
                            <K>const</K> [t, v1] = sig.<P>split</P>(<S>&quot;,&quot;</S>).<P>map</P>((p) {"=>"} p.<P>slice</P>(p.<P>indexOf</P>(<S>&quot;=&quot;</S>) + 1))<P>;</P>{"\n"}
                            <K>const</K> expected = <P>createHmac</P>(<S>&quot;sha256&quot;</S>, secret).<P>update</P>(<S>{"`${t}.${rawBody}`"}</S>).<P>digest</P>(<S>&quot;hex&quot;</S>)<P>;</P>{"\n"}
                            <K>const</K> ok = <P>timingSafeEqual</P>(Buffer.<P>from</P>(expected), Buffer.<P>from</P>(v1))<P>;</P>
                        </CodeCard>
                        <p>
                            Semantics: delivery is <strong className="text-white">at-least-once</strong> with a
                            5-second timeout and no retries — answer fast with a <Mono>2xx</Mono>{" "}
                            and do your work async. Payloads carry a unique <Mono>id</Mono>{" "}
                            (and stream events a <Mono>sessionId</Mono>) to dedupe on. Reject
                            anything older than a few minutes of clock skew via <Mono>t</Mono>.
                            The console&apos;s webhooks page previews every payload shape and
                            sends signed <Mono>webhook.test</Mono> deliveries on demand.
                        </p>
                    </Section>

                    <Section id="stream" title="Event stream">
                        <p>
                            Events matching your{" "}
                            <a href="https://console.watchparty.xyz/streaming-rules" className="font-bold text-white underline underline-offset-4">streaming rules</a>{" "}
                            queue durably and are consumed by <Mono>cursor pull</Mono> — at-least-once,
                            replayable for 3 days, dedupe on <Mono>seq</Mono>. An app-scoped key streams
                            that app; an account key streams all your apps.
                        </p>
                        <CodeCard label="curl · pull">
                            <P># resume from your last cursor; the response returns the next one</P>{"\n"}
                            curl -s <S>&quot;https://watchparty.xyz/api/stream/events?since=0&quot;</S> \{"\n"}
                            {"  "}-H <S>&quot;x-api-key: wp_live_…&quot;</S>
                        </CodeCard>
                        <p>
                            For instant delivery, add the <Mono>push socket</Mono>: mint a 120-second
                            token with your API key, connect, and treat each{" "}
                            <Mono>deliveries</Mono> event as &quot;new rows past your cursor exist — pull
                            now.&quot; The socket only ever nudges; data, ordering and replay stay on
                            the pull endpoint, so a dropped socket never loses an event.
                        </p>
                        <CodeCard label="node · push socket">
                            <K>const</K> {"{ token, room, host }"} = <K>await</K> (<K>await</K> <P>fetch</P>(<S>&quot;https://watchparty.xyz/api/stream/token&quot;</S>,{"\n"}
                            {"  "}{"{ headers: { "}<S>&quot;x-api-key&quot;</S>: key{" } }"})).<P>json</P>()<P>;</P>{"\n"}
                            <K>const</K> ws = <K>new</K> <P>WebSocket</P>(<S>{"`wss://${host}/parties/chat/${room}?token=${token}`"}</S>)<P>;</P>{"\n"}
                            ws.<P>onmessage</P> = () <P>=&gt;</P> <P>pullEvents</P>()<P>;</P> <P>// re-mint on every reconnect</P>
                        </CodeCard>
                    </Section>

                    <Section id="oauth" title="Sign in with watchparty">
                        <p>
                            Let people sign in to your app with their watchparty account —
                            standard OAuth2 + OIDC with <Mono>PKCE required (S256 only)</Mono>.
                            Create a client on your app&apos;s page in the{" "}
                            <a href="https://console.watchparty.xyz/apps" className="font-bold text-white underline underline-offset-4">console</a>:
                            web clients hold a secret server-side; public (native) clients are
                            PKCE-only with custom-scheme redirects. Redirect URIs are exact-match.
                        </p>
                        <CodeCard label="flow">
                            <P># 1. send the user to</P>{"\n"}
                            GET https://watchparty.xyz/api/auth/oauth2/authorize{"\n"}
                            {"  "}?response_type=code&amp;client_id=wpcl_…&amp;redirect_uri=…{"\n"}
                            {"  "}&amp;scope=openid+profile+email&amp;state=…&amp;code_challenge=…&amp;code_challenge_method=S256{"\n\n"}
                            <P># 2. they approve on the consent screen; you get ?code= back</P>{"\n"}
                            POST https://watchparty.xyz/api/auth/oauth2/token{"\n"}
                            {"  "}grant_type=authorization_code&amp;code=…&amp;code_verifier=…&amp;client_id=…&amp;client_secret=…{"\n\n"}
                            <P># 3. read the profile (claims follow the granted scopes)</P>{"\n"}
                            GET https://watchparty.xyz/api/auth/oauth2/userinfo{"\n"}
                            {"  "}Authorization: Bearer &lt;access_token&gt;
                        </CodeCard>
                        <p>
                            Scopes: <Mono>openid</Mono>, <Mono>profile</Mono>, <Mono>email</Mono>,{" "}
                            <Mono>offline_access</Mono> (refresh tokens rotate — the old one dies on
                            each refresh). Discovery lives at{" "}
                            <Mono>/api/auth/.well-known/openid-configuration</Mono>; id_tokens are
                            EdDSA-signed against <Mono>/api/auth/jwks</Mono>. Always send{" "}
                            <Mono>state</Mono>. Users can revoke your app any time from their
                            settings; revocation kills issued tokens immediately.
                        </p>
                    </Section>

                    <Section id="bots" title="Bots">
                        <p>
                            A bot is a real account your app drives with a token — created on your
                            app&apos;s page in the console, installed per community by its admins, and
                            allowed to do exactly what the install&apos;s permission bits grant:
                            read members, send messages, moderate, manage coin alerts.
                        </p>
                        <CodeCard label="curl · act as the bot">
                            <P># identity</P>{"\n"}
                            curl -s <S>&quot;https://watchparty.xyz/api/trpc/bot.whoami&quot;</S> \{"\n"}
                            {"  "}-H <S>&quot;Authorization: Bot wpb_…&quot;</S>{"\n\n"}
                            <P># post into an installed community&apos;s channel (SEND_MESSAGES)</P>{"\n"}
                            curl -s -X POST <S>&quot;https://watchparty.xyz/api/trpc/bot.sendMessage&quot;</S> \{"\n"}
                            {"  "}-H <S>&quot;Authorization: Bot wpb_…&quot;</S> -H <S>&quot;content-type: application/json&quot;</S> \{"\n"}
                            {"  "}-d <S>{"'{\"json\":{\"channelId\":\"…\",\"content\":\"gm\"}}'"}</S>
                        </CodeCard>
                        <p>
                            Also available: <Mono>bot.installs</Mono>, <Mono>bot.listMembers</Mono>,{" "}
                            <Mono>bot.deleteMessage</Mono>, <Mono>bot.timeoutMember</Mono>, and coin-alert
                            CRUD (<Mono>bot.createCoinAlert</Mono> — posts into a channel when a tracked
                            token moves). Sends are limited to 10 per 10s per channel under a
                            100/min ceiling; admins can retune or evict your bot at any time, and
                            its access dies with the install.
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
