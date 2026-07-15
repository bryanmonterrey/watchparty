"use client";

import { trpc } from "@/lib/trpc/client";

// Pull the first URL out of message content, trimming trailing punctuation
// that usually belongs to the sentence, not the link.
export function extractFirstUrl(content: string): string | null {
    const m = content.match(/https?:\/\/[^\s]+/);
    return m ? m[0].replace(/[),.;!?'"\]]+$/, "") : null;
}

export function isImageUrl(url: string): boolean {
    try {
        return /\.(png|jpe?g|gif|webp|avif)$/i.test(new URL(url).pathname);
    } catch {
        return false;
    }
}

// Direct image links render inline; everything else unfurls into a flat OG
// card. Renders nothing while loading or when the target has no usable
// preview, so plain links stay plain.
export function CommunityLinkEmbed({ url }: { url: string }) {
    if (isImageUrl(url)) {
        return (
            <a href={url} target="_blank" rel="noreferrer noopener" className="mt-2 block w-fit max-w-sm">
                <img src={url} alt="" className="max-h-72 rounded-2xl object-cover" loading="lazy" />
            </a>
        );
    }
    return <LinkCard url={url} />;
}

function LinkCard({ url }: { url: string }) {
    const { data } = trpc.community.linkPreview.useQuery(
        { url },
        { staleTime: Infinity, retry: false, refetchOnWindowFocus: false },
    );

    if (!data) return null;

    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 block w-fit max-w-sm rounded-2xl bg-white/[0.03] p-3.5 transition-colors hover:bg-white/[0.06]"
        >
            {data.siteName && (
                <p className="text-[11px] font-semibold text-zinc-500">{data.siteName}</p>
            )}
            {data.title && (
                <p className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-snug text-twitter2">{data.title}</p>
            )}
            {data.description && (
                <p className="mt-1 line-clamp-2 text-[12px] font-medium leading-relaxed text-zinc-400">{data.description}</p>
            )}
            {data.image && (
                <img src={data.image} alt="" className="mt-2.5 max-h-64 w-full rounded-xl object-cover" loading="lazy" />
            )}
        </a>
    );
}
