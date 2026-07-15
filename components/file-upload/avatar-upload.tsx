'use client';

import { useRef, useState } from 'react';
import type { Area } from 'react-easy-crop';
import { formatBytes, useFileUpload, type FileWithPreview } from '@/hooks/use-file-upload';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, ImageUploadIcon, UserIcon } from '@hugeicons/core-free-icons';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { AvatarCropper, getCroppedDataUrl } from '@/components/file-upload/avatar-cropper';

interface AvatarUploadProps {
  maxSize?: number;
  className?: string;
  onFileChange?: (file: FileWithPreview | null) => void;
  defaultAvatar?: string;
}

export default function AvatarUpload({
  maxSize = 2 * 1024 * 1024, // 2MB
  className,
  onFileChange,
  defaultAvatar,
}: AvatarUploadProps) {
  const [showCropDialog, setShowCropDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [croppedImageUrl, setCroppedImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Latest pan/zoom result (source data-url + crop area in natural pixels);
  // rendered to a 512px png only when the user hits Save.
  const cropStateRef = useRef<{ src: string; area: Area } | null>(null);

  const [
    { files, isDragging, errors },
    { removeFile, handleDragEnter, handleDragLeave, handleDragOver, handleDrop, openFileDialog, getInputProps },
  ] = useFileUpload({
    maxFiles: 1,
    maxSize,
    accept: 'image/*',
    multiple: false,
    onFilesChange: (files) => {
      const fileData = files[0];
      if (fileData?.file && fileData.file instanceof File) {
        setSelectedFile(fileData.file);
        setShowCropDialog(true);
      }
    },
  });

  const currentFile = files[0];
  const previewUrl = croppedImageUrl || currentFile?.preview || defaultAvatar;

  const handleRemove = () => {
    if (currentFile) {
      removeFile(currentFile.id);
    }
    setCroppedImageUrl(null);
    onFileChange?.(null);
  };

  const handleSaveCrop = async () => {
    const state = cropStateRef.current;
    if (!state) return;
    setSaving(true);
    try {
      const croppedImage = await getCroppedDataUrl(state.src, state.area);
      setCroppedImageUrl(croppedImage);
      const blob = await (await fetch(croppedImage)).blob();
      const file = new File([blob], selectedFile?.name || 'avatar.png', { type: 'image/png' });
      onFileChange?.({ id: crypto.randomUUID(), file, preview: croppedImage });
      setShowCropDialog(false);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelCrop = () => {
    setShowCropDialog(false);
    setSelectedFile(null);
    cropStateRef.current = null;
    if (currentFile) {
      removeFile(currentFile.id);
    }
  };

  return (
    <>
      <div className={cn('flex flex-col items-center gap-4', className)}>
        {/* Avatar Preview */}
        <div className="relative">
          <div
            className={cn(
              'group/avatar relative size-28 cursor-pointer overflow-hidden rounded-full transition-colors',
              previewUrl
                ? ''
                : cn(
                    'border border-dashed',
                    isDragging ? 'border-white/40 bg-white/5' : 'border-white/15 hover:border-white/30',
                  ),
            )}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={openFileDialog}
          >
            <input {...getInputProps()} className="sr-only" />

            {previewUrl ? (
              <>
                <img src={previewUrl} alt="Avatar" className="h-full w-full object-cover" />
                {/* hover affordance: change photo */}
                <div className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover/avatar:opacity-100">
                  <HugeiconsIcon icon={ImageUploadIcon} className="size-6 text-white" strokeWidth={2} />
                </div>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <HugeiconsIcon icon={UserIcon} className="size-7 text-zinc-600" strokeWidth={2} />
              </div>
            )}
          </div>

          {/* Remove Button - only show when file is uploaded */}
          {(currentFile || croppedImageUrl) && (
            <button
              onClick={handleRemove}
              className="absolute end-0 top-0 grid size-6 cursor-pointer place-items-center rounded-full bg-black/80 text-zinc-300 transition-colors hover:text-white"
              aria-label="Remove avatar"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" strokeWidth={2.5} />
            </button>
          )}
        </div>

        {/* Upload Instructions */}
        <div className="space-y-0.5 text-center">
          <p className="text-[14px] font-semibold text-zinc-200">{currentFile || croppedImageUrl ? 'Looking good' : 'Upload a photo'}</p>
          <p className="text-[12px] font-medium text-zinc-500">Drag & drop or click · PNG, JPG up to {formatBytes(maxSize)}</p>
        </div>

        {/* Error Messages */}
        {errors.length > 0 && (
          <div className="rounded-[16px] bg-pastelred/10 px-4 py-3 text-center">
            {errors.map((error, index) => (
              <p key={index} className="text-[12px] font-medium text-pastelred">
                {error}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Crop Dialog. Dismissing without saving (esc / outside click) is a
          cancel — otherwise the preview shows a photo the parent never received. */}
      {selectedFile && (
        <Dialog open={showCropDialog} onOpenChange={(open) => { if (!open) handleCancelCrop(); }}>
          <DialogContent className="rounded-4xl border-none p-6 sm:max-w-md" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">Adjust your photo</DialogTitle>
            </DialogHeader>
            <AvatarCropper
              file={selectedFile}
              onAreaChange={(src, area) => { cropStateRef.current = { src, area }; }}
            />
            <p className="text-center text-[12px] font-medium text-zinc-500">Drag to reposition · scroll or slide to zoom</p>
            <div className="mt-1 flex gap-2">
              <button
                onClick={handleCancelCrop}
                className="h-12 flex-1 cursor-pointer rounded-full bg-white/5 text-[14px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCrop}
                disabled={saving}
                className="h-12 flex-1 cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
