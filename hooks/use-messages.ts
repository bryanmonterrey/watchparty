import { trpc } from '@/lib/trpc/client';
import { useEncryption } from './use-encryption';
import { useOfflineQueue } from './use-offline-queue';
import { useCallback } from 'react';
import { logger } from '@/lib/logger';
import { useMessagesContext, DM_PAGE_LIMIT } from '@/components/messages/messages-provider';
import { useAuthSession } from '@/hooks/use-auth-session';

interface DecryptedMessage {
    id: string;
    conversationId: string;
    senderId: string;
    content: string; // Decrypted content
    encryptionIv: string; // Keep IV for message bubble
    messageType: string;
    createdAt: string;
    editedAt?: string;
    isDecrypted: boolean;
    replyToMessage?: {
        id: string;
        content: string;
        senderId: string;
        messageType?: string;
        attachmentUrl?: string | null;
    } | null;
}

/**
 * Hook for managing messages in a conversation with E2E encryption
 */
/**
 * Hook for consuming messages from context
 * Can only be used inside MessagesProvider
 */
export function useMessages(conversationId: string) {
    // If we passed an ID that doesn't match context, we technically can't support it 
    // without refactoring context to support multiple conversations.
    // For this app, we assume 1 active conversation at a time.
    const context = useMessagesContext();

    if (context.conversationId !== conversationId) {
        console.warn('useMessages called with different ID than provider', { expected: context.conversationId, actual: conversationId });
    }

    return context;
}

/**
 * Hook for sending messages
 */
