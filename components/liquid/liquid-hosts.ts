/* The popover's engine hosts — how the liquid popover plugs its picture into
   the family's two shared engines (stretch.ts, seam.ts). Extracted from
   liquid-popover.tsx for the file-size guard, and improved in the move: the
   engines are created ONCE per instance, so everything they need arrives
   through a ctx REF the component reassigns every render — the newest
   callbacks always answer (the old inline hosts froze the first render's
   measure()). */

import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

import type { Geom } from "./liquid-geometry";
import { SEAM_LAYERS } from "./liquid-goo-canvas";
import type { LiquidRefs } from "./liquid-refs";
import { createLiquidSeam, type LiquidSeam, type SeamJoint } from "./seam";
import { gooSfx } from "./sfx";
import type { StretchHost } from "./stretch";

gsap.registerPlugin(CustomEase);

const OUT_STRONG = CustomEase.create("liquidHostOutStrong", "0.23,1,0.32,1");

/* The gesture's blur discipline — the same values liquid-popover runs its
   flights at (see goo.ts for the solved threshold pairs). */
const GOO_BLUR_GRAB = 5;
const GOO_BLUR_REST = 1;

/* Everything the hosts read at gesture time, reassigned by the component on
   every render. */
export interface PopoverHostCtx {
    refs: LiquidRefs;
    geomRef: { current: Geom | null };
    isOpenRef: { current: boolean };
    timelineRef: { current: gsap.core.Timeline | null };
    grabbedOwnerRef: { current: string };
    jointsFn: (joints: SeamJoint[]) => void;
    getTriggerBits(): (Element | null)[];
    getPanelTrio(): (Element | null)[];
    innerBits(): HTMLElement[];
    measure(): Geom | null;
    liquidOn(blur: number): void;
    applyGooBlur(blur: number, tl?: gsap.core.Timeline, at?: number): void;
    clearRowNeon(): void;
    fxScale(): number;
}

export function createPopoverStretchHost(ctx: { current: PopoverHostCtx }): StretchHost {
    return {
        buttonSize: 32,
        auxLean: 0.14,
        anchor: () => ctx.current.refs.root,
        triggerBits: () => ctx.current.getTriggerBits(),
        /* Only the goo blob wears the rotated directional stretch: the
           reference's trigger is a circle, where rotation is invisible. An
           app trigger is a pill or a kebab, and spinning it to the pull's
           angle would flip it upside down — so the crisp button only LEANS
           (it rides the icon channel below). */
        triggerStretchBits: () => [ctx.current.refs.blobTrigger],
        triggerIcon: () => ctx.current.refs.trigger,
        effectScale: () => ctx.current.fxScale(),
        chain: () => ctx.current.refs.chain,
        auxTrio: () => ctx.current.getPanelTrio(),
        liquidOn: (target) => {
            const c = ctx.current;
            c.grabbedOwnerRef.current = target === "trigger" ? "trigger" : "panel";
            c.measure();
            c.liquidOn(GOO_BLUR_GRAB);
            /* data-grab gates the seam: this light is a gesture's feedback,
               not a state the component wears at rest. */
            c.refs.root?.setAttribute("data-grab", "");
            gooSfx.play("grab", { frame: "dark" });

            /* A grab that lands MID-FLIGHT takes the picture over: kill the
               open/close run, then walk the panel to wherever it was heading,
               ON the component's own timeline — loose tweens would survive
               the next run's kill and keep writing toward the interrupted
               state. */
            if (c.timelineRef.current?.isActive()) {
                c.timelineRef.current.kill();
                const settled = c.isOpenRef.current;
                const settle = gsap.timeline();
                c.timelineRef.current = settle;
                settle.to(
                    c.getPanelTrio(),
                    {
                        scale: settled ? 1 : c.geomRef.current?.restScale ?? 0.08,
                        rotation: settled ? 0 : -3,
                        duration: 0.16,
                        ease: OUT_STRONG,
                        overwrite: "auto",
                    },
                    0,
                );
                settle.to(
                    [c.refs.panelBody, c.refs.panel],
                    { autoAlpha: settled ? 1 : 0, duration: 0.12, ease: OUT_STRONG, overwrite: "auto" },
                    0,
                );
                settle.to(
                    c.innerBits(),
                    { autoAlpha: settled ? 1 : 0, y: 0, duration: 0.12, ease: OUT_STRONG, overwrite: "auto" },
                    0,
                );
            }
            /* The shrunk panel parks INSIDE the trigger while the menu is
               closed — it must sit the grab out: it cannot ride the trigger's
               lean, so left in the goo it pokes out of the moving silhouette
               as a hump. openMenu/closeMenu re-arm it. */
            gsap.set(c.refs.blobPanel, {
                autoAlpha: target === "trigger" && !c.isOpenRef.current ? 0 : 1,
            });
        },
        handoff: (tl, at) => {
            const c = ctx.current;
            gooSfx.play("release", { frame: "dark" });
            /* The crisp bodies SNAP on underneath the goo and only the goo
               fades. Both faces are glass now, so the beat is a short settle
               (two 10% faces stacked, resolving to one with a real backdrop
               blur) rather than the identical-pixel handoff it once was. */
            tl.set(c.refs.bodies, { autoAlpha: 1 }, at);
            tl.to(c.refs.goo, { autoAlpha: 0, duration: 0.15, ease: "power1.out" }, at);
            c.applyGooBlur(GOO_BLUR_REST, tl, at + 0.16);
            tl.call(
                () => {
                    c.refs.root?.removeAttribute("data-liquid");
                    c.refs.root?.removeAttribute("data-grab");
                    c.clearRowNeon();
                },
                undefined,
                at + 0.15,
            );
        },
    };
}

export function createPopoverSeam(ctx: { current: PopoverHostCtx }): LiquidSeam {
    return createLiquidSeam({
        anchor: () => ctx.current.refs.root,
        parts: () => {
            const c = ctx.current;
            const geom = c.geomRef.current;
            return [
                {
                    blob: c.refs.blobTrigger,
                    owner: "trigger",
                    rect: geom
                        ? {
                              x: geom.trigger.x,
                              y: geom.trigger.y,
                              width: geom.trigger.w,
                              height: geom.trigger.h,
                              radius: geom.trigger.r,
                          }
                        : undefined,
                },
                {
                    blob: c.refs.blobPanel,
                    owner: "panel",
                    rect: geom
                        ? {
                              x: geom.panel.x,
                              y: geom.panel.y,
                              width: geom.panel.w,
                              height: geom.panel.h,
                              radius: geom.panel.r,
                          }
                        : undefined,
                },
                ...c.refs.chain.map((blob) => ({ blob, owner: c.grabbedOwnerRef.current })),
            ];
        },
        layers: () =>
            SEAM_LAYERS.map((_, index) => ({
                gradient: ctx.current.refs.seamGradients[index] ?? null,
                paint: ctx.current.refs.seamPaints[index] ?? null,
            })),
        /* One hue for every joint — the accent; the gradient stops are
           already painted with it, so there is nothing to repaint. */
        joints: (joints) => ctx.current.jointsFn(joints),
    });
}
