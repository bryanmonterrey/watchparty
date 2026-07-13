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
            setAvatarFile(null);
            setBannerFile(null);
            setAvatarPreview(user.avatar_url || user.image || null);
            setBannerPreview(user.banner_url || null);
        }
    }, [open, user]);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: "avatar" | "banner") => {
        const file = e.target.files?.[0];
        if (file) {
            if (type === "avatar") {
                setAvatarFile(file);
                setAvatarPreview(URL.createObjectURL(file));
            } else {
                setBannerFile(file);
                setBannerPreview(URL.createObjectURL(file));
            }
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

            await updateProfile.mutateAsync({
                name,
                bio: bio || null,
                location: location || null,
                website: website || null,
                avatar_url: finalAvatarUrl,
                banner_url: finalBannerUrl,
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
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
