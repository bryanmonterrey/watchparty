// The search landing's instant stand-in — SearchLanding is dynamic(ssr:false)
// and used to render NOTHING while its chunk loaded, so first visits to
// /search showed a blank page below the input. Mirrors the landing's own
// first frame: real section headers, the live row's square skeletons, and
// blank 2:3 tiles where the (static, instant) category art will land.
export function SearchLandingShell() {
    return (
        <div className="flex flex-col gap-10 pb-12" aria-hidden>
            <section>
                <div className="flex items-baseline justify-between px-5 pb-3 md:px-8">
                    <h2 className="text-[22px] font-extrabold tracking-tight">Live now</h2>
                </div>
                <div className="flex gap-4 px-5 md:px-8">
                    <div className="aspect-square w-44 rounded-xl shimmer-skeleton md:w-52" />
                    <div className="aspect-square w-44 rounded-xl shimmer-skeleton md:w-52" />
                    <div className="hidden aspect-square w-52 rounded-xl shimmer-skeleton md:block" />
                </div>
            </section>
            <section>
                <div className="flex items-baseline justify-between px-5 pb-3 md:px-8">
                    <h2 className="text-[22px] font-extrabold tracking-tight">Browse categories</h2>
                    <span className="text-sm font-semibold text-bleu">See all</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-6 px-5 sm:grid-cols-3 md:grid-cols-4 md:px-8 lg:grid-cols-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div key={i}>
                            <div className="aspect-[2/3] rounded-2xl shimmer-skeleton" />
                            <div className="mt-2 h-4 w-3/4 rounded-full shimmer-skeleton" />
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
