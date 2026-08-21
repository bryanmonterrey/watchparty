"use client";

/* THE LIQUID POPOVER — watchparty's dropdown engine, ported from liquid-taffy's
   anchored dropdown (arknow91/liquid-taffy, MIT) and generalized from its fixed
   4-row demo panel to GooDropdown's API: arbitrary trigger, side/align/gap,
   variable-height rows, headers, scrolling panels.

   The picture is the reference's, on watchparty's dark frame: at rest the panel
   is a crisp squircle with a real 1px border, standing off its trigger — no
   neck, no tether (the objection that retired the old fused-goo popover does
   not apply here). The moment anything moves, an SVG blur→threshold goo takes
   the whole picture over: opening, the panel OOZES out of the trigger and fires
   on the pop spring; closing, it dives back in and the trigger splats. Press
   and drag the trigger or the panel's padding and a liquid finger stretches out
   of the rim (stretch.ts), the seam engine lighting the borders where they meet
   (seam.ts) in the app's accent. Hover travels as one pill under the rows
   (row-hover.tsx). Every gesture speaks (sfx.ts, quiet).

   The pieces:  liquid-refs.ts (the element bag) · liquid-geometry.ts (measure →
   write the SVG picture) · liquid-goo-canvas.tsx (layer 2) · liquid-rows.tsx
   (layer 3 rows) · liquid-theme.ts (the dark frame's values). */

import React, {
    useCallback,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
} from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";

import { cn } from "@/lib/utils";
import { setGooBlur } from "./goo";
import { measureLiquid, setLiquidFilterRegion, type Geom } from "./liquid-geometry";
import { createPopoverSeam, createPopoverStretchHost, type PopoverHostCtx } from "./liquid-hosts";
import { LiquidGooCanvas, SEAM_LAYERS } from "./liquid-goo-canvas";
import { createLiquidRefs } from "./liquid-refs";
import { LiquidRows, type LiquidPopoverItem } from "./liquid-rows";
import {
    ACCENT,
    LIQUID_SURFACE,
    NOISE_OPACITY,
    NOISE_SRC,
    NOISE_TILE_H,
    NOISE_TILE_W,
    PANEL_PAD,
    ROW_RADIUS,
    neonGlow,
    solidRim,
} from "./liquid-theme";
import { prefersReducedMotion } from "./motion";
import { RowHover, type RowHoverTarget } from "./row-hover";
import type { LiquidSeam, SeamJoint } from "./seam";
import { gooSfx } from "./sfx";
import { HOUSE_SPRING_POINTS, POP_SPRING_POINTS, springEase } from "./springs";
import { createLiquidStretch, type LiquidStretch, type StretchHost } from "./stretch";

export type { LiquidPopoverItem };

gsap.registerPlugin(CustomEase);

const SPRING = springEase("liquidPopSpring", HOUSE_SPRING_POINTS);
const POP = springEase("liquidPopPop", POP_SPRING_POINTS);
const OUT_STRONG = CustomEase.create("liquidPopOutStrong", "0.23,1,0.32,1");
const MORPH = CustomEase.create("liquidPopMorph", "0.5,0,0.1,1");
const BACK_OUT = CustomEase.create("liquidPopBackOut", "0.34,1.6,0.64,1");

/* Blur discipline (see goo.ts — blur and thresholds switch together). The
   dropdown grows out of (and dives into) the button it overlaps — one mass,
   no far necks — so a light blur carries the look. */
const GOO_BLUR_ACTIVE = 5;
const GOO_BLUR_REST = 1;
const GOO_BLUR_GRAB = 5;

export type LiquidPopoverProps = {
    /** Content of the trigger button (the component renders its own <button>). */
    trigger: React.ReactNode;
    triggerClassName?: string;
    triggerAriaLabel?: string;
    items: LiquidPopoverItem[];
    /** Controlled open state; omit for uncontrolled. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Stop click events from bubbling out (for menus inside clickable cards). */
    stopPropagation?: boolean;
    /** Optional fixed-height header rendered above the items. */
    header?: React.ReactNode;
    headerHeight?: number;
    /** Panel width in px. */
    width?: number;
    align?: "start" | "center" | "end";
    /** Shift along the align axis, in px. */
    alignOffset?: number;
    side?: "top" | "bottom";
    /** Distance between trigger and panel — the pour crosses this. */
    gap?: number;
    itemHeight?: number;
    /** Clamp the panel height; items scroll inside when content exceeds it. */
    maxPanelHeight?: number;
    disabled?: boolean;
    panelRadius?: number;
    fill?: string;
    className?: string;
};

