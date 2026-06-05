"use client";

import { Calendar, MapPin, Globe, WalletCards } from "lucide-react";
import { UserType } from "@/db/schema/auth/user";

interface ProfileAboutProps {
    user: UserType;
}

const formatJoinedDate = (date: Date | null) => {
    if (!date) return "Recently";
    try {
        return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(date));
    } catch {
        return "Recently";
    }
};

export function ProfileAbout({ user }: ProfileAboutProps) {
    return (
        <div className="max-w-2xl flex flex-col gap-8">
            {/* Bio */}
            {user.bio && (
                <div className="flex flex-col gap-2">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-black">Bio</span>
                    <p className="text-[15px] leading-relaxed text-zinc-300">{user.bio}</p>
                </div>
            )}

            {/* Details */}
            <div className="flex flex-col gap-4">
                <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-500 font-black">Details</span>
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                        <Calendar size={15} className="text-zinc-600 shrink-0" />
                        <span>Joined {formatJoinedDate(user.createdAt)}</span>
                    </div>
                    {user.location && (
                        <div className="flex items-center gap-3 text-sm text-zinc-400">
                            <MapPin size={15} className="text-zinc-600 shrink-0" />
                            <span>{user.location}</span>
                        </div>
                    )}
                    {user.wallet_address && (
                        <div className="flex items-center gap-3 text-sm text-zinc-400">
                            <WalletCards size={15} className="text-zinc-600 shrink-0" />
                            <span className="font-mono text-xs truncate">{user.wallet_address}</span>
                        </div>
                    )}
                    {user.website && (
                        <div className="flex items-center gap-3 text-sm">
                            <Globe size={15} className="text-zinc-600 shrink-0" />
                            <a
                                href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-400 hover:text-indigo-300 transition-colors truncate"
                            >
                                {user.website.replace(/^https?:\/\//, "")}
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
