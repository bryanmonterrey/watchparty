"use client";

// Vendored by hand from https://www.interior.dev/r/tooltip-group.json
// (registry:ui "tooltip-group") rather than installed, for the same reason
// `load-more.tsx` is: the shadcn CLI resolves this repo's aliases to
// `src/components/`, which is not where components live here. The item ships no
// `lib/*` files and no registryDependencies, so it carries none of the
// overwrite hazard documented in CLAUDE.md — its only dependency is `motion`,
// which is already installed. Checked with the raw JSON, not a --dry-run.
//
// Behavior is byte-for-byte upstream: one shared store per group, so moving
// between neighbouring triggers swaps the SAME tooltip (a `layoutId` glide)
// instead of cross-fading two, and the open delay is skipped while the group is
// "warm". What changed:
//
//   - `text-[11.5px]` -> `text-xs`. An arbitrary size is a new violation of
//     scripts/guards/check-text-scale.mjs, which gates deploy.
//   - Upstream's stone palette and its DROP SHADOWS are gone. A gray/black
//     shadow is against docs/design-principles.md; depth here is an inner
//     hairline plus a top inset highlight.
//   - A `tone` prop, copied from LoadMore. The video player paints its own
//     always-dark surface, and `--popover-foreground` inverts on Light, so a
//     themed tooltip would render white-on-white there (see CLAUDE.md).
//   - An `offset` prop. Upstream hardcodes a 7px gap; the player needs the
//     tooltip lifted clear of the scrubber.

