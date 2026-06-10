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

const FINAL_SCALE = 16;
const GOGGLES_ORIGIN = "47.8% 39%"; // goggle center, in % of the art image

export function GogglesZoom() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const stage = document.querySelector<HTMLElement>("[data-goggles-pin]");
    const art = document.querySelector<HTMLElement>("[data-goggles-img]");
    if (!stage || !art) return;

    gsap.registerPlugin(ScrollTrigger);

    const fades = gsap.utils.toArray<HTMLElement>("[data-goggles-fade]");
    const reveal = document.querySelector<HTMLElement>("[data-goggles-reveal]");

    // Lenis smooth scroll feeding ScrollTrigger, per the reference setup.
    const lenis = new Lenis();
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    gsap.set(art, { transformOrigin: GOGGLES_ORIGIN });

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
      onUpdate: (self) => {
        const p = self.progress;

        gsap.set(art, { scale: 1 + p * (FINAL_SCALE - 1) });

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
