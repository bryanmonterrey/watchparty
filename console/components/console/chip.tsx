import { cn } from "@/lib/utils";

/** Hairline status/metadata chip (the X-console row chip). */
export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "bad" | "warn";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "good" && "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
        tone === "bad" && "border-destructive/30 text-destructive",
        tone === "warn" && "border-amber-500/40 text-amber-600 dark:text-amber-400",
        tone === "neutral" && "text-muted-foreground",
        className,
      )}
    >
      {tone !== "neutral" ? (
        <span
          className={cn(
            "size-1.5 rounded-full",
            tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-destructive",
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
