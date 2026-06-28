import { Metadata } from "next";

export const metadata: Metadata = { title: "Explore" };

export default function ExplorePage() {
    return (
        <section
            className="relative flex min-h-[70svh] items-center overflow-hidden px-6 py-24 sm:py-32"
            style={{
                background:
                    "radial-gradient(120% 90% at 50% 100%, var(--color-soft-blue) 0%, var(--color-soft-pink) 38%, #ffffff 100%)",
            }}
        >
            <div className="mx-auto w-full max-w-5xl">
                <h1 className="font-pixel text-4xl tracking-tighter text-black sm:text-6xl">
                    Watch what&apos;s happening
                </h1>
                <p className="mt-5 max-w-xl text-lg font-semibold leading-snug text-black/70 sm:text-2xl">
                    Live streams, shorts, and the timeline you already know, ranked by the same open
                    algorithm. The whole show, in one place.
                </p>
            </div>
        </section>
    );
}
