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
      // NO bg-panel. This scroller used to carry bg-panel — white at 3% — over
      // the shell, and that wash is what the app's surface colour actually was:
      // 0.03×255 + 0.97×base. Over pure black it landed on #080808, which is
      // exactly why --color-canvas was #080808 and why the sidebar paints flat
      // bg-canvas to match it.
      //
      // That made the requested rgb(5,5,5) UNREACHABLE — with a 3% white wash on
      // top, the darkest the content area can ever be is rgb(8,8,8), and over
      // the new base it was compositing to rgb(13,13,13) while the sidebar sat
      // at rgb(5,5,5). Dropping the wash lets SidebarInset's bg-background show
      // through, so the scroller and the sidebar are both exactly the token.
      //
      // bg-panel itself is untouched and still used by the /trade grid and the
      // token-page cards, which is what the token was written for.
      className="flex-1 min-h-0 max-h-screen hidden-scrollbar h-screen overflow-y-auto overflow-x-hidden shadow-sm max-md:pb-28"
      style={{ viewTransitionName: "page-content" }}
      initial={false}
    >
      {/* The cap lives on an inner wrapper, not the scroller: the scroller owns
          the page background and the scrollbar, and both should still run the
          full width. Only the CONTENT is centred. */}
      <div className="mx-auto w-full max-w-(--app-max-width)">{children}</div>
    </motion.div>
  );
};