import {
    cloneElement,
    createContext,
    useContext,
    useEffect,
    useId,
    useRef,
    useSyncExternalStore,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const LEAVE = [0.4, 0, 1, 1] as const;

const RISE = { type: "spring", stiffness: 560, damping: 34, mass: 0.6 } as const;

const WARM = { type: "spring", stiffness: 900, damping: 48, mass: 0.5 } as const;

const GLIDE = { type: "spring", stiffness: 520, damping: 40, mass: 0.75 } as const;

const SWAP = { type: "spring", stiffness: 700, damping: 44, mass: 0.5 } as const;

/** The distance the tooltip travels as it rises in, in px. Not the gap. */
const LIFT = 7;

/** Upstream's gap between trigger edge and tooltip, in px. */
const DEFAULT_OFFSET = 7;

let groups = 0;

const stop = (t: Timer): Timer => {
    if (t !== null) clearTimeout(t);
    return null;
};

export type TooltipTiming = {
    openDelay: number;
    closeDelay: number;
    skipDelay: number;
};

type Timer = ReturnType<typeof setTimeout> | null;

type TooltipStore = {
    seat: string;
    subscribe: (fn: () => void) => () => void;
    getActive: () => string | null;
    getWarm: () => boolean;
    getSkipped: () => boolean;
    getTravel: () => number;
    open: (id: string, immediate: boolean, x?: number) => void;
    close: (id: string, immediate: boolean) => void;
    dismiss: (id: string) => void;
    unblock: (id: string) => void;
    reset: () => void;
    dispose: () => void;
};

function createTooltipStore(getTiming: () => TooltipTiming): TooltipStore {
    const listeners = new Set<() => void>();

    let active: string | null = null;
    let pending: string | null = null;
    let blocked: string | null = null;
    let warm = false;
    let skipped = false;
    let lastX: number | null = null;
    let travel = 0;

    let openTimer: Timer = null;
    let closeTimer: Timer = null;
    let coolTimer: Timer = null;

    const notify = () => {
        for (const fn of listeners) fn();
    };

    const setActive = (next: string | null) => {
        if (active === next) return;
        if (next !== null) {
            skipped = warm;
            warm = true;
        }
        active = next;
        notify();
    };

    const cool = () => {
        coolTimer = stop(coolTimer);
        const { skipDelay } = getTiming();
        if (skipDelay <= 0) {
            if (warm) {
                warm = false;
                notify();
            }
            return;
        }
        coolTimer = setTimeout(() => {
            coolTimer = null;
            warm = false;
            notify();
        }, skipDelay);
    };

    groups += 1;
    const seat = `tooltip-seat-${groups}`;

    return {
        seat,
        subscribe(fn) {
            listeners.add(fn);
            return () => {
                listeners.delete(fn);
            };
        },
        getActive: () => active,
        getWarm: () => warm,
        getSkipped: () => skipped,
        getTravel: () => travel,
        open(id, immediate, x) {
            if (blocked === id) return;
            closeTimer = stop(closeTimer);
            coolTimer = stop(coolTimer);
            if (active === id) {
                openTimer = stop(openTimer);
                pending = null;
                return;
            }
            const arrive = () => {
                travel = lastX !== null && x !== undefined ? Math.sign(x - lastX) : 0;
                lastX = x ?? null;
                setActive(id);
            };
            if (immediate || warm) {
                openTimer = stop(openTimer);
                pending = null;
                arrive();
                return;
            }
            openTimer = stop(openTimer);
            pending = id;
            openTimer = setTimeout(() => {
                openTimer = null;
                pending = null;
                arrive();
            }, getTiming().openDelay);
        },
        close(id, immediate) {
            if (pending === id) {
                openTimer = stop(openTimer);
                pending = null;
            }
            if (active !== id) return;
            closeTimer = stop(closeTimer);
            const finish = () => {
                closeTimer = null;
                setActive(null);
                cool();
            };
            if (immediate || getTiming().closeDelay <= 0) {
                finish();
                return;
            }
            closeTimer = setTimeout(finish, getTiming().closeDelay);
        },
        dismiss(id) {
            blocked = id;
            openTimer = stop(openTimer);
            closeTimer = stop(closeTimer);
            coolTimer = stop(coolTimer);
            pending = null;
            const wasWarm = warm;
            warm = false;
            if (active === id) setActive(null);
            else if (wasWarm) notify();
        },
        unblock(id) {
            if (blocked === id) blocked = null;
        },
        reset() {
            openTimer = stop(openTimer);
            closeTimer = stop(closeTimer);
            coolTimer = stop(coolTimer);
            pending = null;
            blocked = null;
            lastX = null;
            travel = 0;
            const wasWarm = warm;
            warm = false;
            if (active !== null) setActive(null);
            else if (wasWarm) notify();
        },
        dispose() {
            openTimer = stop(openTimer);
            closeTimer = stop(closeTimer);
            coolTimer = stop(coolTimer);
            listeners.clear();
        },
    };
}

const TooltipGroupContext = createContext<TooltipStore | null>(null);

function useDismissOnBlur(store: TooltipStore, enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;
        const bail = () => store.reset();
        const onVisibility = () => {
            if (document.hidden) store.reset();
        };
        window.addEventListener("blur", bail);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("blur", bail);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [store, enabled]);
}

export type TooltipGroupProps = {
    children: React.ReactNode;
    openDelay?: number;
    closeDelay?: number;
    skipDelay?: number;
    onWarmChange?: (warm: boolean) => void;
    className?: string;
};

export function TooltipGroup({
    children,
    openDelay = 200,
    closeDelay = 120,
    skipDelay = 400,
    onWarmChange,
    className = "",
}: TooltipGroupProps) {
    const timing = useRef<TooltipTiming>({ openDelay, closeDelay, skipDelay });
    timing.current = { openDelay, closeDelay, skipDelay };

    const held = useRef<TooltipStore | null>(null);
    if (held.current === null) {
        held.current = createTooltipStore(() => timing.current);
    }
    const store = held.current;

    const warm = useSyncExternalStore(store.subscribe, store.getWarm, () => false);

    const report = useRef(onWarmChange);
    report.current = onWarmChange;

    useEffect(() => {
        report.current?.(warm);
    }, [warm]);

    useEffect(() => () => store.dispose(), [store]);
    useDismissOnBlur(store, true);

    return (
        <TooltipGroupContext.Provider value={store}>
            {className ? <div className={className}>{children}</div> : children}
        </TooltipGroupContext.Provider>
    );
}

export type UseTooltipOptions = {
    disabled?: boolean;
    openDelay?: number;
    closeDelay?: number;
    skipDelay?: number;
};

