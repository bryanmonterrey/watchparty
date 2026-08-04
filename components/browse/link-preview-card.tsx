"use client";

import { ExternalLink, X } from "lucide-react";

interface LinkPreview {
    url: string;
    title: string | null;
    description: string | null;
    imageUrl: string | null;
    siteName: string | null;
}

// `onRemove` is what makes this usable INSIDE a composer rather than only in a
// rendered post: a preview you can't dismiss forces you to delete the URL to get
// rid of the card. Omit it and the card is exactly what it was.
export function LinkPreviewCard({ preview, onRemove }: { preview: LinkPreview; onRemove?: () => void }) {
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
            className="relative block rounded-2xl border border-white/10 overflow-hidden bg-zinc-900/50 hover:bg-zinc-900/80 transition-colors group"
        >
            {onRemove && (
                <button
                    type="button"
                    aria-label="remove link preview"
                    // The card is an <a>; without preventDefault the click would
                    // also open the link it's removing.
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
                    className="absolute right-2 top-2 z-10 grid size-7 cursor-pointer place-items-center rounded-full bg-black/70 text-white transition-colors hover:bg-black/90"
                >
                    <X className="size-4" />
                </button>
            )}
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
