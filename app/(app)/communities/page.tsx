import { Metadata } from "next";
import { CommunitiesLanding } from "@/components/community/communities-landing";
import { ProgressiveEntry } from "@/components/app-ui/progressive-entry";
import CommunitiesLoading from "./loading";

export const metadata: Metadata = {
    title: "communities",
};

export default function CommunitiesPage() {
    // First client commit paints the same shell loading.tsx serves (which is
    // itself the landing's own pre-hydration placeholder); the landing enters
    // in a transition — see ProgressiveEntry.
    return (
        <ProgressiveEntry shell={<CommunitiesLoading />}>
            <CommunitiesLanding />
        </ProgressiveEntry>
    );
}