export type TooltipTriggerProps = {
    onPointerEnter: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerLeave: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
    onFocus: (event: React.FocusEvent<HTMLElement>) => void;
    onBlur: (event: React.FocusEvent<HTMLElement>) => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
};

export type UseTooltipReturn = {
    open: boolean;
    warm: boolean;
    skipped: boolean;
    travel: number;
    tooltipId: string;
    seat: string;
    triggerProps: TooltipTriggerProps;
};

function isKeyboardFocus(el: HTMLElement) {
    try {
        return el.matches(":focus-visible");
    } catch {
        return true;
    }
}

export function useTooltip({
    disabled = false,
    openDelay = 200,
    closeDelay = 120,
    skipDelay = 400,
}: UseTooltipOptions = {}): UseTooltipReturn {
    const tooltipId = `tt-${useId()}`;
    const group = useContext(TooltipGroupContext);

    const timing = useRef<TooltipTiming>({ openDelay, closeDelay, skipDelay });
    timing.current = { openDelay, closeDelay, skipDelay };

    const solo = useRef<TooltipStore | null>(null);
    if (group === null && solo.current === null) {
        solo.current = createTooltipStore(() => timing.current);
    }
    const store = group ?? (solo.current as TooltipStore);

    useEffect(() => {
        const own = solo.current;
        return () => {
            store.close(tooltipId, true);
            own?.dispose();
        };
    }, [store, tooltipId]);
    useDismissOnBlur(store, group === null);

    const open = useSyncExternalStore(
        store.subscribe,
        () => store.getActive() === tooltipId,
        () => false,
    );
    const warm = useSyncExternalStore(store.subscribe, store.getWarm, () => false);
    const skipped = useSyncExternalStore(store.subscribe, store.getSkipped, () => false);
    const travel = useSyncExternalStore(store.subscribe, store.getTravel, () => 0);

    useEffect(() => {
        if (!disabled) return;
        store.close(tooltipId, true);
    }, [disabled, store, tooltipId]);

    const triggerProps: TooltipTriggerProps = {
        onPointerEnter: (event) => {
            if (!disabled) store.open(tooltipId, false, event.clientX);
        },
        onPointerLeave: () => {
            store.unblock(tooltipId);
            store.close(tooltipId, false);
        },
        onPointerDown: () => store.dismiss(tooltipId),
        onPointerCancel: () => {
            store.unblock(tooltipId);
            store.close(tooltipId, true);
        },
        onFocus: (event) => {
            if (disabled) return;
            if (!isKeyboardFocus(event.currentTarget)) return;
            store.open(tooltipId, true);
        },
        onBlur: () => {
            store.unblock(tooltipId);
            store.close(tooltipId, true);
        },
        onKeyDown: (event) => {
            if (event.key === "Escape") store.dismiss(tooltipId);
        },
    };

    return { open, warm, skipped, travel, tooltipId, seat: store.seat, triggerProps };
}

type TriggerChild = React.ReactElement<
    React.HTMLAttributes<HTMLElement> & { "aria-describedby"?: string }
>;

/**
 * `theme` follows the light/dark tokens and is right for any surface that sits
 * on the page background. `dark` is for a surface that PAINTS ITS OWN dark
 * background — the video player's chrome sits on the video and is dark in both
 * themes, while `--popover`/`--popover-foreground` invert, so the theme tone
 * would render it white-on-white for anyone on Light. Fixed values only there;
 * see CLAUDE.md and LoadMore, which carries the same prop for the same reason.
 */
export type TooltipTone = "theme" | "dark";

const SURFACE: Record<TooltipTone, string> = {
    // No drop shadow, per docs/design-principles.md — an inner hairline and a
    // top inset highlight carry the lift instead.
    theme: "border-border bg-popover shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
    dark: "border-white/10 bg-[#1D1D1A] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
};

const INK: Record<TooltipTone, string> = {
    theme: "text-popover-foreground",
    dark: "text-white",
};

export type TooltipProps = UseTooltipOptions & {
    label: React.ReactNode;
    children: TriggerChild;
    side?: "top" | "bottom";
    /**
     * Gap in px between the trigger's edge and the tooltip. Upstream hardcodes
     * 7; the player passes enough to clear the scrubber it sits under.
     */
    offset?: number;
    tone?: TooltipTone;
    className?: string;
    contentClassName?: string;
};

