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
                {/* No className: the community server icons render a bare
                    TooltipContent, and this used to override its fill with
                    bg-zinc-800/border-zinc-700 — so the same hint looked like two
                    different components depending on where it appeared. The
                    primitive's own styling is the app's tooltip. */}
                <TooltipContent side={placement} align="center">
                    <p className="text-sm font-semibold">{label}</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
