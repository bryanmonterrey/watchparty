"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  className,
  label,
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size={label ? "sm" : "icon-sm"}
      className={cn("shrink-0", className)}
      onClick={() => {
        void navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-3.5" />
      {label ? (copied ? "Copied" : label) : null}
    </Button>
  );
}
