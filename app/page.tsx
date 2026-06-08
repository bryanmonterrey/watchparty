import Link from "next/link";

import { SiteHeader } from "@/components/marketing/site-header";
import { Highlighter } from "@/components/ui/highlighter"
import { TypingAnimation } from "@/components/ui/typing-animation"

// Landing page — to be designed separately. Intentionally minimal for now.
export default function Home() {
  return (
    <div className="flex flex-1 flex-col bg-soft-pink text-black">
      <SiteHeader />

      {/* Hero — replace with your skateboarder composition. */}
      <main className="flex flex-1 flex-col items-center px-4 pt-8 sm:pt-12">
        <h1 className="text-center tracking-tighter font-pixel text-3xl text-black sm:text-[55px] lg:text-[55px]">
          Magic internet money meets{" "}
          <Highlighter action="highlight" color="#000000"><span className="text-white">Streaming</span></Highlighter>
        </h1>


      </main>
    </div>
  );
}
