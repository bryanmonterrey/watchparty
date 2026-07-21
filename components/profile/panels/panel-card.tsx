"use client";

import { Squircle } from "@/components/ui/squircle";
import type { ProfilePanel } from "@/db/schema/content/profile-panel";

// One About-tab panel, Twitch/Kick shape: small uppercase title, the uploaded
// art (squircled, links out when linkUrl is set), optional body text below.
// Display only — owner controls live in PanelGrid.

export type PanelData = Pick<ProfilePanel, "id" | "title" | "imageUrl" | "linkUrl" | "body">;

export function PanelCard({ panel }: { panel: PanelData }) {
    const image = panel.imageUrl && (
        <Squircle asChild radius={16}>
            <img
                src={panel.imageUrl}
                alt={panel.title ?? "Panel"}
                className="w-full select-none object-cover"
                draggable={false}
            />
        </Squircle>
    );

    return (
        <div className="flex flex-col gap-2.5">
            {panel.title && (
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">{panel.title}</p>
            )}
            {panel.linkUrl ? (
                <a
                    href={panel.linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
                >
                    {image}
                </a>
            ) : (
                image
            )}
            {panel.body && (
                <p className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-400">{panel.body}</p>
            )}
        </div>
    );
}
