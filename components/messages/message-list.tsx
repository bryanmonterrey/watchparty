"use client";

import { useEffect, useRef, useLayoutEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageBubble } from './message-bubble';
import { DM_PAGE_LIMIT } from "@/components/messages/messages-provider";
import { useMessages } from '@/hooks/use-messages';
import { useChat } from './chat-context';
import { useAuthSession } from '@/hooks/use-auth-session';
import { trpc } from '@/lib/trpc/client';
import { EmptyState } from './empty-state';
import { DayDivider } from '@/components/ui/day-divider';
import { formatDayHeading, isSameCalendarDay } from '@/lib/chat/day-heading';
import { isContinuation } from '@/lib/community/message-grouping';

interface MessageListProps {
    conversationId: string;
}

export function MessageList({ conversationId }: MessageListProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const { data: session } = useAuthSession();
    const { messages, isLoading, typingUsers } = useMessages(conversationId);
    const { setReplyToMessage } = useChat();
    const utils = trpc.useUtils();

    // Optimistic, like every other message action. DM reactions are a FLAT list
    // of {id, emoji, userId} rather than the aggregated {emoji, count} shape
    // community chat uses, so the toggle adds or drops one entry for the
    // current user instead of moving a counter.
    const listInput = { conversationId, limit: DM_PAGE_LIMIT };
    const toggleReaction = trpc.message.toggleReaction.useMutation({
        onMutate: async ({ messageId, emoji }) => {
            const me = session?.user?.id;
            if (!me) return;
            await utils.message.list.cancel(listInput);
            const previous = utils.message.list.getData(listInput);
            utils.message.list.setData(listInput, (old) => {
                if (!old?.messages) return old;
                return {
                    ...old,
                    messages: old.messages.map((m: any) => {
                        if (m.id !== messageId) return m;
                        const existing = (m.reactions ?? []).find(
                            (r: any) => r.emoji === emoji && r.userId === me,
                        );
                        return {
                            ...m,
                            reactions: existing
                                ? (m.reactions ?? []).filter((r: any) => r !== existing)
                                : [
                                    ...(m.reactions ?? []),
                                    // `optimistic-` id so it's obvious in a
                                    // dump which row hasn't been confirmed.
                                    { id: `optimistic-${Date.now()}`, emoji, userId: me, messageId },
                                ],
                        };
                    }),
                };
            });
            return { previous };
        },
        onError: (_err, _vars, context) => {
            if (context?.previous) utils.message.list.setData(listInput, context.previous);
        },
        onSettled: () => {
            utils.message.list.invalidate({ conversationId });
        },
    });

    const handleReaction = (messageId: string, emoji: string) => {
        toggleReaction.mutate({ messageId, emoji });
    };

    const handleReply = (message: any) => {
        setReplyToMessage({
            id: message.id,
            content: message.content,
            senderId: message.senderId,
            senderName: 'User', // We don't have name yet easily, standardizing for now
        });
    };

    const markAsRead = trpc.message.markAsRead.useMutation({
        onError: (err) => {
            console.error('Failed to mark messages as read:', err);
        }
    });

    // Intersection Observer for Read Receipts
    useEffect(() => {
        if (!session?.user?.id || isLoading || messages.length === 0) return;

        const observer = new IntersectionObserver((entries) => {
            const viewedMessageIds: string[] = [];

            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    const messageId = entry.target.getAttribute('data-message-id');
                    const senderId = entry.target.getAttribute('data-sender-id');

                    if (messageId && senderId && senderId !== session.user.id) {
                        viewedMessageIds.push(messageId);
                        // Stop observing once seen
                        observer.unobserve(entry.target);
                    }
                }
            });

            if (viewedMessageIds.length > 0) {
                markAsRead.mutate({ conversationId, messageIds: viewedMessageIds });
            }
        }, {
            root: scrollRef.current?.parentElement, // ScrollArea viewport
            threshold: 0.5 // 50% visible
        });

        // Target all unread messages from others
        const unreadElements = document.querySelectorAll(`[data-unread="true"]`);
        unreadElements.forEach(el => observer.observe(el));

        return () => observer.disconnect();
    }, [messages.length, session?.user?.id, isLoading, conversationId]);

    const containerRef = useRef<HTMLDivElement>(null);

    // Initial load state
    const isInitialLoad = useRef(true);

    // Reset initial load state when conversation changes
    useEffect(() => {
        isInitialLoad.current = true;
    }, [conversationId]);

    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        // For auto/instant scrolling (initial load), scrollIntoView is often more robust
        // at anchoring to the bottom element vs setting scrollTop
        if (behavior === 'auto' && scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
            return;
        }

        // Try to find the viewport first for direct control for smooth scrolling
        const container = containerRef.current;
        if (container) {
            const viewport = container.closest('[data-slot="scroll-area-viewport"]') as HTMLElement;
            if (viewport) {
                viewport.scrollTo({ top: viewport.scrollHeight, behavior });
                return;
            }
        }

        // Fallback to scrollIntoView
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior, block: 'end' });
        }
    };

    // 1. Trigger scroll when messages/typing changes
    // Use useLayoutEffect to trigger scroll before paint if possible
    useLayoutEffect(() => {
        // If we are initializing, or if we are already at the bottom, force scroll
        if (isInitialLoad.current || isAtBottomRef.current) {
            const behavior = isInitialLoad.current ? 'auto' : 'smooth';
            scrollToBottom(behavior);

            // Double check after a small delay to handle layout shifts (images, etc)
            setTimeout(() => {
                if (isAtBottomRef.current || isInitialLoad.current) {
                    scrollToBottom(behavior);
                }
            }, 100);
        }
    }, [messages.length, typingUsers.length, conversationId]);

    // 2. Handle dynamic size changes (images loading) with "Sticky Bottom" logic
    // We need to track if the user WAS at the bottom before the resize happened.
    const isAtBottomRef = useRef(true);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return; // Wait for mount

        // Find the actual scrolling viewport (Radix ScrollArea Viewport)
        const viewport = container.closest('[data-slot="scroll-area-viewport"]') as HTMLElement;
        if (!viewport) return;

        const handleScroll = () => {
            const { scrollTop, scrollHeight, clientHeight } = viewport;
            const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
            // Update our knowledge of where the user is (tolerance 100px)
            isAtBottomRef.current = distanceFromBottom < 100;
        };

        viewport.addEventListener('scroll', handleScroll);

        const observer = new ResizeObserver(() => {
            if (isInitialLoad.current || isAtBottomRef.current) {
                // If we are initialized and either loading OR were previously at bottom,
                // keep us at the bottom.
                scrollToBottom('auto');
            }
        });

        observer.observe(container);

        // Turn off initial load mode after a reasonable time
        // Increased to 1000ms to ensure all content/images have time to layout
        const timeout = setTimeout(() => {
            scrollToBottom('auto');
            isInitialLoad.current = false;
        }, 1000);

        return () => {
            observer.disconnect();
            viewport.removeEventListener('scroll', handleScroll);
            clearTimeout(timeout);
        };
    }, [conversationId]); // Re-attach if conversation changes to reset refs properly

    if (isLoading) {
        // Mock a realistic conversation flow
        const mockMessages = [
            { isSent: false, width: 'w-[280px]', height: 'h-10' },
            { isSent: false, width: 'w-[180px]', height: 'h-10' },
            { isSent: true,  width: 'w-[320px]', height: 'h-16' },
            { isSent: false, width: 'w-[220px]', height: 'h-10' },
            { isSent: true,  width: 'w-[160px]', height: 'h-10' },
            { isSent: true,  width: 'w-[120px]', height: 'h-10' },
        ];

        return (
            <div className="flex-1 px-6 py-4 space-y-4 overflow-hidden">
                {mockMessages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.isSent ? 'items-end' : 'items-start'}`}>
                        <div className={`shimmer-skeleton ${msg.height} ${msg.width} rounded-2xl`} />
                    </div>
                ))}
            </div>
        );
    }

    if (messages.length === 0) {
        // Still show typing indicator even in empty state
        return (
            <div className="flex-1 h-full min-h-0 min-w-0 flex flex-col">
                <div className="flex-1">
                    <EmptyState />
                </div>
                {typingUsers.length > 0 && (
                    <div className="px-6 py-4">
                        <TypingIndicator conversationId={conversationId} currentUserId={session?.user?.id} typingUsers={typingUsers} />
                    </div>
                )}
            </div>
        )
    }

    const handleImageLoad = () => {
        if (isInitialLoad.current || isAtBottomRef.current) {
            scrollToBottom('auto');
        }
    };

    return (
        <div className="flex-1 h-full min-h-0 min-w-0 overflow-y-visible">
            <ScrollArea className="h-full px-6 overflow-y-visible">
                <div className="space-y-4 overflow-y-visible" ref={containerRef}>
                    {messages.map((message, index) => {
                        // Check if I have read this message
                        const isReadByMe = message.readReceipts?.some(r => r.userId === session?.user?.id);
                        const isMyMessage = message.senderId === session?.user?.id;
                        const shouldObserve = !isMyMessage && !isReadByMe;

                        // Date Divider Logic
                        const prevMessage = messages[index - 1];
                        const showDayDivider = !prevMessage || !isSameCalendarDay(prevMessage.createdAt, message.createdAt);
                        const dayDividerText = formatDayHeading(message.createdAt);

                        // The SAME grouping rule community chat uses. DMs had
                        // their own — author + same calendar day, with no time
                        // window — so two messages six hours apart merged into
                        // one block. That is the failure the shared predicate
                        // exists to refuse: a wrongly grouped message hides who
                        // said it and when, while a wrongly ungrouped one costs
                        // a line. It also brings replies and system rows into
                        // line for free.
                        const isFirstInSequence = !isContinuation(
                            prevMessage
                                ? {
                                      id: prevMessage.id,
                                      userId: prevMessage.senderId,
                                      createdAt: prevMessage.createdAt,
                                  }
                                : undefined,
                            {
                                id: message.id,
                                userId: message.senderId,
                                createdAt: message.createdAt,
                                replyToId: message.replyToMessage?.id ?? null,
                            },
                        );

                        return (
                            <div key={message.id}>
                                {showDayDivider && <DayDivider label={dayDividerText} />}

                                <div
                                    data-message-id={message.id}
                                    data-sender-id={message.senderId}
                                    data-unread={shouldObserve ? "true" : "false"}
                                >
                                    <MessageBubble
                                        message={{
                                            id: message.id,
                                            senderId: message.senderId,
                                            content: message.content,
                                            encryptionIv: message.encryptionIv ?? "",
                                            createdAt: message.createdAt,
                                            isEncrypted: message.isDecrypted,
                                            reactions: message.reactions,
                                            readReceipts: message.readReceipts,
                                            messageType: message.messageType,
                                            attachmentUrl: message.attachmentUrl,
                                            replyToMessage: message.replyToMessage,
                                        }}
                                        isSent={isMyMessage}
                                        onReact={(emoji) => handleReaction(message.id, emoji)}
                                        onReply={handleReply}
                                        onImageLoad={handleImageLoad}
                                        currentUserId={session?.user?.id}
                                        isFirstInSequence={isFirstInSequence}
                                    />
                                </div>
                            </div>
                        );
                    })}

                    {/* Typing Indicator */}
                    <TypingIndicator conversationId={conversationId} currentUserId={session?.user?.id} typingUsers={typingUsers} />

                    <div ref={scrollRef} />
                </div>
            </ScrollArea>
        </div>
    );
}

function TypingIndicator({ conversationId, currentUserId, typingUsers }: { conversationId: string, currentUserId?: string, typingUsers: string[] }) {
    // Filter out current user from typing list
    const otherTypingUsers = typingUsers.filter(id => id !== currentUserId);

    if (otherTypingUsers.length === 0) return null;

    return (
        <div className="flex justify-start">
            <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5 w-fit">
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></span>
            </div>
        </div>
    );
}
