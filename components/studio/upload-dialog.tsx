"use client";

import * as React from "react";
import { useDropzone } from "react-dropzone";
import { HugeiconsIcon } from "@hugeicons/react";
import { CloudUploadIcon, Video01Icon } from "@hugeicons/core-free-icons";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc/client";
import { appToast } from "@/components/app-ui/app-toast";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL, formatFileSize } from "@/lib/upload-limits";

// In-studio media upload + compose (Phase 10). The resumable-upload backend
// already exists (upload.createResumableUpload — TUS to Supabase with a minted
// JWT); this brings the flow INTO the studio instead of linking out to the main
// composer. Two entries: `existing` set → skip straight to compose for a video
// already in the Library; unset → drop a new file, upload, then compose. Reuses
// the exact TUS pattern from components/app-ui/create-dialog (6MB chunks,
// resume-on-reconnect) without dragging in that 1,100-line kitchen sink.

type Existing = { url: string; title: string | null };

export function UploadDialog({
  open,
  onOpenChange,
  existing,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing?: Existing | null;
  onDone?: () => void;
}) {
  const [step, setStep] = React.useState<"drop" | "uploading" | "compose">("drop");
  const [progress, setProgress] = React.useState(0);
  const [videoUrl, setVideoUrl] = React.useState<string | null>(null);
  const [caption, setCaption] = React.useState("");

  const createResumableUpload = trpc.upload.createResumableUpload.useMutation();
  const createPost = trpc.content.createPost.useMutation();

  // Opening for an existing Library item jumps straight to compose; opening
  // fresh resets to the dropzone.
  React.useEffect(() => {
    if (!open) return;
    if (existing) {
      setStep("compose");
      setVideoUrl(existing.url);
      setCaption(existing.title ?? "");
    } else {
      setStep("drop");
      setVideoUrl(null);
      setCaption("");
      setProgress(0);
    }
  }, [open, existing]);

  const upload = React.useCallback(
    async (file: File) => {
      if (file.size > MAX_UPLOAD_BYTES) {
        appToast.error(`That video is ${formatFileSize(file.size)}. Max size is ${MAX_UPLOAD_LABEL}.`);
        return;
      }
      setStep("uploading");
      setProgress(0);
      try {
        const filename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const { path, token, endpoint } = await createResumableUpload.mutateAsync({ bucket: "videos", filename });

        const { Upload: TusUpload } = await import("tus-js-client");
        await new Promise<void>((resolve, reject) => {
          const up = new TusUpload(file, {
            endpoint,
            chunkSize: 6 * 1024 * 1024, // Supabase requires exactly 6MB chunks.
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: { authorization: `Bearer ${token}`, "x-upsert": "false" },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            metadata: {
              bucketName: "videos",
              objectName: path,
              contentType: file.type || "video/mp4",
              cacheControl: "3600",
            },
            onProgress: (sent, total) => setProgress(Math.round((sent / total) * 100)),
            onSuccess: () => resolve(),
            onError: (err) => reject(err),
          });
          up
            .findPreviousUploads()
            .then((prev) => {
              if (prev.length > 0) up.resumeFromPreviousUpload(prev[0]);
              up.start();
            })
            .catch(() => up.start());
        });

        const { supabase } = await import("@/lib/supabase/client");
        const { data } = supabase.storage.from("videos").getPublicUrl(path);
        setVideoUrl(data.publicUrl);
        setProgress(100);
        setStep("compose");
        appToast.success("Upload complete");
      } catch (error) {
        // tus errors carry the server's response — surface it, not a bare code.
        const e = error as { originalResponse?: { getBody?: () => string }; message?: string };
        const detail = e?.originalResponse?.getBody?.() || e?.message || "Unknown error";
        appToast.error(
          /exceeded the maximum allowed size|Payload too large/i.test(String(detail))
            ? `That video is too large. Max size is ${MAX_UPLOAD_LABEL}.`
            : `Upload failed: ${String(detail).slice(0, 160)}`,
        );
        setStep("drop");
      }
    },
    [createResumableUpload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => {
      if (files[0]) void upload(files[0]);
    },
    accept: { "video/*": [] },
    maxFiles: 1,
    disabled: step !== "drop",
  });

  const submit = (status: "published" | "draft") => {
    if (!videoUrl) return;
    createPost.mutate(
      { content: caption.trim() || undefined, media: [{ type: "video", url: videoUrl }], status },
      {
        onSuccess: () => {
          appToast.success(status === "draft" ? "Saved to drafts" : "Published");
          onOpenChange(false);
          onDone?.();
        },
        onError: (e) => appToast.error(e.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 overflow-hidden rounded-3xl border-border/60 p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="text-base">{existing ? "Create a post" : "Upload a video"}</DialogTitle>
        </DialogHeader>

        <div className="p-5">
          {step === "drop" ? (
            <div
              {...getRootProps()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
                isDragActive ? "border-primary bg-primary/5" : "border-border/70 hover:border-border"
              }`}
            >
              <input {...getInputProps()} />
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                <HugeiconsIcon icon={CloudUploadIcon} className="size-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">Drop a video, or click to browse</p>
                <p className="mt-1 text-xs text-muted-foreground">MP4, MOV, WebM · up to {MAX_UPLOAD_LABEL}</p>
              </div>
            </div>
          ) : step === "uploading" ? (
            <div className="flex flex-col gap-4 py-8">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                  <HugeiconsIcon icon={Video01Icon} className="size-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Uploading…</p>
                  <p className="text-xs text-muted-foreground">Resumable — safe to keep working</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  className="aspect-video w-full rounded-2xl border border-border/60 bg-black object-contain"
                />
              ) : null}
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Add a caption…"
                rows={3}
                className="w-full resize-none rounded-2xl border border-border/60 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground focus:border-border"
              />
            </div>
          )}
        </div>

        {step === "compose" ? (
          <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-4">
            <Button variant="ghost" disabled={createPost.isPending} onClick={() => submit("draft")}>
              Save draft
            </Button>
            <Button disabled={createPost.isPending || !videoUrl} onClick={() => submit("published")}>
              {createPost.isPending ? "Publishing…" : "Publish"}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
