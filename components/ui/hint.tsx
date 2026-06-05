import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

interface HintProps {
    label: string;
    children: React.ReactNode;
    asChild?: boolean;
    placement?: "top" | "bottom" | "left" | "right";
}

export const Hint: React.FC<HintProps> = ({
    label,
    children,
    asChild = false,
    placement = "top",
}) => {
    return (
        <TooltipProvider>
            <Tooltip delayDuration={240}>
                <TooltipTrigger asChild={asChild}>
                    {children}
                </TooltipTrigger>
                <TooltipContent
                    side={placement}
                    className="bg-zinc-800 text-white border-zinc-700"
                >
                    <p className="font-semibold">{label}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
