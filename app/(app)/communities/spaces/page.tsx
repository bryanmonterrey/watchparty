import { Metadata } from "next";
import { SpacesView } from "@/components/community/spaces-view";

export const metadata: Metadata = {
    title: "spaces",
};

export default function SpacesPage() {
    return <SpacesView />;
}
