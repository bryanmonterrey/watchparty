"use client";

import { CreateServerModal } from "./modals/create-server-modal";
import { CreateChannelModal } from "./modals/create-channel-modal";
import { InviteModal } from "./modals/invite-modal";

export function CommunityModalProvider() {
    return (
        <>
            <CreateServerModal />
            <CreateChannelModal />
            <InviteModal />
        </>
    );
}
