"use client";

import { motion } from "motion/react";
import { useSidebar } from "@/components/ui/sidebar";

interface ContainerProps {
  children: React.ReactNode;
};

// Matches sidebar's app-container exactly: the view-transition name is set as
// a permanent style (not React's <ViewTransition> wrapper, which only assigns
// the name during React-driven transitions and was the one transition-relevant
// divergence from sidebar while page transitions were reported missing).
export const AppContainer = ({
  children,
}: ContainerProps) => {
  const { state } = useSidebar();

  return (
    <motion.div
      id="app-scroll-container"
      className="flex-1 min-h-0 max-h-screen hidden-scrollbar h-screen overflow-y-auto overflow-x-hidden shadow-sm max-md:pb-28"
      style={{ viewTransitionName: "page-content" }}
      initial={false}
    >
      {children}
    </motion.div>
  );
};
