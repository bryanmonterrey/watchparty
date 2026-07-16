import React from "react"

// Teaser for coin notifications — activates when the iOS app ships.
export function TokenNotifiedBanner() {
    return (
        <div className="bg-panel rounded-[25px] p-5 flex flex-col gap-1 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-lantern/5 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
            <span className="text-lg font-bold text-zinc-200">Get notified</span>
            <p className="text-base text-zinc-500">Price and migration alerts arrive with the mobile app</p>
        </div>
    )
}
