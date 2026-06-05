"use client";

export function ProfileStats() {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-10 bg-zinc-900/30 backdrop-blur-2xl border border-white/5 rounded-[32px] p-8 px-10 self-start shadow-2xl relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
            
            <div className="flex flex-col gap-1 relative z-10">
                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">USD Value</span>
                <span className="text-2xl font-black text-white tabular-nums">$12,450</span>
            </div>
            <div className="flex flex-col gap-1 relative z-10">
                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Holdings</span>
                <span className="text-2xl font-black text-white tabular-nums">42 Assets</span>
            </div>
            <div className="flex flex-col gap-1 relative z-10">
                <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-black">Rank</span>
                <span className="text-2xl font-black text-indigo-400 tabular-nums">#124</span>
            </div>
        </div>
    );
}
