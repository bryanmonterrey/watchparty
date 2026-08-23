"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Album02Icon, LinkSquare02Icon, Image01Icon, Video01Icon, CloudUploadIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Button } from "@/components/ui/button";
import { UploadDialog } from "@/components/studio/upload-dialog";

// Content management (studio S3): the creator's own pipeline. Drafts and
// Scheduled are the real management surfaces — backed by content.getDrafts /
// getScheduledPosts (raw own-post rows) with publish / delete / cancel verbs.
// Published stays a count + profile link (the published feed uses a richer
// mapped shape rendered by the profile; no need to rebuild the post card here).

type PostRow = {
  id: string;
  title: string | null;
  content: string | null;
  imageUrl: string | null;
  videoUrl: string | null;
  scheduledFor: Date | null;
  updatedAt: Date;
};

function snippet(p: PostRow): string {
  const s = (p.title ?? p.content ?? "").trim();
  return s.length ? s : "Untitled";
}

function fmtDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PostItem({
  post,
  when,
  actions,
}: {
  post: PostRow;
  when: string;
  actions: React.ReactNode;
}) {
  const hasMedia = !!post.imageUrl || !!post.videoUrl;
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{snippet(post)}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {hasMedia ? (
            <HugeiconsIcon
              icon={post.videoUrl ? Video01Icon : Image01Icon}
              className="size-3"
            />
          ) : null}
          {when}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </div>
  );
}

function DraftsTab() {
  const utils = trpc.useUtils();
  const drafts = trpc.content.getDrafts.useQuery();
  const publish = trpc.content.publishDraft.useMutation({
    onSuccess: () => void utils.content.getDrafts.invalidate(),
  });
  const del = trpc.content.deleteDraft.useMutation({
    onSuccess: () => void utils.content.getDrafts.invalidate(),
  });

  if (drafts.isPending) return <div className="h-20 animate-pulse rounded-xl bg-muted/30" />;
  if (drafts.error) return <p className="py-6 text-center text-xs text-destructive">{drafts.error.message}</p>;
  if (!drafts.data.length)
    return <p className="py-8 text-center text-xs text-muted-foreground">No drafts. Anything you save without publishing lands here.</p>;

  return (
    <div className="flex flex-col divide-y">
      {drafts.data.map((d) => (
        <PostItem
          key={d.id}
          post={d}
          when={`Edited ${fmtDate(d.updatedAt)}`}
          actions={
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={publish.isPending}
                onClick={() => publish.mutate({ postId: d.id })}
              >
                Publish
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={del.isPending}
                onClick={() => del.mutate({ postId: d.id })}
              >
                Delete
              </Button>
            </>
          }
        />
      ))}
    </div>
  );
}

function ScheduledTab() {
  const utils = trpc.useUtils();
  const scheduled = trpc.content.getScheduledPosts.useQuery();
  const cancel = trpc.content.cancelScheduled.useMutation({
    onSuccess: () => void utils.content.getScheduledPosts.invalidate(),
  });

  if (scheduled.isPending) return <div className="h-20 animate-pulse rounded-xl bg-muted/30" />;
  if (scheduled.error) return <p className="py-6 text-center text-xs text-destructive">{scheduled.error.message}</p>;
  if (!scheduled.data.length)
    return <p className="py-8 text-center text-xs text-muted-foreground">Nothing scheduled.</p>;

  return (
    <div className="flex flex-col divide-y">
      {scheduled.data.map((s) => (
        <PostItem
          key={s.id}
          post={s}
          when={`Posts ${fmtDate(s.scheduledFor)}`}
          actions={
            <Button size="sm" variant="ghost" disabled={cancel.isPending} onClick={() => cancel.mutate({ postId: s.id })}>
              Cancel
            </Button>
          }
        />
      ))}
    </div>
  );
}

function fmtCount(n: number): string {
  return new Intl.NumberFormat(undefined, { notation: n >= 10_000 ? "compact" : "standard" }).format(n);
}

