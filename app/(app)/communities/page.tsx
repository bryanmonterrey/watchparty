import { Metadata } from "next";
import { CommunitiesLanding } from "@/components/community/communities-landing";

export const metadata: Metadata = {
    title: "communities",
};

export default function CommunitiesPage() {
    return <CommunitiesLanding />;
}
