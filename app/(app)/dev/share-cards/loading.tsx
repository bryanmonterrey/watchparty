// Instant shell so navigating in never holds the old page (memory
// nav-freeze-architecture): every (app) page needs a loading boundary.
export default function ShareCardsLoading() {
    return (
        <div className="mx-auto w-full max-w-[1100px] px-4 py-8 sm:px-6">
            <div className="h-9 w-48 rounded-full bg-white/[0.06]" />
            <div className="mt-2 h-4 w-96 max-w-full rounded-full bg-white/[0.04]" />
            <div className="mt-8 h-64 rounded-3xl border border-border bg-white/[0.02]" />
        </div>
    );
}
