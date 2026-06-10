"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Layered skater composition (PNGs extracted from the per-part Figma
 * exports). Every layer shares the same 2925×1280 canvas, so they stack
 * pixel-perfect: rainbow trail at the back, character parts above it, lens
 * glass on top — ready for per-part animation later.
 *
 * The glare bands live in a div alpha-masked by the lens layer, so the white
 * sweep only ever shows inside the glass (the reference project clips rects
 * to the lens path; same idea with a raster mask). GogglesZoom slides them
 * horizontally on scroll via [data-goggles-glare].
 *
 * Entrance is the same GSAP blur-in as BlurInImage, fired once every layer
 * has finished loading so the stack never reveals half-assembled.
 */

const LAYERS = [
  { src: "/skater/rainbow.png", z: "z-0" },
  { src: "/skater/body.png", z: "z-10" },
  { src: "/skater/arm.png", z: "z-10" },
  { src: "/skater/skateboard.png", z: "z-10" },
  { src: "/skater/wheels.png", z: "z-10" },
  { src: "/skater/goggles.png", z: "z-10" },
  { src: "/skater/lens.png", z: "z-20" },
];

export function SkaterStack() {
  const ref = useRef<HTMLDivElement>(null);
  const loaded = useRef(new Set<string>());
  const played = useRef(false);

  const markLoaded = (src: string) => {
    loaded.current.add(src);
    if (loaded.current.size < LAYERS.length || played.current || !ref.current)
      return;
    played.current = true;
    gsap.fromTo(
      ref.current,
      { opacity: 0, filter: "blur(20px)" },
      { opacity: 1, filter: "blur(0px)", duration: 0.7, ease: "power2.out" },
    );
  };

  // Cached images may never fire onLoad — sweep up any already-complete ones.
  useEffect(() => {
    ref.current?.querySelectorAll("img").forEach((img) => {
      if (img.complete) markLoaded(img.getAttribute("src") ?? "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      data-goggles-img
      role="img"
      aria-label="Skateboarder riding a rainbow"
      className="relative aspect-[2925/1280] h-screen w-auto shrink-0 sm:h-full"
      style={{ opacity: 0 }}
    >
      {LAYERS.map(({ src, z }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          onLoad={() => markLoaded(src)}
          className={`absolute inset-0 h-full w-full ${z}`}
        />
      ))}

      {/* Glare sweep — only visible through the lens glass via the alpha
          mask. Band geometry hugs the lens bbox (x 46.4–51.5%, y 35.7–42.7%
          of the canvas). */}
      <div
        className="pointer-events-none absolute inset-0 z-30"
        style={{
          maskImage: "url(/skater/lens.png)",
          maskSize: "100% 100%",
          WebkitMaskImage: "url(/skater/lens.png)",
          WebkitMaskSize: "100% 100%",
        }}
      >
        <div
          data-goggles-glare
          className="absolute left-[47.5%] top-[34%] h-[10%] w-[1%] -skew-x-12 bg-white/70"
        />
        <div
          data-goggles-glare
          className="absolute left-[44%] top-[34%] h-[10%] w-[0.6%] -skew-x-12 bg-white/50"
        />
      </div>
    </div>
  );
}
