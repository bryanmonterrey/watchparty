"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import {
  BlackSquareStarIcon,
  WatchpartyWordmark,
} from "@/components/icons";
import { Squircle } from "@/components/ui/squircle";
import { MorphMenuIcon } from "@/components/marketing/morph-menu-icon";


// ── EDIT ME: the menu links ──────────────────────────────────────────────
const NAV_LINKS = [
  { label: "Explore", href: "#explore" },
  { label: "Creators", href: "#creators" },
  { label: "Pricing", href: "#pricing" },
  { label: "About", href: "#about" },
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
    <header className="sticky top-4 z-50">
      {/* Bar is transparent over the hero. To frost it on scroll, add e.g.
          `bg-soft-pink/70 backdrop-blur-md` to this div. */}
      <div className="relative z-10 mx-auto flex h-16 w-full max-w-8xl items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-8">
        {/* Logo lockup — links home. Badge keeps its fixed colors; wordmark
            inherits text color, so recolor via text-* if you ever need to. */}
        <Link
          href="/"
          aria-label="watchparty home"
          className="flex items-center gap-2 sm:gap-3"
        >
          <BlackSquareStarIcon className="size-11 sm:size-11" />
          <WatchpartyWordmark className="h-5 w-auto text-black sm:h-5" />
        </Link>

        {/* Right-side actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Primary CTA — pills stay rounded-full (no Squircle). */}
          <Link
            href="/login"
            className="rounded-full bg-black tracking-tight px-5 py-3.5 text-lg font-semibold text-white transition-colors hover:bg-black/90 sm:px-12 sm:h-[55px]"
          >
            Log in
          </Link>

          {/* Menu toggle — squircle to echo the badge shape. */}

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="site-menu"
            className="grid sm:h-[55px] sm:w-[55px] rounded-full place-items-center bg-black text-white transition-colors hover:bg-black/90"
          >
            <MorphMenuIcon open={open} className="size-6" />   
          </button>

        </div>
      </div>

      {/* Dropdown menu. Two keyed siblings so AnimatePresence can exit both. */}
      <AnimatePresence>
        {open && (
          <motion.button
            key="menu-backdrop"
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-0 cursor-default bg-black/5"
          />
        )}
        {open && (
          <motion.nav
            key="menu-panel"
            id="site-menu"
            aria-label="Main"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-x-4 top-full z-10 sm:inset-x-6 lg:inset-x-8"
          >
            {/* drop-shadow lives on the wrapper because clip-path (Squircle)
                clips a normal box-shadow. */}
            <div className="ml-auto mt-2 w-full max-w-sm drop-shadow-[0_14px_30px_rgba(0,0,0,0.14)]">
              <Squircle radius={22} className="bg-white p-2">
                <ul className="flex flex-col">
                  {NAV_LINKS.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="block rounded-xl px-4 py-3 text-base font-medium text-black transition-colors hover:bg-black/5"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Squircle>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
