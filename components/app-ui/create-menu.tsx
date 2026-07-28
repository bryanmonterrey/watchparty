"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Coins01Icon,
    Megaphone01Icon,
    Note01Icon,
    Camera01Icon,
    UserGroupIcon,
    VideoReplayIcon,
    LiveStreaming01Icon,
} from "@hugeicons/core-free-icons";
import { CreateIcon } from "@/components/icons";
import { Squircle } from "@/components/ui/squircle";
import { Button } from "@/components/ui/button";
import { GooDropdown, gooMenuItem } from "@/components/ui/goo-dropdown";
import { CreateDialog } from "./create-dialog";
import { StoryCreator } from "@/components/browse/story-creator";
import { WithAuth } from "@/components/auth/with-auth";

// The header's + button: pick what you're making, then get the right surface.
//
// It used to open CreateDialog straight onto its video tab, so every other kind
// of thing you can make here was one tab-click deeper and invisible until you
// were already in the dialog.
//
// The four dialog tabs open the dialog ON that tab (CreateDialog takes
// initialTab + controlled open for exactly this). Story has its own composer.
// Space and Callout are NAVIGATIONS, not dialogs — a callout is made against a
// specific coin and a space against a community, so there's nothing to fill in
// from here; the menu takes you where the thing gets made.

type DialogTab = "video" | "post" | "coin" | "stream";

export function CreateMenu() {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [dialogOpen, setDialogOpen] = React.useState(false);
    const [tab, setTab] = React.useState<DialogTab>("video");
    const [storyOpen, setStoryOpen] = React.useState(false);

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
                trigger={
                    <Squircle asChild radius={16} autoEffects={false}>
                        <Button
                            variant="outline"
                            aria-label="Create"
                            className="rounded-none border-none flex size-11 p-0 text-flexwhite bg-[#6A6A6A]/35 hover:bg-[#6A6A6A]/50"
                        >
                            <CreateIcon className="size-6" strokeWidth={2} />
                        </Button>
                    </Squircle>
                }
                items={[
                    gooMenuItem({
                        key: "stream",
                        onClick: () => openDialog("stream"),
                        icon: <HugeiconsIcon icon={LiveStreaming01Icon} />,
                        label: "Go live",
                    }),
                    gooMenuItem({
                        key: "video",
                        onClick: () => openDialog("video"),
                        icon: <HugeiconsIcon icon={VideoReplayIcon} />,
                        label: "Video",
                    }),
                    gooMenuItem({
                        key: "post",
                        onClick: () => openDialog("post"),
                        icon: <HugeiconsIcon icon={Note01Icon} />,
                        label: "Post",
                    }),
                    gooMenuItem({
                        key: "story",
                        onClick: () => {
                            setStoryOpen(true);
                            setMenuOpen(false);
                        },
                        icon: <HugeiconsIcon icon={Camera01Icon} />,
                        label: "Story",
                    }),
                    gooMenuItem({
                        key: "coin",
                        onClick: () => openDialog("coin"),
                        icon: <HugeiconsIcon icon={Coins01Icon} />,
                        label: "Coin",
                    }),
                    { key: "sep", type: "separator" },
                    gooMenuItem({
                        key: "space",
                        onClick: () => go("/communities/spaces"),
                        icon: <HugeiconsIcon icon={UserGroupIcon} />,
                        label: "Space",
                    }),
                    gooMenuItem({
                        key: "callout",
                        onClick: () => go("/trade/callouts"),
                        icon: <HugeiconsIcon icon={Megaphone01Icon} />,
                        label: "Callout",
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

            <StoryCreator open={storyOpen} onClose={() => setStoryOpen(false)} />
        </>
    );
}