export function LiquidPopover({
    trigger,
    triggerClassName,
    triggerAriaLabel,
    items,
    open: controlledOpen,
    onOpenChange,
    stopPropagation = false,
    header,
    headerHeight = 48,
    width = 450,
    align = "end",
    alignOffset = 0,
    side = "bottom",
    gap = 14,
    itemHeight = 52,
    maxPanelHeight,
    disabled = false,
    panelRadius = 24,
    fill = LIQUID_SURFACE,
    className,
}: LiquidPopoverProps) {
    const menuId = useId();
    const gooId = `liquid-goo-${useId().replace(/:/g, "")}`;
    const ids = {
        goo: gooId,
        blobs: `${gooId}-blobs`,
        rimOnly: `${gooId}-rim`,
        rimMask: `${gooId}-mask`,
        seamGradient: `${gooId}-seam`,
        noise: `${gooId}-noise`,
    };

    const refs = useRef(createLiquidRefs()).current;
    const timelineRef = useRef<gsap.core.Timeline | null>(null);
    const pressTweenRef = useRef<gsap.core.Tween | null>(null);
    const stretchRef = useRef<LiquidStretch | null>(null);
    const stretchHostRef = useRef<StretchHost | null>(null);
    const seamRef = useRef<LiquidSeam | null>(null);
    /* Whose border the grab is currently stretching — the finger's beads
       belong to it, so they cannot light a joint against their own body. */
    const grabbedOwnerRef = useRef("trigger");
    const litRowRef = useRef<number | null>(null);
    /* Mirrors isOpen for the engines' host callbacks, which are created once
       and must not close over a stale render's state. */
    const isOpenRef = useRef(false);
    const geomRef = useRef<Geom | null>(null);

    const [isOpen, setIsOpen] = useState(false);
    const [hoverTarget, setHoverTarget] = useState<RowHoverTarget | null>(null);
    /* HATCH-ON-DEMAND. A feed page mounts sixty-plus of these at once, and the
       full liquid picture per instance — goo canvas, panel rows, measure()'s
       interleaved layout reads/writes, gsap's per-SVG getBBox origins, two
       ResizeObservers — ran inside ONE React commit: a measured 21.9s main
       thread block on /feed (the "page isn't responding" dialog). Until a
       popover is first hovered or pressed it renders ONLY its trigger; the
       machinery mounts on hatch, and a cold click opens via pendingOpen once
       the hatch effect has placed the resting picture. */
    const [hatched, setHatched] = useState(false);
    const hatchedRef = useRef(false);
    const pendingOpenRef = useRef(false);
    const hatch = useCallback(() => {
        if (!hatchedRef.current) {
            hatchedRef.current = true;
            setHatched(true);
        }
    }, []);

    const isControlled = controlledOpen !== undefined;
    const rim = solidRim(fill);

    /* Measured off the live DOM and written straight to the SVG picture: at
       mount, on panel/trigger resize, and right before every open and grab,
       so the pour's origin is never a render behind the layout. */
    const measure = useCallback(() => {
        const geom = measureLiquid(refs, { width, align, alignOffset, side, gap, panelRadius });
        if (geom) {
            geomRef.current = geom;
            if (stretchHostRef.current) {
                stretchHostRef.current.buttonSize = geom.tw;
            }
        }
        return geom;
    }, [align, alignOffset, gap, panelRadius, refs, side, width]);

    const getTriggerBits = useCallback(() => [refs.blobTrigger, refs.trigger], [refs]);
    /* How hard the trigger may deform. The reference's swell/squash/splat are
       tuned for a 32px circle; on a full-width row trigger (the sidebar's
       More) the same 1.16 swell inflates the button's own hover pill into a
       visibly oversized blob. Amplitude falls off with trigger size — full
       feel on icon buttons, a breath on wide rows. */
    const fxScale = useCallback(() => {
        const geom = geomRef.current;
        if (!geom) {
            return 1;
        }
        return Math.min(1, Math.max(0.25, 44 / Math.max(geom.tw, geom.th)));
    }, []);
    const getPanelTrio = useCallback(() => [refs.blobPanel, refs.panelBody, refs.panel], [refs]);
    /* The stagger's targets, DOM order: header content, then each row's
       content wrapper. */
    const innerBits = useCallback(
        () => [refs.headerInner, ...refs.itemInners].filter(Boolean) as HTMLElement[],
        [refs],
    );

    /* Blur + rim thresholds are ONE setting; the mask carves its rim out of
       the same blur with the same pair — a mask one setting behind would let
       the accent slip off the border it is painted on. */
    const applyGooBlur = useCallback(
        (blur: number, tl?: gsap.core.Timeline, at = 0) => {
            setGooBlur({ blur: refs.blur, rim: refs.rimEdge, inner: refs.innerEdge }, blur, tl, at);
            setGooBlur(
                { blur: refs.maskBlur, rim: refs.maskRimEdge, inner: refs.maskInnerEdge },
                blur,
                tl,
                at,
            );
        },
        [refs],
    );

    const liquidOn = useCallback(
        (blur: number) => {
            gsap.set(refs.goo, { autoAlpha: 1 });
            gsap.set(refs.bodies, { autoAlpha: 0 });
            applyGooBlur(blur);
            refs.root?.setAttribute("data-liquid", "");
        },
        [applyGooBlur, refs],
    );

    /* The neon catch, cleared: a row lit by a completed merge lets go the
       moment the picture is no longer the gesture's. */
    const clearRowNeon = useCallback(() => {
        litRowRef.current = null;
        refs.items.forEach((item) => {
            if (item) {
                item.style.color = "";
                item.style.filter = "";
            }
        });
    }, [refs]);

    /* A row's y within the panel, walking the offsetParent chain — the
       squircle wrapper Lisse injects is position:relative, so a bare
       offsetTop would measure against the wrapper, not the panel. */
    const offsetWithinPanel = useCallback(
        (el: HTMLElement) => {
            let y = 0;
            let node: HTMLElement | null = el;
            while (node && node !== refs.panel) {
                y += node.offsetTop;
                node = node.offsetParent as HTMLElement | null;
            }
            return y;
        },
        [refs],
    );

    /* Which row a canvas-space y lands on — nearest by the rows' live boxes,
       because the app's menus mix row heights (headers, separators). */
    const nearestRow = useCallback(
        (y: number) => {
            const geom = geomRef.current;
            if (!geom) {
                return null;
            }
            const local = y - geom.panel.y + (refs.scroller?.scrollTop ?? 0);
            let pick: number | null = null;
            let best = Infinity;
            refs.items.forEach((item, index) => {
                if (!item) {
                    return;
                }
                const center = offsetWithinPanel(item) + item.offsetHeight / 2;
                const dist = Math.abs(center - local);
                if (dist < best) {
                    best = dist;
                    pick = index;
                }
            });
            return pick;
        },
        [offsetWithinPanel, refs],
    );
    /* ── Engines — created once per instance; they read the newest render's
       callbacks through hostCtxRef (see liquid-hosts.ts). ─────────────────── */

    /* Neon rows: a touch shows only the border light; once the merge
       completes (the engine's `joined`), the nearest row catches the accent
       with a soft bloom. Styles are written only on a state change. */
    const jointsFn = (joints: SeamJoint[]) => {
        let lit: number | null = null;
        joints.forEach((joint) => {
            if (!joint.joined || !joint.owners.includes("panel")) {
                return;
            }
            /* A fully swallowed contact reports no position — the light stays
               on whatever row it last named. */
            lit = joint.y !== undefined ? nearestRow(joint.y) : litRowRef.current;
        });
        if (lit === litRowRef.current) {
            return;
        }
        litRowRef.current = lit;
        refs.items.forEach((item, index) => {
            if (!item) {
                return;
            }
            const on = index === lit;
            item.style.color = on ? ACCENT : "";
            item.style.filter = on ? neonGlow(ACCENT) : "";
        });
    };

    const hostCtxRef = useRef<PopoverHostCtx>(null as unknown as PopoverHostCtx);
    hostCtxRef.current = {
        refs,
        geomRef,
        isOpenRef,
        timelineRef,
        grabbedOwnerRef,
        jointsFn,
        getTriggerBits,
        getPanelTrio,
        innerBits,
        measure,
        liquidOn,
        applyGooBlur,
        clearRowNeon,
        fxScale,
    };
    if (stretchHostRef.current === null) {
        stretchHostRef.current = createPopoverStretchHost(hostCtxRef);
    }
    if (stretchRef.current === null) {
        stretchRef.current = createLiquidStretch(stretchHostRef.current);
    }
    const stretch = stretchRef.current;
    if (seamRef.current === null) {
        seamRef.current = createPopoverSeam(hostCtxRef);
    }


    /* ── Resting picture ──────────────────────────────────────────────── */

    /* The resting picture, placed when the machinery MOUNTS (hatch), not when
       the component does — see the hatch note above. */
    const openMenuRef = useRef<() => void>(() => {});
    useLayoutEffect(() => {
        if (!hatched) {
            return;
        }
        const geom = measure();
        gsap.set(getPanelTrio(), { scale: geom?.restScale ?? 0.08, rotation: -3 });
        gsap.set([refs.panelBody, refs.panel], { autoAlpha: 0 });
        gsap.set(innerBits(), { autoAlpha: 0 });
        gsap.set(refs.chain, { scale: 0, transformOrigin: "50% 50%" });
        /* The trigger blob stays OUT of the picture — permanently. In the
           reference the trigger is a bordered circle, so the goo redrawing it
           rim-and-all was pixel-identical; the app's triggers are borderless
           icon buttons and pills, and the same redraw materialized an OUTLINED
           pill around them for the length of every flight (the owner's
           "outline around the trigger", 2026-08-20). Hidden by style rather
           than removed: the stretch engine still tweens it (harmless), and
           hiddenByStyle drops it from the seam's parts automatically. The pour
           still originates at the trigger's center — only the phantom body is
           gone; during a grab the finger's beads carry the liquid alone. */
        gsap.set(refs.blobTrigger, { transformOrigin: "50% 50%", autoAlpha: 0 });
        gsap.set(refs.goo, { autoAlpha: 0 });
        gsap.set(refs.bodies, { autoAlpha: 1 });

        seamRef.current?.start();

        /* Content and layout drift (fonts, viewport, item changes) re-measure
           the picture; the resting transforms stay wherever they are. */
        const observer = new ResizeObserver(() => measure());
        if (refs.panel) observer.observe(refs.panel);
        if (refs.trigger) observer.observe(refs.trigger);

        /* A cold click hatched first and parked the open here. */
        if (pendingOpenRef.current) {
            pendingOpenRef.current = false;
            openMenuRef.current();
        }

        return () => {
            observer.disconnect();
            timelineRef.current?.kill();
            pressTweenRef.current?.kill();
            stretchRef.current?.kill();
            seamRef.current?.kill();
        };
        /* Hatch only — a re-run re-parks the panel at rest while isOpen still
           says open. Prop-driven geometry changes go through measure() via
           the ResizeObserver and the pre-open measure instead. */
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hatched]);

    const setStaticState = useCallback(
        (open: boolean) => {
            gsap.set(getPanelTrio(), {
                scale: open ? 1 : geomRef.current?.restScale ?? 0.08,
                rotation: open ? 0 : -3,
                x: 0,
                y: 0,
            });
            gsap.set([refs.panelBody, refs.panel], { autoAlpha: open ? 1 : 0 });
            gsap.set(refs.blobPanel, { autoAlpha: 1 });
            gsap.set(innerBits(), { autoAlpha: open ? 1 : 0, y: 0 });
            gsap.set(getTriggerBits(), { scale: 1, x: 0, y: 0 });
            gsap.set(refs.goo, { autoAlpha: 0 });
            gsap.set(refs.bodies, { autoAlpha: 1 });
            clearRowNeon();
            refs.root?.removeAttribute("data-liquid");
            refs.root?.removeAttribute("data-grab");
        },
        [clearRowNeon, getPanelTrio, getTriggerBits, innerBits, refs],
    );

    /* ── Open / close choreography (LiquidAdd's, side-aware) ──────────── */

    const setOpen = useCallback(
        (next: boolean) => {
            if (!isControlled) setIsOpen(next);
            onOpenChange?.(next);
        },
        [isControlled, onOpenChange],
    );

    const openMenu = useCallback(() => {
        if (!refs.panel) {
            /* Cold click on a never-hatched popover: mount the machinery, and
               the hatch effect runs this open once the picture is placed. */
            pendingOpenRef.current = true;
            hatch();
            return;
        }
        timelineRef.current?.kill();
        pressTweenRef.current?.kill();
        stretch.kill();
        isOpenRef.current = true;
        setOpen(true);
        const geom = measure();
        /* A plain open never grows a finger — rasterize the blur over the
           trigger∪panel bounds only. The next grab's measure() restores the
           full region. */
        if (geom) setLiquidFilterRegion(refs, geom, "flight");

        if (prefersReducedMotion()) {
            setStaticState(true);
            return;
        }

        clearRowNeon();
        gooSfx.play("open", { frame: "dark" });
        liquidOn(GOO_BLUR_ACTIVE);
        refs.root?.removeAttribute("data-grab");
        const triggerBits = getTriggerBits();
        const tl = gsap.timeline();
        timelineRef.current = tl;

        tl.set([refs.panelBody, refs.panel], { autoAlpha: 1 }, 0);
        /* The goo panel MATERIALIZES as it grows rather than starting shown:
           parked at rest-scale it is a tiny outlined squircle sitting right on
           the button. The reference never saw this — its parked panel hid
           inside the trigger circle's own goo mass, and that mass is gone (the
           borderless-trigger fix). Fading in across the ooze keeps the first
           visible panel already in motion. */
        tl.fromTo(refs.blobPanel, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.12, ease: "power1.out" }, 0.03);
        tl.set(getPanelTrio(), { x: 0, y: 0 }, 0);
        tl.set(refs.blobTrigger, { rotation: 0 }, 0);
        /* Park the grab chain in case this click ended a sponge pull. */
        tl.to(refs.chain, { x: 0, y: 0, scale: 0, duration: 0.14, ease: OUT_STRONG, overwrite: "auto" }, 0);

        /* The button swells as the drop gathers, then shakes it off —
           amplitude scaled to the trigger's size (see fxScale). */
        const f = fxScale();
        tl.to(triggerBits, { x: 0, y: 0, scale: 1 + 0.16 * f, duration: 0.13, ease: OUT_STRONG }, 0);
        tl.to(triggerBits, { scale: 1, duration: 0.34, ease: SPRING }, 0.15);

        /* The dropdown oozes out, then fires on the pop spring — swinging
           upright from its resting tilt, jelly phase-lag included. */
        const trio = getPanelTrio();
        tl.to(trio, { scale: 0.42, duration: 0.14, ease: "power1.inOut" }, 0.03);
        tl.to(trio, { scaleY: 1, rotation: 0, duration: 0.26, ease: POP }, 0.17);
        tl.to(trio, { scaleX: 1, duration: 0.26, ease: POP }, 0.2);

        /* Rows condense from the trigger's side — the direction the drop
           grew: bottom-up when the panel hangs above, top-down below. A hard
           fromTo would blank rows still half on screen after an interrupted
           close, so they only reset when actually away. */
        const bits = innerBits();
        if (Number(gsap.getProperty(bits[0] ?? null, "opacity")) < 0.05) {
            tl.set(bits, { autoAlpha: 0, y: side === "top" ? 12 : -12 }, 0);
        }
        tl.to(
            bits,
            {
                autoAlpha: 1,
                y: 0,
                duration: 0.19,
                ease: BACK_OUT,
                stagger: { each: 0.03, from: side === "top" ? "end" : "start" },
            },
            0.2,
        );

        /* Hand back to the crisp picture at full blur — the bodies snap on
           UNDER the still-opaque goo (identical pixels), the goo alone fades,
           and the blur resets only once it is hidden so the rim never thins
           on screen. */
        tl.set(refs.bodies, { autoAlpha: 1 }, 0.47);
        tl.to(refs.goo, { autoAlpha: 0, duration: 0.16, ease: "power1.out" }, 0.47);
        applyGooBlur(GOO_BLUR_REST, tl, 0.64);
        tl.call(() => refs.root?.removeAttribute("data-liquid"), undefined, 0.63);
    }, [applyGooBlur, clearRowNeon, fxScale, getPanelTrio, getTriggerBits, hatch, innerBits, liquidOn, measure, refs, setOpen, setStaticState, side, stretch]);

    const closeMenu = useCallback(
        (fromTrigger: boolean) => {
            timelineRef.current?.kill();
            pressTweenRef.current?.kill();
            stretch.kill();
            isOpenRef.current = false;
            setOpen(false);
            setHoverTarget(null);
            if (geomRef.current) setLiquidFilterRegion(refs, geomRef.current, "flight");

            if (prefersReducedMotion()) {
                setStaticState(false);
                return;
            }

            clearRowNeon();
            gooSfx.play("close", { frame: "dark" });
            liquidOn(GOO_BLUR_ACTIVE);
            refs.root?.removeAttribute("data-grab");
            const triggerBits = getTriggerBits();
            const tl = gsap.timeline();
            timelineRef.current = tl;

            tl.set(refs.blobPanel, { autoAlpha: 1 }, 0);
            /* The mirror of the open's materialize: the drop dissolves as it
               lands so no outlined dot survives at the button. Gone by 0.17,
               when the panel parks at rest-scale. */
            tl.to(refs.blobPanel, { autoAlpha: 0, duration: 0.07, ease: "power1.in" }, 0.1);
            tl.set(refs.blobTrigger, { rotation: 0 }, 0);
            tl.to(triggerBits, { x: 0, y: 0, duration: 0.1, ease: OUT_STRONG }, 0);
            tl.to(refs.chain, { x: 0, y: 0, scale: 0, duration: 0.1, ease: OUT_STRONG, overwrite: "auto" }, 0);

            /* One fast dive: the drop crashes ONTO the button (a flash of
               merged mass around 90ms), gets drunk in immediately, and the
               splat carries the rest of the story. The final nudge travels
               toward the trigger, whichever side the panel hangs on. */
            const trio = getPanelTrio();
            tl.to(trio, { x: 0, y: 0, duration: 0.1, ease: OUT_STRONG }, 0);
            tl.to(trio, { scaleX: 0.35, duration: 0.08, ease: MORPH }, 0);
            tl.to(trio, { scaleY: 0.35, rotation: -3, duration: 0.08, ease: MORPH }, 0.015);
            tl.to(
                innerBits(),
                { autoAlpha: 0, y: side === "top" ? 4 : -4, duration: 0.05, ease: "power1.in", stagger: 0.005 },
                0,
            );
            tl.to(
                trio,
                {
                    scale: geomRef.current?.restScale ?? 0.08,
                    y: side === "top" ? 6 : -6,
                    duration: 0.06,
                    ease: "power2.in",
                },
                0.1,
            );
            tl.set(trio, { y: 0 }, 0.17);
            tl.set([refs.panelBody, refs.panel], { autoAlpha: 0 }, 0.17);

            if (fromTrigger) {
                /* Carry the pressed squash back up on the shared spring first. */
                tl.to(triggerBits, { scale: 1, duration: 0.1, ease: SPRING }, 0);
            }

            /* The drop lands IN the button and the button is liquid too: a
               modest splat, a small slosh back, then it rings itself round. */
            const f = fxScale();
            tl.to(
                triggerBits,
                {
                    keyframes: [
                        { scaleX: 1 + 0.18 * f, scaleY: 1 - 0.16 * f, duration: 0.05, ease: "power2.out" },
                        { scaleX: 1 - 0.05 * f, scaleY: 1 + 0.06 * f, duration: 0.07, ease: "power1.inOut" },
                        { scaleX: 1, scaleY: 1, duration: 0.24, ease: SPRING },
                    ],
                    overwrite: "auto",
                },
                0.14,
            );

            tl.set(refs.bodies, { autoAlpha: 1 }, 0.22);
            tl.to(refs.goo, { autoAlpha: 0, duration: 0.1, ease: "power1.out" }, 0.22);
            applyGooBlur(GOO_BLUR_REST, tl, 0.33);
            tl.call(() => refs.root?.removeAttribute("data-liquid"), undefined, 0.32);
        },
        [applyGooBlur, clearRowNeon, fxScale, getPanelTrio, getTriggerBits, innerBits, liquidOn, refs, setOpen, setStaticState, side, stretch],
    );

    openMenuRef.current = openMenu;

    /* Controlled open: the prop drives the same choreography the clicks do. */
    useEffect(() => {
        if (!isControlled || controlledOpen === isOpenRef.current) {
            return;
        }
        if (controlledOpen) {
            openMenu();
        } else {
            closeMenu(false);
        }
    }, [closeMenu, controlledOpen, isControlled, openMenu]);

    const effectiveOpen = isControlled ? (controlledOpen as boolean) : isOpen;

    const toggleMenu = useCallback(() => {
        if (stretch.consumeClick() || disabled) {
            return;
        }
        if (isOpenRef.current) {
            closeMenu(true);
        } else {
            openMenu();
        }
    }, [closeMenu, disabled, openMenu, stretch]);

    /* ── Gesture wires (the gesture itself lives in stretch.ts) ───────── */

    const releasePress = useCallback(() => stretch.release(), [stretch]);

    const handleTriggerPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLButtonElement>) => {
            if (disabled) {
                return;
            }
            if (!refs.panel) {
                /* First-ever touch: mount the machinery; the grab gesture is
                   available from the next press on. */
                hatch();
                return;
            }
            const geom = measure();
            /* The engine's grab origin is anchor + buttonSize/2 on BOTH axes;
               the y base compensates for a non-square trigger so the finger
               is pulled from the true center. */
            stretch.beginGrab("trigger", event, {
                x: 0,
                y: geom ? geom.th / 2 - geom.tw / 2 : 0,
            });
        },
        [disabled, hatch, measure, refs, stretch],
    );

    /* Grabbing the panel: same sponge, measured from the grab point itself.
       But NOT from a row — a press there is a selection gesture; the pointer
       capture a grab takes would retarget the click and the row would never
       hear it. Rows press; the panel's own padding grabs. */
    const handlePanelPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            if (!isOpenRef.current) {
                return;
            }
            if ((event.target as Element).closest("button, a, input, [role^='menuitem']")) {
                return;
            }
            const anchorRect = refs.root?.getBoundingClientRect();
            const geom = geomRef.current;
            if (!anchorRect || !geom) {
                return;
            }
            stretch.beginGrab(0, event, {
                x: event.clientX - (anchorRect.left + geom.tw / 2),
                y: event.clientY - (anchorRect.top + geom.tw / 2),
            });
        },
        [refs, stretch],
    );

    const handleGrabPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => stretch.pointerMove(event),
        [stretch],
    );

    /* A press on a row is felt by the WHOLE dropdown: the liquid mass gives a
       touch — sinking toward the button it hangs from — and springs back the
       moment the finger lets go. Crisp transforms, no goo. */
    const releasePanelPress = useCallback(() => {
        if (prefersReducedMotion()) {
            return;
        }
        pressTweenRef.current?.kill();
        pressTweenRef.current = gsap.to(getPanelTrio(), {
            scaleX: 1,
            scaleY: 1,
            duration: 0.55,
            ease: SPRING,
            overwrite: "auto",
        });
    }, [getPanelTrio]);

    const handleItemPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLElement>) => {
            if (event.button !== 0 || prefersReducedMotion()) {
                return;
            }
            pressTweenRef.current?.kill();
            pressTweenRef.current = gsap.to(getPanelTrio(), {
                scaleX: 0.985,
                scaleY: 0.96,
                duration: 0.12,
                ease: OUT_STRONG,
                overwrite: "auto",
            });
            /* The window backstop, not the row: the release must land
               wherever the pointer lets go, even far outside the button. */
            window.addEventListener("pointerup", releasePanelPress, { once: true });
            window.addEventListener("pointercancel", releasePanelPress, { once: true });
        },
        [getPanelTrio, releasePanelPress],
    );

    const select = useCallback(
        (item: LiquidPopoverItem) => {
            if (stretch.consumeClick()) {
                return;
            }
            item.onClick?.();
            if (item.closeOnSelect !== false) {
                closeMenu(false);
            } else {
                gooSfx.play("tick", { frame: "dark" });
            }
        },
        [closeMenu, stretch],
    );

    const hoverRow = useCallback(
        (el: HTMLElement) => {
            const scrollTop = refs.scroller?.scrollTop ?? 0;
            setHoverTarget((prev) => {
                const next = { y: offsetWithinPanel(el) - scrollTop, height: el.offsetHeight };
                return prev && prev.y === next.y && prev.height === next.height ? prev : next;
            });
        },
        [offsetWithinPanel, refs],
    );

    useEffect(() => {
        if (!effectiveOpen) {
            setHoverTarget(null);
            return;
        }

        const handlePointerDown = (event: PointerEvent) => {
            if (!refs.root?.contains(event.target as Node)) {
                closeMenu(false);
            }
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closeMenu(false);
                refs.trigger?.focus();
            }
        };
        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [closeMenu, effectiveOpen, refs]);

    /* ── Render ───────────────────────────────────────────────────────── */

    return (
        <div
            ref={(el) => {
                refs.root = el;
            }}
            className={cn("group/liquid relative inline-flex select-none", className)}
            onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        >
            {/* THE OVERFLOW CLIPPER. The three liquid layers below are
                absolutely positioned at PANEL geometry while closed (the
                pre-measure that makes the pour instant), and hidden only by
                autoAlpha — but visibility:hidden still contributes SCROLLABLE
                OVERFLOW. A dropdown near a viewport edge (home's rail footer)
                handed the app scroller 182px of horizontal dead space plus a
                strip below the fold, reported 8/20 as "I can scroll
                horizontally now".

                So: clipped whenever the goo is idle AND the menu is closed —
                the two flags the engine already maintains. data-liquid on the
                root covers every goo activation (open pour, close dive,
                trigger grabs) and is removed at every settle; data-open here
                covers the at-rest open panel after the pour's data-liquid is
                dropped. Clipping affects painting only, never layout, so
                measureLiquid reads the same boxes.

                On the WRAPPER, not the root: the trigger stays a direct child
                of the root so its focus-visible ring is never clipped. No
                pointer-events juggling — the trigger paints later at the same
                z, and the panel receives its own events inside this box. */}
            {hatched && (<>
            <div
                className="absolute inset-0 overflow-clip group-data-[liquid]/liquid:overflow-visible data-[open]:overflow-visible"
                data-open={effectiveOpen ? "" : undefined}
            >
            {/* Layer 1: the crisp panel body — the resting picture: a true
                Apple squircle with the border as a stroke. No shadow — the
                dark frame carries none, which is also the house rule. */}
            <div
                ref={(el) => {
                    refs.bodies = el;
                }}
                /* `isolate` is the grain's: the noise path blends in `overlay`,
                   and without an isolated group its backdrop is whatever the
                   menu floats over — the texture would tint the page through
                   the panel. On the DIV, not the <svg>, because an HTML box is
                   the one place every engine honours `isolation` (and the svg's
                   inline style belongs to gsap's autoAlpha). */
                className="pointer-events-none absolute inset-0 isolate"
                aria-hidden="true"
            >
                <svg
                    ref={(el) => {
                        refs.panelBody = el;
                    }}
                    className="absolute overflow-visible will-change-transform"
                    /* Hidden in the MARKUP too — the SSR HTML must arrive
                       invisible or every menu flashes open, unstyled, for the
                       beat before hydration (no border, transparent bg: the
                       "rough" first paint). gsap's autoAlpha writes these same
                       properties from the mount effect on. */
                    style={{ opacity: 0, visibility: "hidden" }}
                    focusable="false"
                >
                    {/* The grain's tile. userSpaceOnUse + the PNG's own pixel
                        size: the pattern is laid at 1:1 and repeated, so the
                        noise stays noise instead of stretching with the
                        panel's width. */}
                    <defs>
                        <pattern
                            id={ids.noise}
                            patternUnits="userSpaceOnUse"
                            width={NOISE_TILE_W}
                            height={NOISE_TILE_H}
                        >
                            <image
                                href={NOISE_SRC}
                                width={NOISE_TILE_W}
                                height={NOISE_TILE_H}
                                preserveAspectRatio="none"
                            />
                        </pattern>
                    </defs>
                    <path
                        ref={(el) => {
                            refs.panelBodyShape = el;
                        }}
                        fill={fill}
                        stroke={rim}
                        strokeWidth={1}
                    />
                    {/* The grain, over the face and under the rows. No stroke:
                        the border is the face's, and blending the tile into it
                        would fray the one crisp line the resting picture has.
                        `isolate` on the <svg> keeps the blend's backdrop to
                        the face — without it an `overlay` composites against
                        whatever the menu is flying over. */}
                    <path
                        ref={(el) => {
                            refs.panelBodyNoise = el;
                        }}
                        fill={`url(#${ids.noise})`}
                        style={{ mixBlendMode: "overlay", opacity: NOISE_OPACITY }}
                    />
                </svg>
            </div>

            {/* Layer 2: the liquid. */}
            <LiquidGooCanvas refs={refs} ids={ids} fill={fill} rim={rim} />

            {/* Layer 3: rows and hit areas above the liquid. */}
            <div
                id={menuId}
                ref={(el) => {
                    refs.panel = el;
                }}
                role="menu"
                inert={!effectiveOpen}
                className="absolute z-[2] flex flex-col will-change-transform"
                /* opacity/visibility: the same SSR-invisible rule as the panel
                   body above — the rows must not paint before hydration. */
                style={{ width, padding: PANEL_PAD, maxHeight: maxPanelHeight, opacity: 0, visibility: "hidden" }}
                onPointerDown={handlePanelPointerDown}
                onPointerMove={handleGrabPointerMove}
                onPointerUp={releasePress}
                onPointerCancel={releasePress}
                onPointerLeave={() => setHoverTarget(null)}
            >
                {/* The hover travels UNDER the rows — one highlight for the
                    list, not a state painted on each row. */}
                <RowHover target={hoverTarget} inset={PANEL_PAD} radius={ROW_RADIUS - 4} />

                {header && (
                    <div className="relative z-[1] shrink-0" style={{ height: headerHeight }}>
                        <div
                            ref={(el) => {
                                refs.headerInner = el;
                            }}
                            className="h-full will-change-transform"
                        >
                            {header}
                        </div>
                    </div>
                )}

                <div
                    ref={(el) => {
                        refs.scroller = el;
                    }}
                    className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto"
                >
                    <LiquidRows
                        items={items}
                        itemHeight={itemHeight}
                        refs={refs}
                        onSelect={select}
                        onRowPointerDown={handleItemPointerDown}
                        onHoverRow={hoverRow}
                    />
                </div>
            </div>
            </div>
            </>)}

            <button
                ref={(el) => {
                    refs.trigger = el;
                }}
                type="button"
                aria-label={triggerAriaLabel}
                aria-expanded={effectiveOpen}
                aria-haspopup="menu"
                aria-controls={menuId}
                disabled={disabled}
                className={cn(
                    "relative z-[2] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 will-change-transform",
                    triggerClassName,
                    disabled && "pointer-events-none opacity-50",
                )}
                onClick={toggleMenu}
                onPointerEnter={hatch}
                onPointerDown={handleTriggerPointerDown}
                onPointerMove={handleGrabPointerMove}
                onPointerUp={releasePress}
                onPointerLeave={releasePress}
                onPointerCancel={releasePress}
            >
                <span className="contents">{trigger}</span>
            </button>
        </div>
    );
}
