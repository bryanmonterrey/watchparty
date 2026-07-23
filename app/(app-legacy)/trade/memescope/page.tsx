import { Metadata } from "next";
import { MemescopeView } from "@/components/trade/trade-view";

// The live three-column bonding board (New/Migrating/Migrated) — reached via
// the header's Trade dropdown; /trade itself is the Discover landing.
export const metadata: Metadata = {
    title: "Memescope",
};

export default function MemescopePage() {
    return (
        <div className="h-full">
            <MemescopeView />
        </div>
    );
}
