"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Button } from "@/components/ui/button";

/**
 * Standard page shell for a surface with nothing to show yet: the console's
 * H1 + one-sentence explainer, then the empty-state card (icon + one-liner,
 * optional working action). No mock rows, no dead buttons.
 */
export function EmptyView({
  title,
  tagline,
  icon,
  emptyLine,
  action,
}: {
  title: string;
  tagline: string;
  icon: IconSvgElement;
  emptyLine: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{tagline}</p>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg border">
            <HugeiconsIcon icon={icon} className="size-4.5 text-muted-foreground" />
          </div>
          <p className="max-w-sm text-sm text-muted-foreground">{emptyLine}</p>
          {action ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-1"
              render={<Link href={action.href} />}
            >
              {action.label}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
