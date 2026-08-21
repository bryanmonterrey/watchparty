// The instant shell for /communities' page slot. It renders INSIDE the
// communities layout (which owns the server rail and home sidebar), so this
// mirrors only the CENTER — and it is byte-for-byte the landing's own
// pre-hydration placeholder (communities-landing.tsx `!mounted` branch), so
// the handoff from shell to mounted page changes nothing on screen.
export default function CommunitiesLoading() {
    return (
        <div className="flex-1 overflow-y-auto hidden-scrollbar p-4 bg-background" aria-hidden>
            <div className="flex flex-col max-w-6xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-white">
                            Communities
                        </h1>
                        <p className="text-zinc-400 mt-1.5 text-lg font-medium">
                            Your servers and community spaces
                        </p>
                    </div>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="aspect-square flex flex-col p-4 gap-2 items-start justify-end rounded-[32px] border border-baseborder/25">
                            <div className="relative h-3.5 w-3/4 bg-soft-gray-10 rounded-xs" />
                            <div className="relative h-3.5 w-2/3 bg-soft-gray-10 rounded-xs" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
