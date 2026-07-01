import Link from "next/link";
import { redirect } from "next/navigation";

import { getServerSession } from "@/lib/auth/get-session";
import { SiteHeader } from "@/components/marketing/site-header";
import { Highlighter } from "@/components/ui/highlighter"
import { TextAnimate } from "@/components/ui/text-animate"
import { BlurInImage } from "@/components/marketing/blur-in-image"
import { GogglesZoom } from "@/components/marketing/goggles-zoom"
import { SkaterStack } from "@/components/marketing/skater-stack"
import { MarketingFooter } from "@/components/marketing/footer"

// Reads the session cookie to bounce signed-in visitors straight to the app,
// so this route renders per request (no static prerender of the landing page).
export const dynamic = "force-dynamic";

// Landing page — to be designed separately. Intentionally minimal for now.
export default async function Home() {
  // Already signed in? Skip the marketing page and go to the app.
  const session = await getServerSession();
  if (session) redirect("/home");

  // min-h-svh + content-driven height (NOT flex-1: a basis-0 flex child
  // contributes nothing to document height, which swallows the pin-spacer
  // scroll distance ScrollTrigger adds for the goggles zoom).
  return (
    <div className="relative flex min-h-svh flex-col bg-soft-blue text-black">
      <SiteHeader />

      {/* Hero — replace with your skateboarder composition. */}
      <main
        data-goggles-pin
        className="relative flex h-svh flex-col items-center overflow-hidden px-4 pt-28 sm:pt-28"
      >
        {/* Skater + rainbow, as stacked per-part layers: fills the hero
            height, centered. The wide rainbow bleeds off-screen and is
            clipped by main's overflow-hidden, so no horizontal scrollbar. */}
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
          <SkaterStack />
        </div>

       {/* data-goggles-fade value = upward parallax rate on exit (fraction
           of viewport height); staggered rates create the depth.
           data-goggles-fade-blur adds a progressive blur-out (max px). */}
       <h1
          data-goggles-fade="0.5"
          data-goggles-fade-blur="12"
          className="relative z-10 text-center antialiased tracking-tighter font-pixel text-3xl text-black sm:text-[55px] lg:text-[55px]"
        >
          <TextAnimate as="span" by="word" animation="blurInUp" once>
            {"Magic internet money meets "}
          </TextAnimate>
          <Highlighter action="highlight" color="#000000">
            <TextAnimate
              as="span"
              by="character"
              animation="blurInUp"
              once
              className="text-white"
            >
              Streaming
            </TextAnimate>
          </Highlighter>
        </h1>

        {/* Subtext — centered under the headline on mobile/tablet, pinned
            left-middle on desktop (like the image). Regular font, not pixel. */}
        {/* Rate 0: fade-only exit — parallax y would fight the
            lg:-translate-y-1/2 centering. */}
        <TextAnimate
          data-goggles-fade="0"
          as="p"
          by="line"
          animation="slideRight"
          once
          className="relative hidden lg:block z-10 mt-6 max-w-lg text-center text-lg font-semibold leading-snug tracking-tight text-black sm:mt-8 sm:text-2xl lg:absolute lg:left-32 lg:top-1/2 lg:mt-0 lg:max-w-xl lg:-translate-y-1/2 lg:text-left"
        >
          {"Crypto Twitter's new home.\nSame algorithm ♥️"}
        </TextAnimate>

        {/* Communities phone mockup — pinned bottom-right, bleeding off the
            bottom edge (clipped by main's overflow-hidden). Desktop/tablet
            only; the hero is already full on mobile. */}
        {/* Rate 0: fade-only exit — a parallax y here would stomp the
            translate-y-[45%] placement. */}
        <div
          data-goggles-fade="0"
          className="pointer-events-none absolute bottom-0 right-4 z-10 hidden translate-y-[45%] sm:block sm:right-6 lg:right-12"
        >
          <BlurInImage
            src="/communitydesign.png"
            alt="Communities screen of the watchparty mobile app"
            fromY={64}
            className="w-64 lg:w-80 xl:w-[360px]"
          />
        </div>

        {/* Deep-zoom headline — revealed word-by-word inside the goggles,
            white over the black that opens up through the lens. Placeholder
            copy; swap freely. */}
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-6">
          <p
            data-goggles-reveal
            className="max-w-3xl text-center font-pixel text-3xl tracking-tighter text-white opacity-0 sm:text-[55px]"
          >
            Stream it. Post it. Trade it.
          </p>
        </div>

        <GogglesZoom />
      </main>

      {/* Third canvas — slides up OVER the pinned in-goggles scene during
          the last viewport of the pin (cash-app cover): GogglesZoom pulls it
          up by -100svh at init so it overlaps the pin's final stretch (the
          margin can't live in CSS — before hydration there's no pin spacer,
          so it would sit on top of the hero and flash blue on load), and
          z-30 paints it above everything inside the hero. */}
      <section
        data-canvas-next
        className="relative z-30 flex h-svh items-center justify-center overflow-hidden bg-soft-blue"
      >
        <div data-canvas-next-content className="flex flex-col items-center gap-6 px-6 text-center">
          <h2 className="font-pixel text-3xl tracking-tighter text-black sm:text-5xl lg:text-6xl">
            All your internet,<br />one feed.
          </h2>
          <p className="max-w-md text-base font-semibold leading-snug text-black/70 sm:text-lg">
            Go live, post your takes, launch a coin, and grow a community, all without leaving the timeline.
          </p>
          <Link
            href="/login"
            className="rounded-full bg-black px-8 py-4 text-base font-bold text-white transition-transform duration-200 hover:scale-[1.03] active:scale-95"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* Explore / Creators / About are real routes now (app/(marketing)/*),
          reached from the SiteHeader + footer — not in-page anchors. */}

      <MarketingFooter />
    </div>
  );
}
