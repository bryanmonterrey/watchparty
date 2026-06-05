import React from "react"

export function TokenStatsGrid() {
    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
                { label: "Vol 24h", value: "$32.9K" },
                { label: "Price", value: "$0.00000340" },
                { label: "5m", value: "-74.96%", color: "text-pastelred" },
                { label: "1h", value: "-42.47%", color: "text-pastelred" },
                { label: "6h", value: "-42.47%", color: "text-pastelred" }
            ].map((stat, i) => (
                <div key={i} className="bg-black rounded-3xl border border-flexborder p-4 flex flex-col items-center justify-center">
                    <span className="text-zinc-400 text-base font-medium mb-1">{stat.label}</span>
                    <span className={`text-sm font-semibold tracking-tight ${stat.color || "text-zinc-200"}`}>{stat.value}</span>
                </div>
            ))}
        </div>
    )
}
