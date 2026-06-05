import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/client";
import { appToast } from "@/components/app-ui/app-toast";

interface UpdateProfileData {
    username?: string;
    displayName?: string;
    bio?: string;
    avatar?: File;
}

export function useUpdateProfile() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (data: UpdateProfileData) => {
            const formData = new FormData();

            if (data.username) formData.append("username", data.username);
            if (data.displayName) formData.append("displayName", data.displayName);
            if (data.bio !== undefined) formData.append("bio", data.bio);
            if (data.avatar) formData.append("avatar", data.avatar);

            const response = await fetch("/api/update-profile", {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "Failed to update profile");
            }

            return response.json();
        },
        onMutate: async (newData) => {
            // Cancel outgoing refetches
            await queryClient.cancelQueries({ queryKey: ["session"] });

            // Snapshot previous value
            const previousSession = queryClient.getQueryData(["session"]);

            // Optimistically update session
            queryClient.setQueryData(["session"], (old: any) => {
                if (!old?.data?.user) return old;
                return {
                    ...old,
                    data: {
                        ...old.data,
                        user: {
                            ...old.data.user,
                            ...(newData.username && { username: newData.username }),
                            ...(newData.displayName && { name: newData.displayName }),
                            ...(newData.bio !== undefined && { bio: newData.bio }),
                        },
                    },
                };
            });

            return { previousSession };
        },
        onError: (err, newData, context) => {
            // Rollback on error
            if (context?.previousSession) {
                queryClient.setQueryData(["session"], context.previousSession);
            }
            appToast.error(err instanceof Error ? err.message : "Failed to update profile");
        },
        onSuccess: async () => {
            // Refetch session to get fresh data from server
            await authClient.getSession({
                fetchOptions: { cache: "no-store" },
            });

            // Invalidate session query to trigger refetch
            queryClient.invalidateQueries({ queryKey: ["session"] });

            appToast.success("Profile updated successfully!");
        },
    });
}
