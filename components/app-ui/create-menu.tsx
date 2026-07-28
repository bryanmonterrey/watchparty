"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Coins01Icon,
    Megaphone01Icon,
    Note01Icon,
    ChartUpIcon,
    UserGroupIcon,
    VideoReplayIcon,
    LiveStreaming01Icon,
} from "@hugeicons/core-free-icons";
import { CreateIcon } from "@/components/icons";
import { GooDropdown, gooMenuItem } from "@/components/ui/goo-dropdown";
import { CreateDialog } from "./create-dialog";
import { WithAuth } from "@/components/auth/with-auth";

// The header's + button: pick what you're making, then get the right surface.
//
// It used to open CreateDialog straight onto its video tab, so every other kind
// of thing you can make here was one tab-click deeper and invisible until you
// were already in the dialog.
//
// The four dialog tabs open the dialog ON that tab (CreateDialog takes
// initialTab + controlled open for exactly this). Space, Callout and Prediction
// are NAVIGATIONS, not dialogs — each is made against something specific (a
// community, a coin, a market), so there's nothing to fill in from the header;
// the menu takes you where the thing gets made.
//
// Deliberately NOT here: Story and Shorts (author's call), Community and
// Playlist (same). Space is in, but its create workflow doesn't exist yet —
// spaces-view has no create form, so the item lands on the page.

type DialogTab = "video" | "post" | "coin" | "stream";

export function CreateMenu({ triggerClassName }: { triggerClassName?: string }) {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [tab, setTab] = React.useState<DialogTab>("video");

    const openDialog = (t: DialogTab) => {
        setTab(t);
        setDialogOpen(true);
        setMenuOpen(false);
    };

    const go = (href: string) => {
        router.push(href);
        setMenuOpen(false);
    };

    return (
        <>
            <GooDropdown
                open={menuOpen}
                onOpenChange={setMenuOpen}
                align="end"
                width={228}
                gap={8}
                triggerAriaLabel="Create"
                // GooDropdown renders its OWN <button> and treats `trigger` as
                // that button's content — so the previous Squircle+Button here
                // was a button nested inside a button, which is why no dropdown
                // appeared. Icon only, and the header's skin moves to
                // triggerClassName.
                //
                // Nothing is lost by that: the button is a circle (Create is a
                // pill by the repo rule), so there's no squircle to hand off —
                // and a circle is what GooDropdown's goo already morphs from,
                // since no buttonRadius is passed and the blob falls back to
                // btn.h / 2.
                //
                // The skin comes from the header, not from here — the live header
                // (app-header2) and the frozen one style this button differently.
                triggerClassName={triggerClassName}
                trigger={<CreateIcon className="size-6" strokeWidth={2} />}
                items={[
                    gooMenuItem({
                        key: "stream",
                        onClick: () => openDialog("stream"),
                        
                        label: "Go live",
                    }),
                    gooMenuItem({
                        key: "video",
                        onClick: () => openDialog("video"),
                        
                        label: "Video",
                    }),
                    gooMenuItem({
                        key: "post",
                        onClick: () => openDialog("post"),
                        
                        label: "Post",
                    }),
                    gooMenuItem({
                        key: "coin",
                        onClick: () => openDialog("coin"),
                        
                        label: "Coin",
                    }),
                    { key: "sep", type: "separator" },
                    gooMenuItem({
                        key: "space",
                        onClick: () => go("/communities/spaces"),
                        
                        label: "Space",
                    }),
                    gooMenuItem({
                        key: "callout",
                        onClick: () => go("/trade/callouts"),
                        
                        label: "Callout",
                    }),
                    // predictions.createMarket is a real protected procedure, so
                    // this one has a flow behind it — the page is where markets
                    // get made.
                    gooMenuItem({
                        key: "prediction",
                        onClick: () => go("/trade/predictions"),
                    
                        label: "Prediction",
                    }),
                ]}
            />

            {/* Controlled, and with no trigger of its own — the menu is the
                trigger now. WithAuth still gates it, so a signed-out click lands
                on login rather than an empty dialog. */}
            <CreateDialog open={dialogOpen} onOpenChange={setDialogOpen} initialTab={tab}>
                <WithAuth>
                    <span className="hidden" aria-hidden />
                </WithAuth>
            </CreateDialog>

        </>
    );
}
