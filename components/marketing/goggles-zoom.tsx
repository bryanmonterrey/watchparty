"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Observer } from "gsap/Observer";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";

/**
 * Scroll-driven hero zoom (the codegrid "larevoltosa" effect): pins the hero
 * for 3 viewport-heights while scroll scrubs a zoom into the skater's goggles.
 *
 * Phases (by scroll progress), mirroring the reference timing:
 *   0.00–0.20  hero copy + phone mockup fade away
 *   0.00–0.75  glare bands sweep across the lens
 *   0.00–1.00  front-loaded zoom: FINAL_SCALE by p=0.5 (inside the lens),
 *              still pushing to ~2× that by the end
 *   0.50–0.80  black canvas fades in *through* the lens alpha mask — the
 *              goggles open into the next scene
 *   0.65–0.85  headline reveals word-by-word, hard on/off steps
 *
 * The pin then holds one extra viewport for the Cash-App-style cover
 * (see public/parallazcasestudy.txt): the black in-goggles scene stays
 * frozen while canvas 3 — overlapping the pin via -100svh top margin —
 * slides up over it at scroll speed; the headline recedes at half speed
 * and fades, and the incoming content rises slower than its section.
 *
 * Navigation is gesture-based, not free-scroll (also per cash.app): GSAP
 * Observer captures wheel/touch, and a single gesture tweens the scroll
 * position to the next/previous canvas — the pinned scrub plays the dive
 * or cover as the transition. Input is ignored while a tween runs, so one
 * flick = one canvas, both directions. ScrollTrigger snap remains as a
 * backup for scrollbar drags.
 *
 * Renders nothing — drives elements via data attributes:
 * [data-goggles-pin] the pinned section, [data-goggles-img] the art,
 * [data-goggles-fade] hero copy, [data-goggles-glare] the glare bands,
 * [data-goggles-lens-reveal] the in-lens black layer,
 * [data-goggles-reveal] the headline (split into word spans at init),
 * [data-canvas-next-content] the next canvas's inner content.
 */

// The lens is a shield-goggle shape: the bottom edge curves up mid-lens for
// the nose notch (glass bottom rises to y≈40.2% at x=49%, vs 42.7% at the
// lower lobes). So the zoom aims at the center of the *upper glass band*,
// not the alpha-bbox center, and the scale must fit the viewport inside
// that ~4.3%-tall column: ≥23.3×. Reached at p=0.5 (reference curve:
// scale = 1 + p·2·(FINAL−1)), pushing ~2× deeper by the end.
const FINAL_SCALE = 28;
// Upper-glass-band center at the zoom column, as fractions of the art
// canvas — measured from the alpha channel of public/skater/lens.png
// (glass at x=49% spans y 35.9–40.2%).
const ORIGIN_X = 0.49;
const ORIGIN_Y = 0.382;
// How far the glare bands travel, as a fraction of the art canvas width —
// enough for both bands to cross the lens (x 46.4–51.5%) and fully exit
// right. Must be canvas-relative, not band-relative (xPercent), or the
// thinner band travels less and parks inside the lens at deep zoom.
const GLARE_SWEEP = 0.09;

// ── Cover-transition parallax intensity (turn these up/down to taste) ──
// The cover is staggered: the in-goggles headline plays its parallax exit
// over the first REVEAL_EXIT_PORTION of the window (rise + blur + fade),
// and only then does canvas 3 slide over the scene.
const REVEAL_EXIT_PORTION = 0.35;
// How far the outgoing headline recedes during its exit phase, as a
// fraction of the viewport height.
const COVER_RECEDE = 0.6;
// Max blur (px) on the outgoing headline at full exit.
const REVEAL_EXIT_BLUR = 12;
// Fade-out rate of the outgoing headline (the cash.app curve).
const COVER_FADE = 1.8;
// How far the incoming canvas's content trails below its section while it
// rises, as a fraction of the viewport height. Bigger = more parallax.
const COVER_RISE = 0.45;

// Split the headline into word spans for the stepped reveal (the reference
// uses SplitText; words flipping 0→1 with no tween is the whole look).
function splitWords(el: HTMLElement): HTMLElement[] {
  const text = el.textContent?.trim() ?? "";
  el.setAttribute("aria-label", text);
  el.textContent = "";
  return text.split(/\s+/).map((word) => {
    const span = document.createElement("span");
    span.textContent = word;
    span.setAttribute("aria-hidden", "true");
    span.className = "inline-block";
    span.style.opacity = "0";
    el.appendChild(span);
    el.appendChild(document.createTextNode(" "));
    return span;
  });
}

