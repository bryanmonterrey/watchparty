"use client";

import * as React from "react";
import { X, Camera, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { UserType } from "@/db/schema/auth/user";
import { trpc } from "@/lib/trpc/client";
import { supabase } from "@/lib/supabase/client";
import { appToast } from "@/components/app-ui/app-toast";
import { cn } from "@/lib/utils";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { useRouter } from "next/navigation";
import type { Area } from "react-easy-crop";
import { AvatarCropper, getCroppedDataUrl } from "@/components/file-upload/avatar-cropper";
import { SOCIAL_PLATFORMS, SOCIAL_META, type SocialLinks } from "@/lib/profile/socials";

interface EditProfileDialogProps {
    user: UserType;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function EditProfileDialog({ user, open, onOpenChange }: EditProfileDialogProps) {
    const [name, setName] = React.useState(user.name || "");
    const [bio, setBio] = React.useState(user.bio || "");
    const [location, setLocation] = React.useState(user.location || "");
    const [website, setWebsite] = React.useState(user.website || "");
    const [socials, setSocials] = React.useState<SocialLinks>(user.socials ?? {});

    // Image states
    const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
    const [bannerFile, setBannerFile] = React.useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = React.useState<string | null>(user.avatar_url || user.image || null);
    const [bannerPreview, setBannerPreview] = React.useState<string | null>(user.banner_url || null);
    
    const [isSaving, setIsSaving] = React.useState(false);

    const router = useRouter();
    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const updateProfile = trpc.user.updateProfile.useMutation();
    const utils = trpc.useUtils();

    // Sync state with user prop when dialog opens
    React.useEffect(() => {
        if (open) {
            setName(user.name || "");
            setBio(user.bio || "");
            setLocation(user.location || "");
            setWebsite(user.website || "");
            setSocials(user.socials ?? {});
            setAvatarFile(null);
            setBannerFile(null);
            setAvatarPreview(user.avatar_url || user.image || null);
            setBannerPreview(user.banner_url || null);
        }
    }, [open, user]);

    // Picks route through the pan/zoom cropper (round 1:1 for avatars,
    // 3:1 rect for banners) instead of landing raw.
    const [cropTarget, setCropTarget] = React.useState<{ file: File; type: "avatar" | "banner" } | null>(null);
    const [cropSaving, setCropSaving] = React.useState(false);
    const cropStateRef = React.useRef<{ src: string; area: Area } | null>(null);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: "avatar" | "banner") => {
        const file = e.target.files?.[0];
        if (file) setCropTarget({ file, type });
        e.target.value = "";
    };

    const handleCropSave = async () => {
        const state = cropStateRef.current;
        if (!state || !cropTarget) return;
        setCropSaving(true);
        try {
            const isBanner = cropTarget.type === "banner";
            const dataUrl = await getCroppedDataUrl(
                state.src,
                state.area,
                isBanner ? { width: 1500, height: 500 } : { width: 512, height: 512 },
            );
            const blob = await (await fetch(dataUrl)).blob();
            const file = new File([blob], cropTarget.file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
            if (isBanner) {
                setBannerFile(file);
                setBannerPreview(dataUrl);
            } else {
                setAvatarFile(file);
                setAvatarPreview(dataUrl);
            }
            setCropTarget(null);
            cropStateRef.current = null;
        } finally {
            setCropSaving(false);
        }
    };

    const uploadImage = async (file: File, bucket: "avatars" | "banners") => {
        const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const { token, path } = await getPresignedUrl.mutateAsync({
            bucket,
            filename: sanitizedFileName,
            contentType: file.type
        });

        const { data, error } = await supabase.storage
            .from(bucket)
            .uploadToSignedUrl(path, token, file);

        if (error) throw error;
        
        // Get public URL
        const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(data.path);
        return publicUrl;
    };

    const handleSave = async () => {
        if (!name.trim()) {
            appToast.error("Name is required");
            return;
        }

        setIsSaving(true);
        try {
            let finalAvatarUrl = user.avatar_url;
            let finalBannerUrl = user.banner_url;

            if (avatarFile) {
                finalAvatarUrl = await uploadImage(avatarFile, "avatars");
            }

            if (bannerFile) {
                finalBannerUrl = await uploadImage(bannerFile, "banners");
            }

            // Drop empty values so the stored jsonb only holds real links.
            const cleanedSocials = Object.fromEntries(
                Object.entries(socials).filter(([, v]) => v && v.trim()),
            ) as SocialLinks;

            await updateProfile.mutateAsync({
                name,
                bio: bio || null,
                location: location || null,
                website: website || null,
                avatar_url: finalAvatarUrl,
                banner_url: finalBannerUrl,
                socials: cleanedSocials,
            });

            appToast.success("Profile updated!");
            utils.user.search.invalidate();
            onOpenChange(false);
            router.refresh();
        } catch (error: any) {
            console.error(error);
            appToast.error(error.message || "Failed to update profile");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[600px] p-0 overflow-hidden border-zinc-800 rounded-3xl sm:rounded-[32px] gap-0">
                <VisuallyHidden.Root>
                    <DialogTitle>Edit Profile</DialogTitle>
                </VisuallyHidden.Root>

                {/* Fixed Header */}
                <div className="flex items-center justify-between px-4 py-3 sticky top-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/5">
                    <div className="flex items-center gap-4">
                        <Button 
                            variant="ghost" 
                            size="icon" 
                            className="rounded-full hover:bg-zinc-900"
                            onClick={() => onOpenChange(false)}
                        >
                            <X size={20} className="text-white" />
                        </Button>
                        <h2 className="text-xl font-black text-white tracking-tight">Edit profile</h2>
                    </div>
                    <Button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="bg-white text-black hover:bg-zinc-200 rounded-full px-6 font-black h-9 text-sm"
                    >
                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : "Save"}
                    </Button>
                </div>

                {/* Scrollable Content */}
                <div className="max-h-[80vh] overflow-y-auto custom-scrollbar pt-0">
                    {/* Banner Section */}
                    <div className="relative h-[200px] w-full bg-zinc-900 group">
                        {bannerPreview ? (
                            <img 
                                src={bannerPreview} 
                                alt="Banner" 
                                className="w-full h-full object-cover opacity-60"
                            />
                        ) : (
                            <div className="size-full bg-gradient-to-br from-indigo-900/20 to-zinc-900" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center gap-4 opacity-100">
                            <label className="size-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center cursor-pointer hover:bg-black/70 transition-colors">
                                <Camera size={20} className="text-white" />
                                <input 
                                    type="file" 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={(e) => handleImageChange(e, "banner")} 
                                />
                            </label>
                            {bannerPreview && (
                                <button 
                                    onClick={() => {
                                        setBannerFile(null);
                                        setBannerPreview(null);
                                    }}
                                    className="size-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-black/70 transition-colors"
                                >
                                    <X size={20} className="text-white" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Avatar Section */}
                    <div className="relative px-4 -mt-[48px] mb-12">
                        <div className="relative size-[112px] group">
                            <div className="size-full rounded-full border-4 border-black bg-zinc-900 overflow-hidden ring-1 ring-white/10">
                                {avatarPreview ? (
                                    <img 
                                        src={avatarPreview} 
                                        alt="Avatar" 
                                        className="w-full h-full object-cover opacity-70"
                                    />
                                ) : (
                                    <div className="size-full flex items-center justify-center text-zinc-700 font-bold text-3xl uppercase">
                                        {user.username?.[0]}
                                    </div>
                                )}
                            </div>
                            <div className="absolute inset-0 flex items-center justify-center">
                                <label className="size-10 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center justify-center cursor-pointer hover:bg-black/70 transition-colors">
                                    <Camera size={20} className="text-white" />
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept="image/*" 
                                        onChange={(e) => handleImageChange(e, "avatar")} 
                                    />
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Form Fields */}
                    <div className="flex flex-col gap-6 p-6 pt-0">
                        <div className="space-y-2 group">
                            <Label className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-black ml-1 group-focus-within:text-white transition-colors">
                                Name
                            </Label>
                            <Input 
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="h-14"
                                placeholder="Display name"
                                maxLength={50}
                            />
                        </div>

                        <div className="space-y-2 group">
                            <Label className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-black ml-1 group-focus-within:text-white transition-colors">
                                Bio
                            </Label>
                            <Textarea 
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                className="min-h-[100px] bg-zinc-900/50 border-white/5 rounded-2xl p-4 text-white focus:ring-1 focus:ring-white/20 transition-all resize-none"
                                placeholder="A bit about yourself..."
                                maxLength={160}
                            />
                            <div className="flex justify-end pr-1">
                                <span className={cn(
                                    "text-[10px] font-bold tracking-widest uppercase",
                                    bio.length >= 160 ? "text-red-500" : "text-zinc-600"
                                )}>
                                    {bio.length}/160
                                </span>
                            </div>
                        </div>

                        <div className="space-y-2 group">
                            <Label className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-black ml-1 group-focus-within:text-white transition-colors">
                                Location
                            </Label>
                            <Input 
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                className="h-14"
                                placeholder="E.g. Miami, FL"
                                maxLength={100}
                            />
                        </div>

                        <div className="space-y-2 group">
                            <Label className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-black ml-1 group-focus-within:text-white transition-colors">
                                Website
                            </Label>
                            <Input
                                value={website}
                                onChange={(e) => setWebsite(e.target.value)}
                                className="h-14"
                                placeholder="https://yourwebsite.com"
                                maxLength={100}
                            />
                        </div>

                        <div className="space-y-3">
                            <Label className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-black ml-1">
                                Social links
                            </Label>
                            <p className="ml-1 text-xs text-zinc-600">
                                Shown on your About tab. Handles or full URLs both work.
                            </p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {SOCIAL_PLATFORMS.map((platform) => (
                                    <div key={platform} className="space-y-1">
                                        <span className="ml-1 text-[11px] font-bold text-zinc-500">
                                            {SOCIAL_META[platform].label}
                                        </span>
                                        <Input
                                            value={socials[platform] ?? ""}
                                            onChange={(e) => setSocials((s) => ({ ...s, [platform]: e.target.value }))}
                                            placeholder={SOCIAL_META[platform].placeholder}
                                            className="h-11"
                                            maxLength={200}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>

            {/* Crop dialog (nested; dismissing = cancel) */}
            {cropTarget && (
                <Dialog open onOpenChange={(o) => { if (!o) { setCropTarget(null); cropStateRef.current = null; } }}>
                    <DialogContent className="rounded-4xl border-none p-6 sm:max-w-md" showCloseButton={false}>
                        <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">
                            {cropTarget.type === "banner" ? "Adjust your banner" : "Adjust your photo"}
                        </DialogTitle>
                        <AvatarCropper
                            file={cropTarget.file}
                            aspect={cropTarget.type === "banner" ? 3 : 1}
                            shape={cropTarget.type === "banner" ? "rect" : "round"}
                            onAreaChange={(src, area) => { cropStateRef.current = { src, area }; }}
                        />
                        <p className="text-center text-[12px] font-medium text-zinc-500">Drag to reposition · scroll or slide to zoom</p>
                        <div className="mt-1 flex gap-2">
                            <button
                                onClick={() => { setCropTarget(null); cropStateRef.current = null; }}
                                className="h-12 flex-1 cursor-pointer rounded-full bg-white/5 text-[14px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCropSave}
                                disabled={cropSaving}
                                className="h-12 flex-1 cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-60"
                            >
                                {cropSaving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </Dialog>
    );
}
