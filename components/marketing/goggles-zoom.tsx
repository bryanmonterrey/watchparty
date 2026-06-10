"use client";

import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";

/**
 * Scroll-driven hero zoom (the codegrid "larevoltosa" effect): pins the hero
 * for 3 viewport-heights while scroll scrubs a zoom into the skater's goggles.
 *
 * Phases (by scroll progress):
 *   0.00–0.20  hero copy + phone mockup fade away
 *   0.00–1.00  art scales 1 → FINAL_SCALE, transform-origin on the goggles
 *   0.70–0.95  deep-zoom headline rises in
 *   0.80–1.00  art dissolves (hides bitmap upscaling at max zoom; once the
 *              skater is an SVG this can become the in-lens image reveal)
 *
 * Renders nothing — drives elements in the hero via data attributes:
 * [data-goggles-pin] the pinned section, [data-goggles-img] the art,
 * [data-goggles-fade] hero copy to fade, [data-goggles-reveal] the headline.
 */

// Lens must overfill the viewport at max zoom: the lens is ~7% of the art's
// height, so covering a full viewport-height needs ~14.3×; 20 gives margin.
const FINAL_SCALE = 20;
// Lens center, as fractions of the art canvas — measured from the alpha
// bbox of public/skater/lens.png (x 46.4–51.5%, y 35.7–42.7%).
const ORIGIN_X = 0.49;
const ORIGIN_Y = 0.392;
// How far the glare bands travel, in % of the widest band's width
// (xPercent) — enough for both bands to cross the lens and exit right.
const GLARE_SWEEP = 850;

export function GogglesZoom() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const stage = document.querySelector<HTMLElement>("[data-goggles-pin]");
    const art = document.querySelector<HTMLElement>("[data-goggles-img]");
    if (!stage || !art) return;

    gsap.registerPlugin(ScrollTrigger);

    const fades = gsap.utils.toArray<HTMLElement>("[data-goggles-fade]");
    const reveal = document.querySelector<HTMLElement>("[data-goggles-reveal]");
    const glares = gsap.utils.toArray<HTMLElement>("[data-goggles-glare]");

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
    // and drift the art so the lens center lands exactly mid-viewport at
    // full zoom. The art is flex-centered in the pinned viewport-size hero,
    // and offsetWidth/Height ignore transforms, so this stays correct.
    let driftX = 0;
    let driftY = 0;
    const measure = () => {
      const w = art.offsetWidth;
      const h = art.offsetHeight;
      driftX = window.innerWidth / 2 - ((window.innerWidth - w) / 2 + ORIGIN_X * w);
      driftY = window.innerHeight / 2 - ((window.innerHeight - h) / 2 + ORIGIN_Y * h);
    };
    measure();

    let artFaded = false;

    const trigger = ScrollTrigger.create({
      trigger: stage,
      start: "top top",
      end: () => "+=" + window.innerHeight * 3,
      pin: true,
      // Explicit: ScrollTrigger silently defaults this to false when the
      // pinned element's parent is display:flex, killing the scroll distance.
      pinSpacing: true,
      scrub: true,
      onRefresh: measure,
      onUpdate: (self) => {
        const p = self.progress;

        gsap.set(art, {
          scale: 1 + p * (FINAL_SCALE - 1),
          x: p * driftX,
          y: p * driftY,
        });

        // White glare bands sweep across the lens over the first 75%,
        // mirroring the reference's glareProgress.
        const glareP = Math.min(p / 0.75, 1);
        glares.forEach((el) => gsap.set(el, { xPercent: glareP * GLARE_SWEEP }));

        const fade = 1 - Math.min(p / 0.2, 1);
        fades.forEach((el) => gsap.set(el, { opacity: fade }));

        if (reveal) {
          const t = gsap.utils.clamp(0, 1, (p - 0.7) / 0.25);
          gsap.set(reveal, { opacity: t, y: 48 * (1 - t) });
        }

        if (p >= 0.8) {
          artFaded = true;
          gsap.set(art, { opacity: 1 - (p - 0.8) / 0.2 });
        } else if (artFaded) {
          // Only restore opacity if we faded it, so scrolling back up never
          // stomps the BlurInImage entrance tween at the top of the page.
          artFaded = false;
          gsap.set(art, { opacity: 1 });
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
