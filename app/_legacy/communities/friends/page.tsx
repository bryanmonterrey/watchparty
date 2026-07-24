import { Metadata } from "next";
import { FriendsView } from "@/components/community/friends-view";

export const metadata: Metadata = {
    title: "Friends",
};

export default function FriendsPage() {
    return <FriendsView />;
}
