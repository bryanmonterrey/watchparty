"use client";

import dynamic from "next/dynamic";

// Interaction-only dialogs — dynamic() keeps them out of the communities
// layout's main chunk so they load as low-priority async chunks after
// hydration instead of blocking it.
const CreateServerModal = dynamic(() => import("./modals/create-server-modal").then(m => m.CreateServerModal), { ssr: false });
const CreateChannelModal = dynamic(() => import("./modals/create-channel-modal").then(m => m.CreateChannelModal), { ssr: false });
const InviteModal = dynamic(() => import("./modals/invite-modal").then(m => m.InviteModal), { ssr: false });
const EditServerModal = dynamic(() => import("./modals/edit-server-modal").then(m => m.EditServerModal), { ssr: false });
const EditChannelModal = dynamic(() => import("./modals/edit-channel-modal").then(m => m.EditChannelModal), { ssr: false });
const MembersModal = dynamic(() => import("./modals/members-modal").then(m => m.MembersModal), { ssr: false });
const ConfirmModal = dynamic(() => import("./modals/confirm-modal").then(m => m.ConfirmModal), { ssr: false });
const NicknameModal = dynamic(() => import("./modals/nickname-modal").then(m => m.NicknameModal), { ssr: false });
const CreateCategoryModal = dynamic(() => import("./modals/create-category-modal").then(m => m.CreateCategoryModal), { ssr: false });

export function CommunityModalProvider() {
    return (
        <>
            <CreateServerModal />
            <CreateChannelModal />
            <InviteModal />
            <EditServerModal />
            <EditChannelModal />
            <MembersModal />
            <ConfirmModal />
            <NicknameModal />
            <CreateCategoryModal />
        </>
    );
}
