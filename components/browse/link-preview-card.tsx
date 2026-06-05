"use client";

import { ExternalLink } from "lucide-react";

interface LinkPreview {
    url: string;
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
}

export function LinkPreviewCard({ preview }: { preview: LinkPreview }) {
    const domain = (() => {
        try { return new URL(preview.url).hostname.replace("www.", ""); }
        catch { return preview.url; }
    })();

    return (
        <a
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="block rounded-2xl border border-white/10 overflow-hidden bg-zinc-900/50 hover:bg-zinc-900/80 transition-colors group"
        >
            {preview.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={preview.imageUrl}
                    alt={preview.title ?? ""}
                    className="w-full h-36 object-cover"
                />
            )}
            <div className="px-3 py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-xs text-zinc-500 mb-0.5">{preview.siteName || domain}</p>
                    {preview.title && (
                        <p className="text-sm font-semibold text-zinc-100 leading-tight line-clamp-1 group-hover:underline">
                            {preview.title}
                        </p>
                    )}
                    {preview.description && (
                        <p className="text-xs text-zinc-400 line-clamp-2 mt-0.5">{preview.description}</p>
                    )}
                </div>
                <ExternalLink className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
            </div>
        </a>
    );
}
