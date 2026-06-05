"use client"; // @NOTE: Add in case you are using Next.js

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type AnimatedTabsProps = {
  tabs: Array<string>;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
};

export function AnimatedTabs({ tabs, activeTab: externalActiveTab, onTabChange }: AnimatedTabsProps) {
  const activeTab = externalActiveTab || tabs[0];

  const containerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const container = containerRef.current;

    if (container && activeTab) {
      const activeTabElement = activeTabRef.current;

      if (activeTabElement) {
        const { offsetLeft, offsetWidth } = activeTabElement;

        const clipLeft = offsetLeft;
        const clipRight = offsetLeft + offsetWidth;

        container.style.clipPath = `inset(0 ${Number(100 - (clipRight / container.offsetWidth) * 100).toFixed()}% 0 ${Number((clipLeft / container.offsetWidth) * 100).toFixed()}% round 17px)`;
      }
    }
  }, [activeTab]);

  return (
    <div className="relative mx-auto flex w-fit flex-col items-center rounded-full">
      <div
        ref={containerRef}
        className="absolute z-10 w-full overflow-hidden [clip-path:inset(0px_75%_0px_0%_round_17px)] [transition:clip-path_0.25s_ease]"
      >
        <div className="relative flex w-full justify-center bg-neutral-800/70">
          {tabs.map((tab, index) => (
            <button
              key={index.toString()}
              type="button"
              onClick={() => onTabChange?.(tab)}
              className={cn(
                "flex h-8 items-center rounded-full p-3 font-medium text-white/85 text-sm/5.5",
              )}
              tabIndex={-1}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div className="relative flex w-full justify-center">
        {tabs.map((tab, index) => {
          const isActive = activeTab === tab;

          return (
            <button
              key={index.toString()}
              type="button"
              ref={isActive ? activeTabRef : null}
              onClick={() => onTabChange?.(tab)}
              className="flex h-8 items-center rounded-full p-3 font-medium text-neutral-400 text-sm/5.5"
            >
              {tab}
            </button>
          );
        })}
      </div>
    </div>
  );
}
