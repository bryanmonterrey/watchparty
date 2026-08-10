"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Album02Icon, LinkSquare02Icon, Image01Icon, Video01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Button } from "@/components/ui/button";

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

const TABS = [
  { key: "drafts", label: "Drafts" },
  { key: "scheduled", label: "Scheduled" },
  { key: "published", label: "Published" },
] as const;

export function ContentView() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]["key"]>("drafts");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Content</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your drafts, scheduled posts, and everything you&apos;ve published.
        </p>
      </div>

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
        {tab === "drafts" ? <DraftsTab /> : tab === "scheduled" ? <ScheduledTab /> : <PublishedTab />}
      </div>
    </div>
  );
}
