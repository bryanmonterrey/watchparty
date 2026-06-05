import React from "react"

export function TokenNotifiedBanner() {
    return (
        <div className="bg-black rounded-3xl border border-flexborder p-4 flex flex-col gap-1 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>
            <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-zinc-200 flex items-center gap-2">
                    Get notified
                </span>
                <span className="text-base font-semibold text-twitter2 cursor-pointer hover:text-twitter2 transition-colors">Find out more</span>
            </div>
            <p className="text-base text-zinc-500">Get mobile app for coin notifications</p>
        </div>
    )
}
