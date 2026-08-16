"use client";

// The "Space" tab of the create dialog.
//
// Spaces could already be started from the community page (components/community/
// spaces-view), but that surface is a title-only inline form reachable only from
// inside a community — so the header's + menu, which lists Space alongside
// Video/Post/Coin/Stream, had to NAVIGATE there instead of making one. This is
// the missing step, built from that form's shape.
//
// Two things it adds over the inline version, both because a space now creates
// a POST (server/routers/spaces.ts):
//
//   - the `$` ticker picker on the title, so a space tags coins the way every
//     other composer does;
//   - the visible/hidden choice, which is the post's own `visibility` column
//     and deliberately not a new concept.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCashtagField } from "@/components/browse/use-cashtag-field";
import { CashtagAutocomplete } from "@/components/browse/cashtag-autocomplete";
import { HugeiconsIcon } from "@hugeicons/react";
import { Mic01Icon, EarthIcon, LockIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { appToast } from "@/components/app-ui/app-toast";

type Visibility = "public" | "unlisted";

// "Hidden" means UNLISTED, and the hint says so rather than implying privacy.
// There is no invite-only option because there is no invite-only enforcement:
// `spaces.join` gates on the room being LIVE and nothing else, so anyone
// holding the link can walk in. Offering "Private" here would be a label the
// server does not keep — which is exactly what this option used to be, when it
// wrote only the POST's visibility and left the room itself listed to everyone.
const VISIBILITY: { key: Visibility; label: string; hint: string; icon: typeof EarthIcon }[] = [
    { key: "public", label: "Visible", hint: "In the feed and Spaces list", icon: EarthIcon },
    { key: "unlisted", label: "Hidden", hint: "Unlisted — anyone with the link can join", icon: LockIcon },
];

export function SpaceSetup({ onDone }: { onDone?: () => void }) {
    const router = useRouter();
    const utils = trpc.useUtils();
    const [title, setTitle] = useState("");
    const [visibility, setVisibility] = useState<Visibility>("public");

    // Three lines, as designed — the hook owns the caret tracking, key routing
    // and caret restoration that the post composer does by hand.
    const titleTags = useCashtagField(title, setTitle);

    const create = trpc.spaces.create.useMutation({
        onSuccess: () => {
            utils.spaces.listLive.invalidate();
            appToast.success("Space is live");
            onDone?.();
            // The room lives on the community page; the dialog's job ends at
            // creating it.
            router.push("/communities/spaces");
        },
        onError: (e) => appToast.error(e.message),
    });

    const ready = title.trim().length > 0;

    const submit = () => {
        if (!ready || create.isPending) return;
        create.mutate({
            title: title.trim(),
            // `tagsIn`, not `picked`: a coin chosen and then deleted from the
            // title must not tag the post.
            tags: titleTags.tagsIn(title),
            visibility,
        });
    };

    return (
        <div className="px-1 py-2">
            <div className="flex items-center gap-3">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-pastelred/10">
                    <HugeiconsIcon icon={Mic01Icon} className="size-5 text-pastelred" strokeWidth={1.8} />
                </div>
                <div>
                    <p className="text-base font-bold text-white">Start a Space</p>
                    <p className="text-sm font-medium text-zinc-500">Drop in. Talk live.</p>
                </div>
            </div>

            {/* `relative` is the menu's positioning context — without it the
                panel anchors to whatever ancestor happens to be positioned. */}
            <div className="relative mt-5">
                <Input
                    {...titleTags.inputProps}
                    ref={titleTags.ref as React.RefObject<HTMLInputElement>}
                    radius={16}
                    autoFocus
                    value={title}
                    // Enter belongs to the MENU while it is open. Submitting
                    // under it would both lose the pick and start a space named
                    // after a half-typed ticker.
                    onKeyDown={(e) => {
                        if (titleTags.open && titleTags.keyHandler.current?.(e)) {
                            e.preventDefault();
                            return;
                        }
                        if (e.key === "Enter") {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    placeholder="What do you want to talk about?"
                    maxLength={120}
                    className="h-12 bg-white/[0.04] text-sm font-medium"
                />
                {titleTags.open && (
                    <CashtagAutocomplete
                        top={56}
                        query={titleTags.query}
                        onSelect={titleTags.select}
                        onClose={titleTags.close}
                        registerKeyHandler={(h) => { titleTags.keyHandler.current = h; }}
                    />
                )}
            </div>

            <div className="mt-5">
                <p className="px-1 text-sm font-bold text-zinc-400">Who can see it</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                    {VISIBILITY.map((v) => {
                        const active = visibility === v.key;
                        return (
                            <button
                                key={v.key}
                                type="button"
                                onClick={() => setVisibility(v.key)}
                                className={cn(
                                    "flex cursor-pointer items-center gap-2.5 rounded-[16px] px-3.5 py-3 text-left transition-colors",
                                    active
                                        ? "bg-white/[0.09] inset-hairline"
                                        : "bg-white/[0.04] hover:bg-white/[0.06]",
                                )}
                            >
                                <HugeiconsIcon
                                    icon={v.icon}
                                    className={cn("size-4 shrink-0", active ? "text-white" : "text-zinc-500")}
                                    strokeWidth={1.8}
                                />
                                <span className="min-w-0">
                                    <span className={cn("block text-sm font-bold", active ? "text-white" : "text-zinc-400")}>
                                        {v.label}
                                    </span>
                                    <span className="block truncate text-xs font-medium text-zinc-500">{v.hint}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <button
                onClick={submit}
                disabled={!ready || create.isPending}
                className={cn(
                    "mt-6 h-12 w-full cursor-pointer rounded-full text-base font-bold transition-colors",
                    "bg-pastelred text-black hover:bg-pastelred/90",
                    "disabled:cursor-not-allowed disabled:opacity-40",
                )}
            >
                {create.isPending ? "Starting…" : "Go live"}
            </button>
            <p className="mt-2 text-center text-xs font-medium text-zinc-500">
                {ready ? "Creates a post so people can find it" : "Give your Space a name first"}
            </p>
        </div>
    );
}
