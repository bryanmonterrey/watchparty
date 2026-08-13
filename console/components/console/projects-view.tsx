"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import { Folder01Icon, Add01Icon, MoreHorizontalIcon, PencilEdit02Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { trpc } from "@/lib/trpc";
import { Chip } from "@/components/console/chip";

// The Projects layer — an organizational bucket that groups apps (and through
// them their keys/webhooks). ORG-ONLY: the "Pay Per Use" chip is an inert plan
// stub matching X's layout; a project grants and gates nothing today. Real
// paid tiers can activate later without a redesign.

const PROJECT_CAP = 25;

/** The inert plan stub → its display label. Extend when real tiers ship. */
function planLabel(plan: string): string {
  return plan === "pay_per_use" ? "Pay Per Use" : plan;
}

function CreatePanel({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = React.useState("");
  const create = trpc.developerProjects.create.useMutation({
    onSuccess: () => {
      void utils.developerProjects.list.invalidate();
      onDone();
    },
  });

  return (
    <form
      className="rounded-xl border bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate({ name: name.trim() });
      }}
    >
      <p className="text-sm font-medium">New project</p>
      <p className="mt-1 text-xs text-muted-foreground">
        A project groups apps and their keys. You can move apps in and out of it
        anytime.
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          autoFocus
          maxLength={64}
          placeholder="Trading bots"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {create.error ? (
        <p className="mt-2 text-xs text-destructive">{create.error.message}</p>
      ) : null}
    </form>
  );
}

type ProjectRow = { id: string; name: string; plan: string; appCount: number };

function ProjectCard({ project }: { project: ProjectRow }) {
  const utils = trpc.useUtils();
  const [renaming, setRenaming] = React.useState(false);
  const [name, setName] = React.useState(project.name);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const invalidate = () => {
    void utils.developerProjects.list.invalidate();
    void utils.developerApps.list.invalidate();
  };
  const rename = trpc.developerProjects.rename.useMutation({
    onSuccess: () => {
      setRenaming(false);
      invalidate();
    },
  });
  const remove = trpc.developerProjects.remove.useMutation({ onSuccess: invalidate });

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border">
        <HugeiconsIcon icon={Folder01Icon} className="size-4 text-muted-foreground" />
      </div>

      <div className="min-w-0 flex-1">
        {renaming ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) rename.mutate({ id: project.id, name: name.trim() });
            }}
          >
            <Input autoFocus maxLength={64} value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
            <Button type="submit" size="sm" disabled={!name.trim() || rename.isPending}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setRenaming(false); setName(project.name); }}>
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium">{project.name}</p>
              <Chip>{planLabel(project.plan)}</Chip>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {project.appCount} connected {project.appCount === 1 ? "app" : "apps"}
            </p>
          </>
        )}
      </div>

      {!renaming ? (
        <>
          <Button asChild variant="outline" size="sm">
            <Link href={`/apps?project=${project.id}`}>View apps</Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Project actions">
                <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setRenaming(true)}>
                <HugeiconsIcon icon={PencilEdit02Icon} className="size-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      ) : null}

      {confirmDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(false)}>
          <div className="w-full max-w-sm rounded-xl border bg-card p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-medium">Delete “{project.name}”?</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The project is removed. Its {project.appCount} {project.appCount === 1 ? "app" : "apps"} are un-filed, not deleted.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: project.id })}
              >
                {remove.isPending ? "Deleting…" : "Delete project"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function ProjectsView() {
  const projects = trpc.developerProjects.list.useQuery();
  const [creating, setCreating] = React.useState(false);
  const atCap = !!projects.data && projects.data.length >= PROJECT_CAP;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Projects</h2>
            {projects.data ? (
              <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {projects.data.length} of {PROJECT_CAP}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Group your apps (and their keys) under a project. Plans are per
            project — every project is Pay Per Use for now.
          </p>
        </div>
        {!creating ? (
          <Button className="gap-1.5" disabled={atCap} onClick={() => setCreating(true)}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            New project
          </Button>
        ) : null}
      </div>

      {creating ? <CreatePanel onDone={() => setCreating(false)} /> : null}

      {projects.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[72px] rounded-xl" />
          <Skeleton className="h-[72px] rounded-xl" />
        </div>
      ) : projects.error ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {projects.error.message}
        </div>
      ) : projects.data.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg border">
            <HugeiconsIcon icon={Folder01Icon} className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No projects yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create one to organize your apps. Apps stay unfiled until you move
              them in.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            Create your first project
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {projects.data.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
