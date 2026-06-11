"use client";

import dynamic from "next/dynamic";

// Interaction-only dialogs — dynamic() keeps them out of the communities
// layout's main chunk so they load as low-priority async chunks after
// hydration instead of blocking it.
const CreateServerModal = dynamic(() => import("./modals/create-server-modal").then(m => m.CreateServerModal), { ssr: false });
const CreateChannelModal = dynamic(() => import("./modals/create-channel-modal").then(m => m.CreateChannelModal), { ssr: false });
const InviteModal = dynamic(() => import("./modals/invite-modal").then(m => m.InviteModal), { ssr: false });

export function CommunityModalProvider() {
    return (
        <>
            <CreateServerModal />
            <CreateChannelModal />
            <InviteModal />
        </>
    );
}
