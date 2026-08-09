import { cn } from "@/lib/utils"

// The one skeleton look across the app: a STILL flat fill. Styling lives in
// `.shimmer-skeleton` in globals.css — the class kept its name, but the sweep
// it describes was removed on 2026-07-28 and should not come back. Callers pass
// their own size + `rounded-*` (a bare skeleton gets a default radius).
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("shimmer-skeleton block", className)}
      {...props}
    />
  )
}

export { Skeleton }
