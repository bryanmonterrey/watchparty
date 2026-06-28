"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";

import { BlackSquareStarIcon, WatchpartyWordmark } from "@/components/icons";
import { MorphMenuIcon } from "@/components/marketing/morph-menu-icon";

// ── EDIT ME: the menu links ──────────────────────────────────────────────
const NAV_LINKS = [
  { label: "Explore", href: "/explore" },
  { label: "Creators", href: "/creators" },
  { label: "About", href: "/about" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  // Close the menu on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Full-screen black overlay — instant, NO transition. Rendered as a
          sibling of <motion.header> (not a child): the header animates a
          transform, which would make a `fixed` child position relative to the
          header instead of the viewport. z-40 sits under the header chrome
          (z-50), which inverts to stay legible on black. */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black">
          <nav
            id="site-menu"
            aria-label="Main"
            className="flex h-full flex-col items-center justify-center gap-3"
          >
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="px-4 py-1 text-4xl font-semibold tracking-tight text-white transition-colors hover:text-white/60 sm:text-6xl"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <motion.header
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="absolute inset-x-0 top-4 z-50"
      >
        <div className="relative z-10 mx-auto flex h-16 w-full max-w-8xl items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-8">
          {/* Logo lockup — inverts to white-on-black when the menu is open:
              the wordmark recolors (currentColor), the badge flips via `invert`. */}
          <Link
            href="/"
            aria-label="watchparty home"
            className="flex items-center gap-2 sm:gap-3"
          >
            <BlackSquareStarIcon inverted={open} className="size-11 sm:size-11" />
            <WatchpartyWordmark className={`h-5 w-auto transition-colors duration-300 ease-out sm:h-5 ${open ? "text-white" : "text-black"}`} />
          </Link>

          {/* Right-side actions — buttons invert (black ↔ white) with the menu.
              Inversion is instant (no transition-colors) so the black buttons
              never momentarily disappear into the black overlay. */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className={`rounded-full px-5 py-3.5 text-lg font-semibold tracking-tight transition-colors duration-300 ease-out sm:h-[55px] sm:px-12 ${
                open ? "bg-white text-black hover:bg-white/80" : "bg-black text-white hover:bg-black/90"
              }`}
            >
              Log in
            </Link>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
              aria-controls="site-menu"
              className={`grid place-items-center h-[55px] w-[55px] rounded-full transition-colors duration-300 ease-out sm:h-[55px] sm:w-[55px] ${
                open ? "bg-white text-black hover:bg-white/80" : "bg-black text-white hover:bg-black/90"
              }`}
            >
              <MorphMenuIcon open={open} className="size-6" />
            </button>
          </div>
        </div>
      </motion.header>
    </>
  );
}