function chain<E>(theirs: ((event: E) => void) | undefined, ours: (event: E) => void) {
    return (event: E) => {
        theirs?.(event);
        ours(event);
    };
}

export function Tooltip({
    label,
    children,
    side = "top",
    offset = DEFAULT_OFFSET,
    tone = "theme",
    disabled = false,
    openDelay,
    closeDelay,
    skipDelay,
    className = "",
    contentClassName = "",
}: TooltipProps) {
    const { open, skipped, travel, tooltipId, seat, triggerProps } = useTooltip({
        disabled,
        openDelay,
        closeDelay,
        skipDelay,
    });
    const reduced = useReducedMotion();

    const described = [children.props["aria-describedby"], open ? tooltipId : null]
        .filter(Boolean)
        .join(" ");

    const trigger = cloneElement(children, {
        "aria-describedby": described.length > 0 ? described : undefined,
        onPointerEnter: chain(children.props.onPointerEnter, triggerProps.onPointerEnter),
        onPointerLeave: chain(children.props.onPointerLeave, triggerProps.onPointerLeave),
        onPointerDown: chain(children.props.onPointerDown, triggerProps.onPointerDown),
        onPointerCancel: chain(children.props.onPointerCancel, triggerProps.onPointerCancel),
        onFocus: chain(children.props.onFocus, triggerProps.onFocus),
        onBlur: chain(children.props.onBlur, triggerProps.onBlur),
        onKeyDown: chain(children.props.onKeyDown, triggerProps.onKeyDown),
    });

    const lift = side === "top" ? LIFT : -LIFT;

    return (
        <span className={cn("relative inline-flex", className)}>
            {trigger}

            <span
                aria-hidden={!open}
                className="pointer-events-none absolute left-1/2 z-50 flex w-0 justify-center"
                style={
                    side === "top"
                        ? { bottom: `calc(100% + ${offset}px)` }
                        : { top: `calc(100% + ${offset}px)` }
                }
            >
                <AnimatePresence>
                    {open && (
                        <motion.span
                            role="tooltip"
                            id={tooltipId}
                            layoutId={reduced ? undefined : seat}
                            initial={
                                reduced
                                    ? false
                                    : skipped
                                        ? { opacity: 0, scale: 1, y: 0, filter: "blur(0px)" }
                                        : { opacity: 0, scale: 0.9, y: lift, filter: "blur(4px)" }
                            }
                            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
                            exit={
                                reduced
                                    ? { opacity: 0, transition: { duration: 0 } }
                                    : {
                                        opacity: 0,
                                        scale: 0.96,
                                        y: lift * 0.35,
                                        filter: "blur(2px)",
                                        transition: { duration: 0.12, ease: LEAVE },
                                    }
                            }
                            transition={
                                reduced ? { duration: 0 } : { ...(skipped ? WARM : RISE), layout: GLIDE }
                            }
                            style={{ transformOrigin: side === "top" ? "50% 100%" : "50% 0%" }}
                            className={cn(
                                "relative w-max max-w-[220px] shrink-0 overflow-hidden rounded-[10px] px-2 py-1 text-xs font-medium leading-snug",
                                INK[tone],
                                contentClassName,
                            )}
                        >
                            <motion.span
                                aria-hidden
                                layout={!reduced}
                                transition={reduced ? { duration: 0 } : GLIDE}
                                className={cn("absolute inset-0 rounded-[10px] border", SURFACE[tone])}
                            />
                            <motion.span
                                layout={reduced ? false : "position"}
                                initial={
                                    reduced
                                        ? false
                                        : skipped
                                            ? { opacity: 0, x: travel * 14, y: 0 }
                                            : { opacity: 0, x: 0, y: 9 }
                                }
                                animate={{ opacity: 1, x: 0, y: 0 }}
                                transition={reduced ? { duration: 0 } : SWAP}
                                className="relative block whitespace-nowrap"
                            >
                                {label}
                            </motion.span>
                        </motion.span>
                    )}
                </AnimatePresence>
            </span>
        </span>
    );
}
