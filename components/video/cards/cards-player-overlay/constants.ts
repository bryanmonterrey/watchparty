import type { Variants } from "motion/react";

export const CARD_TRANSITION = {
    type: "spring" as const,
    stiffness: 380,
    damping: 32,
    mass: 0.8,
};

export const cardVariants: Variants = {
    hidden: { opacity: 0, x: "100%", scale: 0.96 },
    visible: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: "100%", scale: 0.96, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] as [number, number, number, number] } },
};

export const pillVariants: Variants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20, transition: { duration: 0.12 } },
};