function fmtDuration(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// The Media-Studio Library (studio.x.com): the creator's own videos — every
// one they own, any visibility (studio.getMyVideos), not the public rail.
function LibraryTab() {
  const videos = trpc.studio.getMyVideos.useQuery();

  if (videos.isPending) {
    return (
      <div className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-video animate-pulse rounded-xl bg-muted/40" />
        ))}
      </div>
    );
  }
  if (videos.error) return <p className="py-6 text-center text-xs text-destructive">{videos.error.message}</p>;
  if (!videos.data.length)
    return (
      <p className="py-10 text-center text-xs text-muted-foreground">
        No videos yet. Use <span className="font-medium text-foreground">Upload video</span> to add one.
      </p>
    );

  return (
    <div className="grid grid-cols-2 gap-3 py-3 sm:grid-cols-3">
      {videos.data.map((v) => {
        const dur = fmtDuration(v.duration);
        return (
          <a
            key={v.id}
            href={`https://watchparty.xyz/video/${v.id}`}
            className="group flex flex-col gap-1.5"
          >
            <div className="relative aspect-video overflow-hidden rounded-xl border border-border/60 bg-muted/40">
              {v.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnailUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <HugeiconsIcon icon={Video01Icon} className="size-5 text-muted-foreground" />
                </div>
              )}
              {v.visibility !== "public" ? (
                <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium capitalize text-white">
                  {v.visibility}
                </span>
              ) : null}
              {dur ? (
                <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
                  {dur}
                </span>
              ) : null}
            </div>
            <p className="truncate text-xs font-medium">{v.title?.trim() || "Untitled"}</p>
            <p className="text-xs text-muted-foreground">
              {fmtCount(v.views)} views · {fmtDate(v.createdAt)}
            </p>
          </a>
        );
      })}
    </div>
  );
}

