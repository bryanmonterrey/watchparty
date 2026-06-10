"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

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

    gsap.registerPlugin(ScrollTrigger);

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

    // Lenis smooth scroll feeding ScrollTrigger, per the reference setup.
    const lenis = new Lenis();
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

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

    const nextContent = document.querySelector<HTMLElement>(
      "[data-canvas-next-content]",
    );
    if (nextContent) gsap.set(nextContent, { y: 120, opacity: 0.3 });

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
      onRefresh: measure,
      onUpdate: (self) => {
        // Goggles-dive progress (first 3 viewports) and cover progress
        // (last viewport).
        const zp = Math.min(self.progress / 0.75, 1);
        const cp = gsap.utils.clamp(0, 1, (self.progress - 0.75) / 0.25);

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

        // autoAlpha (opacity + visibility) rather than opacity: the subtext
        // is a framer-motion element whose entrance can rewrite inline
        // opacity after us, but framer never touches visibility.
        const fade = 1 - Math.min(zp / 0.2, 1);
        fades.forEach((el) => gsap.set(el, { autoAlpha: fade }));

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
        if (reveal) {
          gsap.set(reveal, {
            y: -cp * window.innerHeight * 0.5,
            opacity: Math.max(0, 1 - cp * 1.8),
          });
        }
        if (nextContent) {
          gsap.set(nextContent, {
            y: (1 - cp) * 120,
            opacity: 0.3 + cp * 0.7,
          });
        }
      },
    });

    return () => {
      trigger.kill();
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33); // gsap defaults
      lenis.destroy();
    };
  }, []);

  return null;
}
