import { Metadata } from "next";
import { QuestsView } from "@/components/quests/quests-view";

// Daily/weekly quests — progress accrues from normal activity and XP
// auto-claims on completion (docs/exp-callouts.md, Phase 3).
export const metadata: Metadata = {
    title: "Quests",
};

export default function QuestsPage() {
    return (
        <div className="h-full">
            <QuestsView />
        </div>
    );
}