function fmtBroadcastDuration(sec: number | null): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// The Producer/Broadcasts list (studio.x.com Producer): this creator's past
// and live broadcasts, from stream.broadcasts (recorded on go-live/offline).
function BroadcastsTab() {
  const broadcasts = trpc.stream.broadcasts.useQuery(undefined, { refetchInterval: 30_000 });

  if (broadcasts.isPending) return <div className="h-20 animate-pulse rounded-xl bg-muted/30" />;
  if (broadcasts.error) return <p className="py-6 text-center text-xs text-destructive">{broadcasts.error.message}</p>;
  if (!broadcasts.data.length)
    return (
      <p className="py-10 text-center text-xs text-muted-foreground">
        No broadcasts yet. Your past streams show up here with their duration.
      </p>
    );

  return (
    <div className="flex flex-col divide-y">
      {broadcasts.data.map((b) => (
        <div key={b.id} className="flex items-center gap-3 py-3">
          {b.live ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
              <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
              Live
            </span>
          ) : (
            <span className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground">
              Ended
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{b.title?.trim() || "Untitled broadcast"}</p>
            <p className="text-xs text-muted-foreground">
              {fmtDate(b.startedAt)}
              {b.category ? ` · ${b.category}` : ""}
            </p>
          </div>
          {/* Peak/avg CCV — folded in every minute by the ivs-viewers cron
              while the broadcast is open (db/stream-session-ccv.sql). A
              broadcast from before that existed has no samples and shows
              nothing rather than a zero it never measured. */}
          {b.peakViewers !== null ? (
            <div className="shrink-0 text-right">
              <p className="text-xs tabular-nums">
                {fmtCount(b.peakViewers)} <span className="text-muted-foreground">peak</span>
              </p>
              <p className="text-11 tabular-nums text-muted-foreground">
                {fmtCount(b.avgViewers ?? 0)} avg
              </p>
            </div>
          ) : null}
          {b.durationSec ? (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {fmtBroadcastDuration(b.durationSec)}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function PublishedTab() {
  const { data: session } = useAuthSession();
  const userId = session?.user?.id;
  const username = session?.user?.username as string | undefined;
  const posts = trpc.content.getPostsByUser.useQuery({ userId: userId ?? "" }, { enabled: !!userId });

  return (
    <div className="flex items-center gap-2.5 py-3">
      <div className="flex size-8 items-center justify-center rounded-lg border border-border/60">
        <HugeiconsIcon icon={Album02Icon} className="size-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium">Published posts &amp; videos</p>
        <p className="text-xs text-muted-foreground">
          {posts.isPending ? "Counting…" : posts.error ? posts.error.message : `${posts.data.total ?? 0} live`}
        </p>
      </div>
      {username ? (
        <a
          href={`https://watchparty.xyz/${username}`}
          className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View on profile
          <HugeiconsIcon icon={LinkSquare02Icon} className="size-3" />
        </a>
      ) : null}
    </div>
  );
}

// Per-video performance (studio.x.com Insights): the owner's published videos
// ranked by views, with engagement. Distinct from the account-level Analytics
// page — this is per-item, so a creator sees which videos actually landed.
function InsightsTab() {
  const insights = trpc.studio.getVideoInsights.useQuery();

  if (insights.isPending) return <div className="h-20 animate-pulse rounded-xl bg-muted/30" />;
  if (insights.error) return <p className="py-6 text-center text-xs text-destructive">{insights.error.message}</p>;
  if (!insights.data.length)
    return (
      <p className="py-10 text-center text-xs text-muted-foreground">
        No published videos yet. Performance shows up here once you publish one.
      </p>
    );

  const totalViews = insights.data.reduce((s, v) => s + v.views, 0);
  const totalLikes = insights.data.reduce((s, v) => s + v.likes, 0);

  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Total views</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtCount(totalViews)}</p>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">Total likes</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums">{fmtCount(totalLikes)}</p>
        </div>
      </div>
      <div className="flex flex-col divide-y">
        {insights.data.map((v) => (
          <a
            key={v.id}
            href={`https://watchparty.xyz/video/${v.id}`}
            className="flex items-center gap-3 py-3"
          >
            <div className="relative aspect-video w-24 shrink-0 overflow-hidden rounded-lg border border-border/60 bg-muted/40">
              {v.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.thumbnailUrl} alt="" className="size-full object-cover" />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <HugeiconsIcon icon={Video01Icon} className="size-4 text-muted-foreground" />
                </div>
              )}
              {(() => {
                const dur = fmtDuration(v.duration);
                return dur ? (
                  <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-xs font-medium text-white">
                    {dur}
                  </span>
                ) : null;
              })()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{v.title?.trim() || "Untitled"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {fmtCount(v.views)} views · {fmtCount(v.likes)} likes · {fmtCount(v.comments)} comments · {fmtCount(v.reposts)} reposts
              </p>
              <p className="text-xs text-muted-foreground/70">{fmtDate(v.createdAt)}</p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

const TABS = [
  { key: "library", label: "Library" },
  { key: "insights", label: "Insights" },
  { key: "broadcasts", label: "Broadcasts" },
  { key: "drafts", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
] as const;

export function ContentView() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]["key"]>("library");
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const utils = trpc.useUtils();

  const onUploaded = () => {
    void utils.studio.getMyVideos.invalidate();
    void utils.studio.getVideoInsights.invalidate();
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Content</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your video library, drafts, scheduled posts, and everything
            you&apos;ve published.
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
          <HugeiconsIcon icon={CloudUploadIcon} className="size-4" />
          Upload video
        </Button>
      </div>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onDone={onUploaded} />

      <div className="flex gap-1 rounded-xl border border-border/60 bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t.key ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-border/60 bg-card px-4 sm:px-5">
        {tab === "library" ? (
          <LibraryTab />
        ) : tab === "insights" ? (
          <InsightsTab />
        ) : tab === "broadcasts" ? (
          <BroadcastsTab />
        ) : tab === "drafts" ? (
          <DraftsTab />
        ) : tab === "scheduled" ? (
          <ScheduledTab />
        ) : (
          <PublishedTab />
        )}
      </div>
    </div>
  );
}
