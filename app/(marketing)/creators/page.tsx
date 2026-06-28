import { Metadata } from "next";

export const metadata: Metadata = { title: "Creators" };

const PILLARS = [
    { title: "Go live", body: "Broadcast in seconds and bring your audience with you.", fill: "var(--color-soft-pink)" },
    { title: "Get paid", body: "Subscriptions and creator payouts, settled in USDC.", fill: "var(--color-soft-blue)" },
    { title: "Launch a coin", body: "Spin up a token for your community in a tap.", fill: "var(--color-pastel-yellow)" },
];

export default function CreatorsPage() {
    return (
        <section className="flex min-h-[70svh] items-center px-6 py-24 sm:py-32">
            <div className="mx-auto w-full max-w-5xl">
                <h1 className="font-pixel text-4xl tracking-tighter text-black sm:text-6xl">
                    Built for creators
                </h1>
                <div className="mt-10 grid gap-6 sm:grid-cols-3">
                    {PILLARS.map((c) => (
                        <div
                            key={c.title}
                            style={{ backgroundColor: c.fill }}
                            className="rounded-[28px] p-7 shadow-[inset_0_2px_0_rgba(255,255,255,0.65),inset_0_-3px_10px_rgba(0,0,0,0.04)] transition-transform duration-200 ease-out hover:-translate-y-1"
                        >
                            <p className="font-pixel text-2xl tracking-tighter text-black">{c.title}</p>
                            <p className="mt-2 text-base font-semibold text-black/70">{c.body}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
