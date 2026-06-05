"use client";

import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";

export function BookmarkToast({ id }: { id: string | number }) {
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex items-center justify-between w-full gap-4 px-6 py-3 rounded-3xl text-sm font-medium text-white"
                style={{ background: "#358efc" }}
            >
                <span>Bookmarked</span>
                <button
                    onClick={() => { toast.dismiss(id); window.location.assign("/discover?tab=bookmarks"); }}
                    className="font-bold text-white whitespace-nowrap"
                >
                    View bookmarks
                </button>
            </motion.div>
        </AnimatePresence>
    );
}
