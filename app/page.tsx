import Link from "next/link";

import { SiteHeader } from "@/components/marketing/site-header";
import { Highlighter } from "@/components/ui/highlighter"
import { TextAnimate } from "@/components/ui/text-animate"

// Landing page — to be designed separately. Intentionally minimal for now.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-soft-pink text-black">
      <SiteHeader />

      {/* Hero — replace with your skateboarder composition. */}
      <main className="relative flex flex-1 flex-col items-center px-4 pt-8 sm:pt-12">
       <h1 className="text-center antialiased tracking-tighter font-pixel text-3xl text-black sm:text-[55px] lg:text-[55px]">
          <TextAnimate as="span" by="word" animation="fadeIn" once>
            {"Magic internet money meets "}
          </TextAnimate>
          <Highlighter action="highlight" color="#000000">
            <TextAnimate
              as="span"
              by="character"
              animation="fadeIn"
              once
              className="text-white"
            >
              Streaming
            </TextAnimate>
          </Highlighter>
        </h1>

        {/* Subtext — centered under the headline on mobile/tablet, pinned
            left-middle on desktop (like the image). Regular font, not pixel. */}
        <TextAnimate
          as="p"
          by="line"
          animation="slideRight"
          once
          className="mt-6 max-w-lg text-center text-lg font-semibold leading-snug tracking-tight text-black sm:mt-8 sm:text-2xl lg:absolute lg:left-32 lg:top-1/2 lg:mt-0 lg:max-w-xl lg:-translate-y-1/2 lg:text-left"
        >
          {"Crypto Twitter's new home.\nSame algorithm."}
        </TextAnimate>
        


      </main>
    </div>
  );
}
