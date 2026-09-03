import Link from "next/link";
import { CRAWLER_UA, missingShareTags, parseShareTags, type ShareTags } from "@/lib/share/parse-meta";
import { SITE_URL } from "@/lib/share/metadata";
import { CARD_FIXTURES } from "@/lib/share/og-fixtures";
import { CardGallery } from "./card-gallery";

// Share-card preview. Fetches each URL the way a link crawler does (same
// parser as scripts/dev/check-share-meta.mjs), then draws what X and Discord
// will draw from those tags. Open any card full-size from its link.
//
//   /dev/share-cards                       the default sample set
//   /dev/share-cards?u=/status/abc,/pump   your own paths, comma-separated
//
// Fixed-dark surface: the mocks copy the platforms' chrome, so no theme tokens
// (memory fixed-dark-vs-themed-surfaces).

export const dynamic = "force-dynamic";

const DEFAULT_PATHS = ["/", "/home", "/pump", "/category/just-chatting"];

interface Preview {
    path: string;
    status: number;
    finalUrl: string;
    tags: ShareTags | null;
    missing: string[];
    error?: string;
}

// Under `next dev` the crawl targets PROD by default: fetching this same dev
// server from inside a render compiles every page cold and blows the deadline,
// and prod is where the tags a crawler sees actually live. `?base=` overrides.
const DEFAULT_BASE = process.env.NODE_ENV === "development" ? "https://watchparty.xyz" : SITE_URL;

async function crawl(base: string, path: string): Promise<Preview> {
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    try {
        const res = await fetch(url, {
            headers: { "user-agent": CRAWLER_UA, accept: "text/html" },
            redirect: "follow",
            cache: "no-store",
            // No default fetch deadline on workerd — a hung page would hang
            // this whole preview (memory upstream-fetch-needs-deadline).
            signal: AbortSignal.timeout(12000),
        });
        const tags = parseShareTags(await res.text());
        return { path, status: res.status, finalUrl: res.url, tags, missing: missingShareTags(tags) };
    } catch (err) {
        return {
            path,
            status: 0,
            finalUrl: url,
            tags: null,
            missing: [],
            error: err instanceof Error ? err.message : String(err),
        };
    }
}

export default async function ShareCardsPreview({
    searchParams,
}: {
    searchParams: Promise<{ u?: string; base?: string }>;
}) {
    const { u, base: baseParam } = await searchParams;
    const base = safeBase(baseParam) ?? DEFAULT_BASE;
    const paths = (u ? u.split(",") : DEFAULT_PATHS).map((p) => p.trim()).filter(Boolean);
    const previews = await Promise.all(paths.map((p) => crawl(base, p)));
    const host = new URL(base).host;

    return (
        <div className="mx-auto w-full max-w-[1100px] px-4 py-8 text-white sm:px-6">
            <h1 className="font-pixel text-3xl">Share cards</h1>
            <p className="mt-1 text-sm text-postgray">
                Each row is a URL fetched as <span className="font-mono">{CRAWLER_UA}</span> from{" "}
                <span className="font-mono">{host}</span>, drawn the way X and Discord draw it.
            </p>

            <form method="get" className="mt-5 flex flex-wrap gap-2">
                <input
                    name="base"
                    defaultValue={base}
                    className="h-11 w-full rounded-full border border-border bg-white/[0.03] px-4 font-mono text-sm outline-none focus:border-twitter2 sm:w-[260px]"
                />
                <input
                    name="u"
                    defaultValue={paths.join(",")}
                    placeholder="/status/abc,/pump,/coin/…"
                    className="h-11 min-w-0 flex-1 rounded-full border border-border bg-white/[0.03] px-4 font-mono text-sm outline-none focus:border-twitter2"
                />
                <button type="submit" className="h-11 rounded-full bg-twitter2 px-5 text-sm font-semibold text-white">
                    Preview
                </button>
            </form>

            <div className="mt-8 space-y-8">
                {previews.map((p) => (
                    <Row key={p.path} preview={p} host={host} />
                ))}
            </div>

            <section className="mt-14">
                <h2 className="font-pixel text-2xl">Every card, sample data</h2>
                <p className="mt-1 text-sm text-postgray">
                    Rendered live by the og-worker from fixtures (lib/share/og-fixtures.ts). Click any card to
                    open the PNG. The brand default is the static file every page falls back to.
                </p>
                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                    <figure>
                        <figcaption className="mb-2 text-sm font-semibold">Default · brand</figcaption>
                        <a href="/og-default.png" target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-border">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/og-default.png" alt="" className="block w-full" />
                        </a>
                    </figure>
                    <CardGallery fixtures={CARD_FIXTURES} />
                </div>
            </section>
        </div>
    );
}

