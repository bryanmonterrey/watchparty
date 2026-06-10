"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

type BlurInImageProps = Omit<
  React.ImgHTMLAttributes<HTMLImageElement>,
  "src" | "alt"
> & {
  src: string;
  alt: string;
  /** Slide-up distance (px) for the entrance, on top of the blur+fade. */
  fromY?: number;
};

/**
 * A plain <img> that GSAP blur+fades in once it actually finishes loading.
 * (Firing the animation on mount runs it before the image bytes arrive, so the
 * blur is over before there's anything to see.) Triggered on `onLoad`, plus a
 * `complete` check for already-cached images where `onLoad` may not fire.
 */
export function BlurInImage({
  src,
  alt,
  className,
  fromY = 0,
  style,
  ...imgProps
}: BlurInImageProps) {
  const ref = useRef<HTMLImageElement>(null);
  const played = useRef(false);

  const reveal = () => {
    const el = ref.current;
    if (played.current || !el) return;
    played.current = true;
    gsap.fromTo(
      el,
      { opacity: 0, filter: "blur(20px)", y: fromY },
      { opacity: 1, filter: "blur(0px)", y: 0, duration: 0.7, ease: "power2.out" },
    );
  };

  useEffect(() => {
    if (ref.current?.complete) reveal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt={alt}
      className={className}
      style={{ opacity: 0, ...style }}
      onLoad={reveal}
      {...imgProps}
    />
  );
}
