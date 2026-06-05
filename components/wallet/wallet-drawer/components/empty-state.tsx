import { LucideIcon } from "lucide-react";

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
}

export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
            <div className="w-14 h-14 rounded-full bg-zinc-900/40 flex items-center justify-center mb-4 border border-white/5">
                <Icon className="w-6 h-6 text-zinc-500" />
            </div>
            <p className="text-zinc-300 text-sm font-semibold mb-1">{title}</p>
            <p className="text-zinc-500 text-xs max-w-[200px] leading-relaxed">
                {description}
            </p>
        </div>
    );
}
