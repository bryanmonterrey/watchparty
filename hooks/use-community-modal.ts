"use client";

import { create } from "zustand";
import type { CommunityServer, CommunityChannel } from "@/db/schema/community";

export type CommunityModalType =
    | "createServer"
    | "editServer"
    | "deleteServer"
    | "leaveServer"
    | "invite"
    | "members"
    | "createChannel"
    | "editChannel"
    | "deleteChannel"
    | "deleteMessage";

type CommunityModalData = {
    server?: CommunityServer;
    channel?: CommunityChannel;
    channelType?: "TEXT" | "AUDIO" | "VIDEO";
    messageId?: string;
    serverId?: string;
};

type CommunityModalStore = {
    type: CommunityModalType | null;
    data: CommunityModalData;
    isOpen: boolean;
    onOpen: (type: CommunityModalType, data?: CommunityModalData) => void;
    onClose: () => void;
};

export const useCommunityModal = create<CommunityModalStore>((set) => ({
    type: null,
    data: {},
    isOpen: false,
    onOpen: (type, data = {}) => set({ isOpen: true, type, data }),
    onClose: () => set({ isOpen: false, type: null, data: {} }),
}));
