"use client";

import { toast } from "sonner";
import { motion } from "motion/react";
import { Check, X, Info } from "lucide-react";

type Variant = "success" | "error" | "info";

const CONFIG = {
    success: { icon: Check,  bg: "bg-[#10B981]", text: "text-[#10B981]" },
    error:   { icon: X,      bg: "bg-red-500",   text: "text-red-400"   },
    info:    { icon: Info,   bg: "bg-[#A7A9FF]", text: "text-[#A7A9FF]" },
} as const;

function AppToastContent({ message, variant }: { message: string; variant: Variant }) {
    const { icon: Icon, bg, text } = CONFIG[variant];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-[300px] bg-black1 border border-zinc-800/60 rounded-3xl px-4 py-3.5 flex items-center gap-3 shadow-2xl"
        >
            <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 22, delay: 0.05 }}
                className={`w-5 h-5 rounded-full ${bg} flex items-center justify-center shrink-0`}
            >
                <Icon className="w-3 h-3 text-black" strokeWidth={3} />
            </motion.div>
            <p className={`text-[13px] font-medium flex-1 ${text}`}>{message}</p>
        </motion.div>
    );
}

function show(variant: Variant, message: string, duration = 4000) {
    toast.custom(() => <AppToastContent message={message} variant={variant} />, { duration });
}

export const appToast = {
    success: (message: string) => show("success", message),
    error:   (message: string) => show("error",   message),
    info:    (message: string) => show("info",     message),
};