function safeBase(v: string | undefined): string | null {
    if (!v) return null;
    try {
        const u = new URL(v);
        return u.protocol === "https:" || u.protocol === "http:" ? u.origin : null;
    } catch {
        return null;
    }
}

function Row({ preview, host }: { preview: Preview; host: string }) {
    const { tags } = preview;
    const ok = preview.status === 200 && preview.missing.length === 0 && !preview.error;
    return (
        <div className="rounded-3xl border border-border bg-white/[0.02] p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className={`size-2 rounded-full ${ok ? "bg-lantern" : "bg-pastelred"}`} />
                <Link href={preview.path} className="font-mono text-white hover:underline">
                    {preview.path}
                </Link>
                <span className="text-postgray">HTTP {preview.status || "—"}</span>
                {tags?.card && <span className="text-postgray">card={tags.card}</span>}
                {tags?.type && <span className="text-postgray">type={tags.type}</span>}
                {preview.missing.length > 0 && (
                    <span className="text-pastelred">missing: {preview.missing.join(", ")}</span>
                )}
                {preview.error && <span className="text-pastelred">{preview.error}</span>}
                {tags?.image && (
                    <a href={tags.image} target="_blank" rel="noreferrer" className="ml-auto text-twitter2 hover:underline">
                        open image
                    </a>
                )}
            </div>

            {tags && (
                <div className="mt-4 grid gap-5 lg:grid-cols-2">
                    <XCard tags={tags} host={host} />
                    <DiscordCard tags={tags} />
                </div>
            )}
        </div>
    );
}

// X's link card. `summary` is thumbnail-left; everything else is the big image.
function XCard({ tags, host }: { tags: ShareTags; host: string }) {
    const compact = tags.card === "summary";
    return (
        <figure>
            <figcaption className="mb-2 text-xs font-semibold text-postgray">X</figcaption>
            <div className="max-w-[520px] rounded-2xl bg-black p-3 text-15 text-[#e7e9ea]">
                {compact ? (
                    <div className="flex overflow-hidden rounded-2xl border border-[#2f3336]">
                        <div className="relative size-[130px] shrink-0 border-r border-[#2f3336] bg-[#16181c]">
                            {tags.image && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={tags.image} alt="" className="size-full object-cover" />
                            )}
                        </div>
                        <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3">
                            <span className="truncate text-[#71767b]">{host}</span>
                            <span className="truncate font-medium">{tags.title}</span>
                            <span className="line-clamp-2 text-[#71767b]">{tags.description}</span>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="relative aspect-[1.91/1] overflow-hidden rounded-2xl border border-[#2f3336] bg-[#16181c]">
                            {tags.image && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={tags.image} alt="" className="size-full object-cover" />
                            )}
                            <span className="absolute bottom-3 left-3 max-w-[90%] truncate rounded-md bg-black/70 px-1.5 py-0.5 text-13 text-white">
                                {tags.title}
                            </span>
                        </div>
                        <p className="mt-1.5 px-1 text-13 text-[#71767b]">From {host}</p>
                    </div>
                )}
            </div>
        </figure>
    );
}

// Discord's embed: left accent, site name, blue title, description, image.
function DiscordCard({ tags }: { tags: ShareTags }) {
    return (
        <figure>
            <figcaption className="mb-2 text-xs font-semibold text-postgray">Discord</figcaption>
            <div className="max-w-[520px] rounded-2xl bg-[#313338] p-3">
                <div className="max-w-[432px] rounded-[4px] border-l-4 border-twitter2 bg-[#2b2d31] p-3 pr-4 text-14 text-[#dbdee1]">
                    {tags.siteName && <p className="text-12 text-[#b5bac1]">{tags.siteName}</p>}
                    <p className="mt-1 font-semibold text-[#00a8fc]">{tags.title}</p>
                    {tags.description && <p className="mt-1 line-clamp-3 text-[#dbdee1]">{tags.description}</p>}
                    {tags.image && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={tags.image} alt="" className="mt-3 max-h-[300px] w-full rounded-[4px] object-contain object-left" />
                    )}
                </div>
            </div>
        </figure>
    );
}
