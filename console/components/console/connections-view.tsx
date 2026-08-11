"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ConnectIcon } from "@hugeicons/core-free-icons";

// X's Connections page (docs/console-x-reference.md §10): a table of streaming
// connections per app. We don't hold long-lived stream connections yet, so
// this is the real table shape with an honest empty state — it populates once
// the streaming engine records connections (X shows the same empty table).

const TABS = ["All", "Active", "Inactive"] as const;
const COLS = ["Connection ID", "Endpoint", "Status", "Connected At", "Disconnected At", "Client IP"];

export function ConnectionsView() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("All");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Connections</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Streaming connections held by your apps. These appear once real-time
          streaming ships.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-6 gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
            {COLS.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <HugeiconsIcon icon={ConnectIcon} className="size-5 text-muted-foreground" />
            <p className="text-sm">No connections found for your apps.</p>
            <p className="max-w-md text-xs text-muted-foreground">
              When real-time streaming is available, each open connection your
              apps hold — with its endpoint, status, and client IP — shows here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
