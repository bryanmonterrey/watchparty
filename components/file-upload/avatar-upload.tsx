'use client';

import { useState } from 'react';
import { formatBytes, useFileUpload, type FileWithPreview } from '@/hooks/use-file-upload';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Button } from '@/components/ui/button';
import { TriangleAlert, User, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  ImageCrop,
  ImageCropContent,
  ImageCropApply,
  ImageCropReset,
} from '@/components/ui/shadcn-io/image-crop';

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

  const handleCropComplete = (croppedImage: string) => {
    setCroppedImageUrl(croppedImage);

    // Convert base64 to File object
    fetch(croppedImage)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], selectedFile?.name || 'avatar.png', { type: 'image/png' });
        const fileWithPreview: FileWithPreview = {
          id: crypto.randomUUID(),
          file,
          preview: croppedImage,
        };
        onFileChange?.(fileWithPreview);
      });

    setShowCropDialog(false);
  };

  const handleCancelCrop = () => {
    setShowCropDialog(false);
    setSelectedFile(null);
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
              'group/avatar relative h-24 w-24 cursor-pointer overflow-hidden rounded-full border border-dashed transition-colors',
              isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/20',
              previewUrl && 'border-solid',
            )}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={openFileDialog}
          >
            <input {...getInputProps()} className="sr-only" />

            {previewUrl ? (
              <img src={previewUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <User className="size-6 text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Remove Button - only show when file is uploaded */}
          {(currentFile || croppedImageUrl) && (
            <Button
              size="icon"
              variant="outline"
              onClick={handleRemove}
              className="size-6 absolute end-0 top-0 rounded-full"
              aria-label="Remove avatar"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>

        {/* Upload Instructions */}
        <div className="text-center space-y-0.5">
          <p className="text-sm font-medium">{currentFile || croppedImageUrl ? 'Avatar uploaded' : 'Upload avatar'}</p>
          <p className="text-xs text-muted-foreground">PNG, JPG up to {formatBytes(maxSize)}</p>
        </div>

        {/* Error Messages */}
        {errors.length > 0 && (
          <Alert variant="destructive" className="mt-5">
            <TriangleAlert />
            <AlertTitle>File upload error(s)</AlertTitle>
            <AlertDescription>
              {errors.map((error, index) => (
                <p key={index} className="last:mb-0">
                  {error}
                </p>
              ))}
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Crop Dialog. Dismissing without applying (esc / outside click) is a
          cancel — otherwise the preview shows a photo the parent never received. */}
      {selectedFile && (
        <Dialog open={showCropDialog} onOpenChange={(open) => { if (!open) handleCancelCrop(); }}>
          <DialogContent className="sm:max-w-lg rounded-4xl border-none" showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>Crop Avatar</DialogTitle>
            </DialogHeader>
            <ImageCrop
              file={selectedFile}
              aspect={1}
              circularCrop
              onCrop={handleCropComplete}
            >
              <div className="flex flex-col gap-4">
                <ImageCropContent />
                <DialogFooter className="flex gap-2 py-1">
                  <Button className='rounded-full py-6 px-8 bg-zinc-600/30 cursor-pointer hover:bg-zinc-600/40 font-semibold text-lg text-white' onClick={handleCancelCrop}>
                    Cancel
                  </Button>
                  <div className="flex items-center gap-2">
                    <ImageCropReset className="rounded-full" />
                    <ImageCropApply asChild>
                      <Button className="rounded-full py-6 px-8 bg-white text-black hover:bg-white/85 font-semibold text-lg cursor-pointer">
                        Apply Crop
                      </Button>
                    </ImageCropApply>
                  </div>
                </DialogFooter>
              </div>
            </ImageCrop>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
