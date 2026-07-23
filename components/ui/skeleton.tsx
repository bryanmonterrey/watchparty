import { cn } from "@/lib/utils"

// The one skeleton look across the app: a soft highlight band sweeps across a
// flat fill (next-beats style). Styling lives in `.shimmer-skeleton` in
// globals.css. Callers pass their own size + `rounded-*` (a bare skeleton gets
// a default radius from the CSS).
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
