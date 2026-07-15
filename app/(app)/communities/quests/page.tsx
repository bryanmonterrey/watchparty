import { Metadata } from "next";
import { QuestsView } from "@/components/quests/quests-view";

export const metadata: Metadata = {
    title: "Quests",
};

// The same quests panel as /quests, framed inside the communities layout.
export default function CommunityQuestsPage() {
    return (
        <div className="h-full overflow-y-auto hidden-scrollbar">
            <QuestsView />
        </div>
    );
}
