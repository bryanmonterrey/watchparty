import { Metadata } from "next";
import { CalloutsView } from "@/components/callouts/callouts-view";

// Community callouts: live feed of calls + the 7-day caller leaderboard —
// reached via the header's Trade dropdown (docs/exp-callouts.md, Phase 2).
export const metadata: Metadata = {
    title: "callouts",
};

export default function CalloutsPage() {
    return (
        <div className="h-full">
            <CalloutsView />
        </div>
    );
}
