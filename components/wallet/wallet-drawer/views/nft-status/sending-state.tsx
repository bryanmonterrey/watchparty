"use client";

import { motion } from "framer-motion";

export function SendingState() {
    return (
        <motion.div
            key="sending"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center text-center space-y-6"
        >
            <div className="relative w-24 h-24">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                    <circle
                        className="text-zinc-800"
                        strokeWidth="8"
                        stroke="currentColor"
                        fill="transparent"
                        r="40"
                        cx="50"
                        cy="50"
                    />
                    <motion.circle
                        className="text-[#A7A9FF]"
                        strokeWidth="8"
                        strokeDasharray="251.2"
                        animate={{
                            strokeDashoffset: [251.2, 0],
                            rotate: [0, 360],
                        }}
                        transition={{
                            strokeDashoffset: { duration: 2, repeat: Infinity, ease: "easeInOut" },
                            rotate: { duration: 1.5, repeat: Infinity, ease: "linear" },
                        }}
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="transparent"
                        r="40"
                        cx="50"
                        cy="50"
                        style={{ transformOrigin: "50% 50%" }}
                    />
                </svg>
            </div>

            <div className="space-y-2">
                <h2 className="text-[32px] font-bold text-white tracking-tight">Sending...</h2>
                <button className="text-[#A7A9FF] text-[15px] font-medium flex items-center gap-1.5 mx-auto hover:opacity-80 transition-opacity">
                    View transaction
                </button>
            </div>
        </motion.div>
    );
}
