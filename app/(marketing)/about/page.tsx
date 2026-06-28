import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
    return (
        <section
            className="relative flex min-h-[70svh] items-center overflow-hidden px-6 py-24 sm:py-32"
            style={{
                background:
                    "radial-gradient(110% 90% at 50% 0%, var(--color-pastel-yellow) 0%, var(--color-soft-pink) 45%, #ffffff 100%)",
            }}
        >
            <div className="mx-auto w-full max-w-3xl text-center">
                <h1 className="font-pixel text-4xl tracking-tighter text-black sm:text-6xl">
                    Crypto Twitter, leveled up
                </h1>
                <p className="mt-5 text-lg font-semibold leading-snug text-black/70 sm:text-2xl">
                    watchparty is where the timeline, the stream, and the trade finally live together.
                    The same algorithm you love, now with a stage and a wallet.
                </p>
                <Link
                    href="/login"
                    className="mt-8 inline-block rounded-full bg-black px-8 py-4 text-base font-bold text-white transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                >
                    Get started
                </Link>
            </div>
        </section>
    );
}
