import { ShortsFeed } from "@/components/shorts/shorts-feed";
import { Metadata } from "next";

// Port of sidebar's (browse)/shorts/page.tsx.
export const metadata: Metadata = {
    title: "Shorts",
    description: "Watch short-form vertical videos.",
};

export default function ShortsPage() {
    return (
        <div className="w-full h-full bg-black overflow-hidden flex justify-center">
            <main className="w-full h-full relative">
                <ShortsFeed />
            </main>
        </div>
    );
}
