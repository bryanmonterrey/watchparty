"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { Loader2 } from "lucide-react";

// Port of sidebar's (browse)/communities/[serverId]/page.tsx — redirects to
// the server's #general (or first) channel.
export default function ServerPage() {
    const params = useParams();
    const router = useRouter();
    const serverId = params?.serverId as string;

    const { data } = trpc.community.getServer.useQuery(
        { serverId },
        { enabled: !!serverId }
    );

    useEffect(() => {
        if (data) {
            const generalChannel = data.channels.find((c) => c.name === "general");
            if (generalChannel) {
                router.replace(`/communities/${serverId}/channels/${generalChannel.id}`);
            } else if (data.channels.length > 0) {
                router.replace(`/communities/${serverId}/channels/${data.channels[0].id}`);
            }
        }
    }, [data, serverId, router]);

    return (
        <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-7 w-7 text-zinc-500 animate-spin" />
        </div>
    );
}