export function GogglesZoom() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const stage = document.querySelector<HTMLElement>("[data-goggles-pin]");
    const art = document.querySelector<HTMLElement>("[data-goggles-img]");
    if (!stage || !art) return;

    gsap.registerPlugin(ScrollTrigger, Observer, ScrollToPlugin);

    // Navigation is gesture-based, so the scrollbar is just noise — hide it
    // while the landing effect is mounted (utility from globals.css).
    document.documentElement.classList.add("hidden-scrollbar");

    const fades = gsap.utils.toArray<HTMLElement>("[data-goggles-fade]");
    const glares = gsap.utils.toArray<HTMLElement>("[data-goggles-glare]");
    const lensReveal = document.querySelector<HTMLElement>(
      "[data-goggles-lens-reveal]",
    );
    const reveal = document.querySelector<HTMLElement>("[data-goggles-reveal]");
    const words = reveal ? splitWords(reveal) : [];
    // The container starts opacity-0 in CSS (no flash before hydration);
    // from here on the individual words carry the visibility.
    if (reveal) gsap.set(reveal, { opacity: 1 });

    gsap.set(art, {
      transformOrigin: `${ORIGIN_X * 100}% ${ORIGIN_Y * 100}%`,
    });

    // A transform-origin zoom keeps the lens pinned at its *resting* screen
    // position, which sits above/left of viewport center — so on its own the
    // zoom flies past the goggles instead of into them. Measure the offset
    // and drift the art so the lens center lands exactly mid-viewport by the
    // time we're inside (p=0.5). The art is flex-centered in the pinned
    // viewport-size hero, and offsetWidth/Height ignore transforms, so this
    // stays correct.
    let driftX = 0;
    let driftY = 0;
    const measure = () => {
      const w = art.offsetWidth;
      const h = art.offsetHeight;
      driftX =
        window.innerWidth / 2 - ((window.innerWidth - w) / 2 + ORIGIN_X * w);
      driftY =
        window.innerHeight / 2 - ((window.innerHeight - h) / 2 + ORIGIN_Y * h);
    };
    measure();

    // Gesture navigation state — declared before the trigger so its
    // onUpdate can sync `current` for scrollbar/snap movements.
    // Resting scroll positions: hero (0), in-goggles scene (3vh, p=0.75),
    // canvas 3 docked (4vh, p=1 — also the end of the document).
    const stops = () => [0, window.innerHeight * 3, window.innerHeight * 4];
    let current = 0;
    let animating = false;

    const next = document.querySelector<HTMLElement>("[data-canvas-next]");
    const nextContent = document.querySelector<HTMLElement>(
      "[data-canvas-next-content]",
    );
    // Overlap canvas 3 with the pin's final viewport. Applied here — before
    // the trigger is created, so the spacer math includes it — instead of in
    // CSS, where it would cover the hero (and flash) before hydration.
    if (next) gsap.set(next, { marginTop: "-100svh" });
    if (nextContent) {
      gsap.set(nextContent, {
        y: window.innerHeight * COVER_RISE,
        opacity: 0,
      });
    }

    const trigger = ScrollTrigger.create({
      trigger: stage,
      start: "top top",
      // 4 viewports: the first 3 scrub the goggles dive (zp), the last one
      // is the Cash-App cover window (cp) — canvas 3 overlaps it via its
      // -100svh top margin and slides over the still-pinned black scene.
      end: () => "+=" + window.innerHeight * 4,
      pin: true,
      // Explicit: ScrollTrigger silently defaults this to false when the
      // pinned element's parent is display:flex, killing the scroll distance.
      pinSpacing: true,
      scrub: true,
      // One scroll gesture per canvas (the cash-app feel): any motion
      // commits to the next resting state in that direction — hero (0),
      // in-goggles scene (0.75), covered by canvas 3 (1) — and the whole
      // transition plays out as one animation.
      snap: {
        snapTo: [0, 0.75, 1],
        directional: true,
        duration: { min: 0.6, max: 1.5 },
        delay: 0.1,
        ease: "power2.inOut",
      },
      onRefresh: measure,
      onUpdate: (self) => {
        // Goggles-dive progress (first 3 viewports) and cover progress
        // (last viewport).
        const zp = Math.min(self.progress / 0.75, 1);
        const cp = gsap.utils.clamp(0, 1, (self.progress - 0.75) / 0.25);

        // Keep the gesture navigation's notion of "current canvas" in sync
        // when the scroll position changes by other means (scrollbar, snap).
        if (!animating) {
          if (self.progress < 0.01) current = 0;
          else if (Math.abs(self.progress - 0.75) < 0.02) current = 1;
          else if (self.progress > 0.99) current = 2;
        }

        // Front-loaded zoom + drift: fully inside the lens at the halfway
        // point, second half of the dive lives within the glass; holds at
        // max depth during the cover.
        const driftP = Math.min(zp * 2, 1);
        gsap.set(art, {
          scale: 1 + zp * 2 * (FINAL_SCALE - 1),
          x: driftP * driftX,
          y: driftP * driftY,
        });

        // White glare bands sweep across the lens over the first 75% of the
        // dive, mirroring the reference's glareProgress. Child transforms
        // resolve in the art's unscaled layout space, so offsetWidth-derived
        // px stay correct at any zoom.
        const glareX = Math.min(zp / 0.75, 1) * GLARE_SWEEP * art.offsetWidth;
        glares.forEach((el) => gsap.set(el, { x: glareX }));

        // Hero copy recedes upward at per-element rates while it fades (the
        // cash.app hero parallax) — the data-goggles-fade value is the rise
        // distance as a fraction of viewport height, so layered elements
        // drift apart for depth. autoAlpha (opacity + visibility) rather
        // than opacity: the subtext is a framer-motion element whose
        // entrance can rewrite inline opacity after us, but framer never
        // touches visibility.
        // Rate 0 = fade only, and crucially no transform write at all: GSAP
        // setting y would stomp an element's own CSS translate placement
        // (e.g. the phone mockup's translate-y-[45%]). Optional
        // data-goggles-fade-blur adds a progressive blur on exit (value =
        // max blur px, default 12).
        const exitP = Math.min(zp / 0.2, 1);
        fades.forEach((el) => {
          const rate = parseFloat(el.dataset.gogglesFade ?? "");
          const r = Number.isNaN(rate) ? 0.35 : rate;
          const vars: gsap.TweenVars = { autoAlpha: 1 - exitP };
          if (r !== 0) vars.y = -exitP * r * window.innerHeight;
          const blurAttr = el.dataset.gogglesFadeBlur;
          if (blurAttr !== undefined) {
            const maxBlur = parseFloat(blurAttr) || 12;
            vars.filter = `blur(${(exitP * maxBlur).toFixed(2)}px)`;
          }
          gsap.set(el, vars);
        });

        // The next scene opens up through the glass: black layer masked by
        // the lens alpha, fully opaque well before the words land.
        if (lensReveal) {
          gsap.set(lensReveal, {
            opacity: gsap.utils.clamp(0, 1, (zp - 0.5) / 0.3),
          });
        }

        // Stepped word-by-word reveal between 0.65 and 0.85 of the dive;
        // snapped fully off/on outside the window.
        if (words.length > 0) {
          if (zp < 0.65) {
            gsap.set(words, { opacity: 0 });
          } else if (zp > 0.85) {
            gsap.set(words, { opacity: 1 });
          } else {
            const textP = (zp - 0.65) / 0.2;
            words.forEach((word, i) => {
              gsap.set(word, { opacity: textP >= i / words.length ? 1 : 0 });
            });
          }
        }

        // Cover window — the Cash App boundary parallax (see
        // public/parallazcasestudy.txt). The hero stays pinned (frozen
        // backdrop) while canvas 3 scrolls over it at full speed; the
        // outgoing headline recedes at half the cover speed and fades
        // (their `opacity: 1 - progress * 1.8`), and the incoming content
        // rises slower than its section, settling as it docks.
        // Staggered: headline exit phase (hp), then the cover phase (ecp).
        const hp = gsap.utils.clamp(0, 1, cp / REVEAL_EXIT_PORTION);
        const ecp = gsap.utils.clamp(
          0,
          1,
          (cp - REVEAL_EXIT_PORTION) / (1 - REVEAL_EXIT_PORTION),
        );
        if (reveal) {
          gsap.set(reveal, {
            y: -hp * window.innerHeight * COVER_RECEDE,
            autoAlpha: Math.max(0, 1 - hp * COVER_FADE),
            filter: `blur(${(hp * REVEAL_EXIT_BLUR).toFixed(2)}px)`,
          });
        }
        // Canvas 3 physically rises with the scroll, so the stagger holds it
        // below the viewport during the headline's exit by countering the
        // scroll-driven rise, releasing over the rest of the window.
        if (next) {
          gsap.set(next, { y: (cp - ecp) * window.innerHeight });
        }
        if (nextContent) {
          gsap.set(nextContent, {
            y: (1 - ecp) * window.innerHeight * COVER_RISE,
            opacity: Math.min(1, ecp * 1.4),
          });
        }
      },
    });

    // One gesture = one canvas. Observer captures wheel/touch (preventing
    // native scroll) and tweens the scroll position to the next stop; the
    // scrubbed pin plays the dive/cover as the tween passes through it.
    // wheelSpeed -1 unifies wheel and touch directions, per the canonical
    // GSAP Observer sections demo: onUp = advance, onDown = go back.
    const goto = (index: number) => {
      const target = gsap.utils.clamp(0, stops().length - 1, index);
      if (target === current || animating) return;
      animating = true;
      current = target;
      const y = stops()[target];
      gsap.to(window, {
        scrollTo: { y, autoKill: false },
        duration: gsap.utils.clamp(
          0.8,
          1.6,
          Math.abs(y - window.scrollY) / 2000,
        ),
        ease: "power2.inOut",
        // Small cooldown so trailing trackpad inertia doesn't immediately
        // trigger the next canvas.
        onComplete: () => {
          gsap.delayedCall(0.3, () => (animating = false));
        },
      });
    };

    const observer = Observer.create({
      type: "wheel,touch",
      wheelSpeed: -1,
      tolerance: 10,
      preventDefault: true,
      onUp: () => goto(current + 1),
      onDown: () => goto(current - 1),
    });

    return () => {
      observer.kill();
      trigger.kill();
      if (next) gsap.set(next, { clearProps: "marginTop" });
      document.documentElement.classList.remove("hidden-scrollbar");
    };
  }, []);

  return null;
}