export function useSendMessage(conversationId: string) {
    const { encryptMessage, publicKey } = useEncryption();
    const { addToQueue } = useOfflineQueue();
    const utils = trpc.useUtils();
    const { data: session } = useAuthSession();

    // Remove onMutate and onError from useMutation setup to handle manually
    const mutation = trpc.message.send.useMutation({
        onSettled: () => {
            // Always refetch after error or success:
            utils.message.list.invalidate({ conversationId });
            utils.conversation.list.invalidate();
        },
    });

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();



    const sendMessage = useCallback(
        async (content: string, recipientPublicKey: string, messageType: 'text' | 'image' | 'file' | 'audio' | 'system' | 'transaction_send' | 'transaction_request' = 'text', attachmentFile?: File, replyToId?: string) => {
            // The cache entry to patch. `message.list` is a REGULAR query
            // (`messages-provider.tsx`), not an infinite one, and its key
            // includes the limit — so this input has to match that call
            // exactly. It previously used `getInfiniteData/setInfiniteData`
            // with `{ conversationId }`, which missed on both counts: the
            // optimistic message was written to an entry nothing subscribed
            // to, so a sent DM only appeared after the server round trip and
            // the invalidate-driven refetch, and this snapshot was always
            // `undefined`, so the catch below rolled back nothing.
            const listInput = { conversationId, limit: DM_PAGE_LIMIT };
            const previousMessages = utils.message.list.getData(listInput);

            try {
                // ... (optimistic logic stays same)

                // 2. Inject Optimistic Message IMMEDIATELY
                // ... (logic from original file needed here? No, I am replacing the block around line 66-something? No wait.)

                // Wait, I need to be careful not to overwrite the optimistic logic if I target a large block.
                // The previous edit replaced the inner part of 'try'.
                // Now I need to insert the mutation init at the top, AND fix the inner part.

                // Let's do this in TWO steps to be safe.
                // Step 1: Add mutation init.
                // Step 2: Implement logic in the placeholder.

                // 1. Determine local URL for immediate preview
                let optimisticAttachmentUrl: string | null = null;
                if (attachmentFile) {
                    optimisticAttachmentUrl = URL.createObjectURL(attachmentFile);

                    // Helper to determine type if generic 'text' passed
                    if (messageType === 'text') {
                        if (attachmentFile.type.startsWith('image/')) {
                            messageType = 'image';
                        } else if (attachmentFile.type.startsWith('audio/')) {
                            messageType = 'audio';
                        } else {
                            messageType = 'file';
                        }
                    }
                }

                // 2. Inject Optimistic Message IMMEDIATELY (Plain Text, marked isDecrypted)
                const fallbackContent = messageType === 'image' ? 'Sent an image' : (messageType === 'audio' ? 'Sent a voice message' : 'Sent a file');
                const optimisticContent = content || fallbackContent;

                utils.message.list.setData(listInput, (old) => {
                    if (!old) return old;

                    const optimisticMessage = {
                        id: `optimistic-${Date.now()}`,
                        conversationId,
                        senderId: session?.user?.id || 'me',
                        content: optimisticContent, // Plain text for local view
                        encryptionIv: '', // Not needed for local view
                        messageType,
                        attachmentUrl: optimisticAttachmentUrl, // Local Blob URL
                        isDecrypted: true, // Flag to skip provider decryption
                        isEncrypted: false,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        deletedAt: null,
                        editedAt: null,
                        replyToId: replyToId || null,
                        reactions: [],
                        readReceipts: [],
                        replyToMessage: null,
                    };

                    // APPEND, don't prepend: `message.list` reverses its rows
                    // to oldest-first before returning, so the newest message
                    // is the LAST element. (The old code prepended — invisible
                    // then, because none of this reached the cache at all.)
                    return { ...old, messages: [...old.messages, optimisticMessage] };
                });

                // 3. Encrypt (Async)
                const { ciphertext, iv } = await encryptMessage(optimisticContent, recipientPublicKey);

                // 4. Handle file upload (Async)
                let finalAttachmentUrl: string | undefined;
                if (attachmentFile) {
                    // 1. Get Presigned URL
                    const sanitizedFileName = attachmentFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const { token, path } = await getPresignedUrl.mutateAsync({
                        bucket: 'attachments',
                        filename: sanitizedFileName,
                        contentType: attachmentFile.type
                    });

                    // 2. Upload using Supabase Client with Signed URL
                    const { supabase } = await import('@/lib/supabase/client');

                    const { data, error } = await supabase.storage
                        .from('attachments')
                        .uploadToSignedUrl(path, token, attachmentFile);

                    if (error) {
                        throw new Error(`Upload failed: ${error.message}`);
                    }

                    // Store path (or public URL if we want)
                    // For attachments, we previously used Public URL.
                    // If bucket is strictly private, we should store path.
                    // But 'useMessages' hook probably expects a URL to render?
                    // Currently 'attachments' bucket IS public (as per previous convo).
                    // So we can still get public URL.
                    // But if we want to change it to Private later, we should store path.
                    // For now, let's store the fullPath so we are consistent with other uploaders.
                    // BUT: the message renderer likely just puts this in <img src>.
                    // If we store path, <img src="userId/file.png"> won't work.
                    // We need a solution for rendering private images.
                    // Easiest for now: Generate Public URL (assuming bucket is Public).
                    // The signed upload ensures AUTHENTICATED upload, but read can remain public for now.
                    // OR: We generate a signed URL for reading? (Expiring)
                    // Let's stick to what we had: Get Public URL.
                    // Since the previous code worked with Public URL, let's keep it.
                    // Even with signed upload, the file ends up in the bucket.

                    const { data: urlData } = supabase.storage
                        .from('attachments')
                        .getPublicUrl(path);
                    // Note: uploadToSignedUrl returns data.path which is the key.

                    finalAttachmentUrl = urlData.publicUrl;
                }

                // 5. Send Mutation with Remote URL
                const messageData = {
                    conversationId,
                    content: ciphertext,
                    encryptionIv: iv,
                    messageType,
                    attachmentUrl: finalAttachmentUrl,
                    replyToId,
                };

                await mutation.mutateAsync(messageData);

                logger.info('Message sent', { conversationId });

            } catch (error) {
                logger.error('Failed to send message', error as Error, { conversationId });
                // Rollback
                if (previousMessages) {
                    utils.message.list.setData(listInput, previousMessages);
                }
                throw error;
            }
        },
        [conversationId, encryptMessage, mutation, utils, session?.user?.id, getPresignedUrl]
    );

    return {
        sendMessage,
        isSending: mutation.isPending,
        error: mutation.error,
    };
}

/**
 * Hook for typing indicators using Supabase Presence
 */
export function useTypingIndicator(conversationId: string) {
    const { setTyping, typingUsers } = useMessagesContext();

    const startTyping = useCallback(() => {
        setTyping(true);
    }, [setTyping]);

    const stopTyping = useCallback(() => {
        setTyping(false);
    }, [setTyping]);

    return {
        typingUsers,
        startTyping,
        stopTyping,
    };
}
