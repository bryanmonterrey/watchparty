"use client";

import { motion } from "motion/react";
import { useSidebar } from "@/components/ui/sidebar";

interface ContainerProps {
  children: React.ReactNode;
};

export const AppContainer = ({
  children,
}: ContainerProps) => {
  const { state } = useSidebar();

  return (
    <motion.div
      id="app-scroll-container"
      className="flex-1 hidden-scrollbar h-screen overflow-y-auto overflow-x-hidden shadow-sm"
      style={{ viewTransitionName: "page-content" }}
      initial={false}
    >
      {children}
    </motion.div>
  );
};
