import { Metadata } from "next";
import { CommunitiesLanding } from "@/components/community/communities-landing";

export const metadata: Metadata = {
    title: "Communities",
};

export default function CommunitiesPage() {
    return <CommunitiesLanding />;
}
