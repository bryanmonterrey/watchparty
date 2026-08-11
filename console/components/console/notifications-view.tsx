"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Notification03Icon, Alert02Icon, AlertCircleIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";

// The console Notifications feed (X's §2): platform news that affects
// integrations — deprecations, incidents, new events. Read-only here (admins
// author via developerAnnouncements.create).

const LEVEL = {
  info: { icon: Notification03Icon, className: "text-muted-foreground" },
  warning: { icon: Alert02Icon, className: "text-amber-600 dark:text-amber-400" },
  incident: { icon: AlertCircleIcon, className: "text-destructive" },
} as const;

export function NotificationsView() {
  const list = trpc.developerAnnouncements.list.useQuery();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Notifications</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Platform news that affects your integrations — changes, incidents,
          and new capabilities.
        </p>
      </div>

      {list.isPending ? (
        <>
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </>
      ) : list.error ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {list.error.message}
        </div>
      ) : list.data.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg border">
            <HugeiconsIcon icon={Notification03Icon} className="size-4 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No announcements yet.</p>
        </div>
      ) : (
        list.data.map((a) => {
          const lv = LEVEL[(a.level as keyof typeof LEVEL) ?? "info"] ?? LEVEL.info;
          return (
            <div key={a.id} className="rounded-xl border bg-card p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <HugeiconsIcon icon={lv.icon} className={`size-4 ${lv.className}`} />
                <p className="text-sm font-medium">{a.title}</p>
                <span className="ml-auto text-xs text-muted-foreground">{formatDate(a.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
            </div>
          );
        })
      )}
    </div>
  );
}
