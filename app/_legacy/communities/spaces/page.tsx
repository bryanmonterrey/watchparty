import { Metadata } from "next";
import { SpacesView } from "@/components/community/spaces-view";

export const metadata: Metadata = {
    title: "Spaces",
};

export default function SpacesPage() {
    return <SpacesView />;
}
