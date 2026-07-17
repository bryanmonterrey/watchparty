"use client";

import { useParams, useRouter } from "next/navigation";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type Props = {
    member: {
        id: string;
        role: string;
        userId: string;
        userName: string | null;
        userImage: string | null;
        userUsername: string | null;
        /** custom-role name tint (hex) */
        roleColor?: string | null;
    };
};

const roleIconMap: Record<string, React.ReactNode> = {
    GUEST: null,
    MODERATOR: <ShieldCheck className="h-4 w-4 ml-1 text-indigo-400" />,
    ADMIN: <ShieldAlert className="h-4 w-4 ml-1 text-rose-500" />,
};

export function CommunityMemberItem({ member }: Props) {
    const params = useParams();
    const router = useRouter();

    return (
        <button
            className={cn(
                "group px-2 py-[6px] rounded-md flex items-center gap-x-2 w-full hover:bg-zinc-700/50 transition mb-[2px]"
            )}
        >
            <Avatar className="h-7 w-7">
                <AvatarImage src={member.userImage ?? undefined} alt={member.userName ?? ""} />
                <AvatarFallback className="bg-indigo-500 text-white text-xs">
                </AvatarFallback>
            </Avatar>
            <p
                className="font-medium text-sm text-zinc-400 group-hover:text-zinc-300 transition line-clamp-1"
                style={member.roleColor ? { color: member.roleColor } : undefined}
            >
                {member.userName ?? member.userUsername ?? "Unknown"}
            </p>
            {roleIconMap[member.role]}
        </button>
    );
}
