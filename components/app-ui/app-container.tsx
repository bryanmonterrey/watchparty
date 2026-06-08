"use client";

import { ViewTransition } from "react";
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
    <ViewTransition name="page-content">
      <motion.div
        id="app-scroll-container"
        className="flex-1 hidden-scrollbar h-screen overflow-y-auto overflow-x-hidden shadow-sm"
        initial={false}
      >
        {children}
      </motion.div>
    </ViewTransition>
  );
};
