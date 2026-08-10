'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useComposerDraft } from '@/hooks/use-composer-drafts';
import { useComposerKeys } from '@/hooks/use-composer-keys';
import { ClipIcon, ArrowUpIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Send, Paperclip } from "lucide-react";
import { Textarea } from '@/components/ui/textarea';
import { useChat } from './chat-context';
import { useSendMessage, useMessages } from '@/hooks/use-messages';
import { trpc } from '@/lib/trpc/client';
import { useAuthSession } from '@/hooks/use-auth-session';
import { cn } from '@/lib/utils';
import { ComposerReplyBanner } from '@/components/ui/composer-reply-banner';
import { useEncryption } from '@/hooks/use-encryption';
import { EmojiPicker } from './emoji-picker';
import { AudioRecorder } from './audio-recorder';

interface MessageInputProps {
    conversationId: string;
}

export function MessageInput({ conversationId }: MessageInputProps) {
    // Per-conversation draft, so leaving a thread mid-sentence and coming back
    // keeps what you were writing. Same hook the community composer uses.
    const { value: message, setValue: setMessage, clear: clearDraft } = useComposerDraft(conversationId);
    const { attachment, setAttachment, replyToMessage, setReplyToMessage } = useChat();
    const { sendMessage, isSending } = useSendMessage(conversationId);

    // Unified Realtime & Messages Hook
    const {
        messages,
        isLoading: isLoadingMessages,
        error: messagesError,
        isConnected,
        typingUsers,
        setTyping
    } = useMessages(conversationId);

    // Memoized handlers to prevent effect dependencies from changing
    const handleStartTyping = useCallback(() => {
        setTyping(true);
    }, [setTyping]);

    const handleStopTyping = useCallback(() => {
        setTyping(false);
    }, [setTyping]);

    // Image Preview State
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // Create/Revoke Object URL for Image Preview
    useEffect(() => {
        if (attachment && attachment.type.startsWith('image/')) {
            const url = URL.createObjectURL(attachment);
            setPreviewUrl(url);
            return () => URL.revokeObjectURL(url);
        } else {
            setPreviewUrl(null);
        }
    }, [attachment]);

    // Cleanup on unmount only
    useEffect(() => {
        return () => {
            handleStopTyping();
        };
    }, [handleStopTyping]);

    // Fetch conversation participants to get recipient's public key
    const { data: participantsData } = trpc.conversation.getParticipants.useQuery({
        conversationId,
    });

    // Get current user to filter out self
    const { data: session } = useAuthSession();
    const currentUserId = session?.user?.id;

    // Find the other participant (recipient)
    const otherParticipantId = participantsData?.participants?.find(
        (p) => p.userId !== currentUserId
    )?.userId;

    // Use other participant, or fallback to self (for encryption to self)
    const recipientUserId = otherParticipantId || currentUserId;

    const { data: keyData, isLoading: isLoadingKey } = trpc.encryption.getPublicKey.useQuery(
        { userId: recipientUserId || '' },
        { enabled: !!recipientUserId }
    );

    const recipientPublicKey = keyData?.publicKey || '';

    const handleSend = async () => {
        const textToSend = message.trim();
        // Allow sending if there is text OR an attachment
        if ((!textToSend && !attachment) || isSending) return;

        // Check if encryption is available
        if (!recipientPublicKey) {
            console.warn('No encryption key available - messages will not be encrypted');
            return;
        }

        // Optimistic UI: Clear immediately
        clearDraft();
        const fileToSend = attachment; // Capture ref
        setAttachment(null);

        // Reset height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        try {
            // Stop typing immediately (fire and forget)
            handleStopTyping();

            const replyToId = replyToMessage?.id;
            // Clear reply state immediately for optimistic UI
            if (replyToMessage) setReplyToMessage(null);

            await sendMessage(textToSend, recipientPublicKey, 'text', fileToSend || undefined, replyToId);
        } catch (error) {
            console.error('Failed to send message:', error);
            // Restore message on error (optional, but good UX)
            setMessage(textToSend);
            if (fileToSend) setAttachment(fileToSend);
            // Restore reply state if it failed? (maybe complex, ignore for now)
        }
    };

    // Shared keyboard contract. Replaces a bare `Enter && !shiftKey` check,
    // which also sent on Cmd/Ctrl/Alt+Enter and had no Escape handling at all.
    const handleKeyDown = useComposerKeys({
        onSubmit: () => { handleSend(); },
        getValue: () => message,
        onCancelReply: () => {
            if (!replyToMessage) return false;
            setReplyToMessage(null);
            return true;
        },
    });

    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustHeight = () => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
        }
    };

    // Handle typing indicators
    useEffect(() => {
        adjustHeight(); // Initial adjust

        if (message.length > 0) {
            handleStartTyping();

            const timeout = setTimeout(() => {
                handleStopTyping();
            }, 2000); // Reduced to 2s for better responsiveness

            return () => clearTimeout(timeout);
        } else {
            // console.log('[TypingDebug] UI: Input empty, stopping typing');
            handleStopTyping();
        }
    }, [message, handleStartTyping, handleStopTyping]);

    const placeholder = isLoadingKey
        ? "Setting up encryption..."
        : recipientPublicKey
            ? "Message"
            : "Recipient hasn't set up encryption yet. Ask them to open the chat.";

    const handleEmojiSelect = (emoji: any) => {
        // The draft hook takes a value, not an updater — `message` is already
        // the current text.
        setMessage(message + emoji.native);
        adjustHeight();
    };


    const [isRecording, setIsRecording] = useState(false);

    const handleSendAudio = async (blob: Blob) => {
        if (!recipientPublicKey) return;

        const file = new File([blob], "voice-message.webm", { type: "audio/webm" });
        try {
            await sendMessage("", recipientPublicKey, 'audio', file);
        } catch (error) {
            console.error("Failed to send audio:", error);
        }
    };

    return (
        <div className="flex flex-col gap-2">
            {replyToMessage && (
                <ComposerReplyBanner
                    name={replyToMessage.senderId === currentUserId ? "You" : "User"}
                    // Non-text replies quote their KIND, not their payload —
                    // "📷 Image" is the useful preview of an image, and the raw
                    // content field would be a URL or a blob reference.
                    preview={
                        replyToMessage.messageType === "image" ? "📷 Image"
                            : replyToMessage.messageType === "audio" ? "🎤 Voice Message"
                                : replyToMessage.messageType === "file" ? "📄 File"
                                    : replyToMessage.content
                    }
                    onCancel={() => setReplyToMessage(null)}
                    className="mx-2 rounded-b-2xl border-b"
                />
            )}

            <div className={cn(
                "border rounded-4xl border-zinc-800/50 px-4 py-3 backdrop-blur-sm transition-all duration-300",
                replyToMessage && "rounded-t-4xl border-t-0" // Connect visually? No, separate looks cleaner with gap-2
            )}>
                <div className="flex items-center gap-3">
                    {/* Emoji Picker Button - Hide when recording */}
                    {!isRecording && (
                        <EmojiPicker
                            onEmojiSelect={handleEmojiSelect}
                            className="h-10 w-10 hover:bg-zinc-800"
                            iconClassName="size-6"
                        />
                    )}

                    {/* Text Input Container - Hide when recording */}
                    {!isRecording && (
                        <div className="flex-1 relative min-w-0 flex flex-col bg-zinc-800/50 rounded-2xl border border-zinc-800/50 focus-within:ring-1 focus-within:ring-white/20 transition-all">
                            {/* Attachment Preview */}
                            {attachment && (
                                <div className="mx-3 mt-3 mb-1 w-fit">
                                    {previewUrl ? (
                                        <div className="relative group/preview inline-block">
                                            <img
                                                src={previewUrl}
                                                alt="Preview"
                                                className="h-12 w-auto rounded-lg border border-flexwhite/15 object-cover bg-zinc-900/50"
                                            />
                                            <button
                                                onClick={() => setAttachment(null)}
                                                className="absolute -top-2 -right-2 bg-zinc-800 rounded-full p-1 border border-zinc-600 shadow-sm opacity-100 hover:bg-zinc-700 transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 hover:text-white">
                                                    <path d="M18 6 6 18" />
                                                    <path d="M6 6 18 18" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2 bg-zinc-700/50 px-3 py-1.5 rounded-lg border border-flexwhite/15">
                                            <ClipIcon className="size-4 text-zinc-400" />
                                            <span className="text-sm text-zinc-200 max-w-[200px] truncate">{attachment.name}</span>
                                            <button onClick={() => setAttachment(null)} className="ml-2 hover:bg-zinc-600/50 p-0.5 rounded-full transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400 hover:text-white">
                                                    <path d="M18 6 6 18" />
                                                    <path d="M6 6 18 18" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            <Textarea
                                ref={textareaRef}
                                placeholder={attachment ? "Message" : placeholder}
                                value={message}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                                    setMessage(e.target.value);
                                    adjustHeight();
                                }}
                                onKeyDown={handleKeyDown}
                                disabled={!recipientPublicKey}
                                className="bg-none border-none px-4 py-3 focus-visible:ring-0 resize-none min-h-[60px] max-h-[120px] overflow-y-auto w-full shadow-none text-zinc-100 placeholder:text-zinc-500 text-base"
                                rows={1}
                            />
                        </div>
                    )}

                    {/* Send Button - Hide when recording or when empty (to show Mic) */}
                    {!isRecording && (message.trim() || attachment) ? (
                        <Button
                            onClick={handleSend}
                            disabled={(!message.trim() && !attachment) || !recipientPublicKey}
                            className={cn(
                                'h-10 w-10 flex-shrink-0 rounded-full p-0',
                                (message.trim() || attachment) && recipientPublicKey
                                    ? 'bg-white/90 hover:bg-white'
                                    : 'bg-zinc-800 text-white/40 cursor-not-allowed'
                            )}
                        >
                            <ArrowUpIcon className="size-5" width={20} height={20} />
                        </Button>
                    ) : (
                        // Render Mic button (AudioRecorder) when not sending text
                        // Logic: If isRecording, AudioRecorder takes full width (flex-1).
                        // If not recording and input empty, AudioRecorder is just a button.
                        <div className={cn(isRecording ? "flex-1 transition-all duration-300" : "")}>
                            <AudioRecorder
                                onSend={handleSendAudio}
                                onStateChange={setIsRecording}
                                disabled={!recipientPublicKey}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
