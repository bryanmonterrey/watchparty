'use client';

import { useEffect, useRef, useState } from 'react';
import { useSupabaseRealtime } from './use-supabase-realtime';
import { trpc } from '@/lib/trpc/client';
import { logger } from '@/lib/logger';

interface QueuedMessage {
    id: string;
    conversationId: string;
    content: string;
    encryptionIv: string;
    messageType?: 'text' | 'image' | 'file' | 'system';
    replyToId?: string;
    timestamp: number;
    retryCount: number;
}

const MAX_RETRY_COUNT = 3;
const RETRY_DELAY = 2000; // 2 seconds

/**
 * Offline message queue hook
 * Queues messages when offline and sends them when connection is restored
 */
export function useOfflineQueue() {
    const { isConnected } = useSupabaseRealtime();
    const sendMessageMutation = trpc.message.send.useMutation();
    const [queue, setQueue] = useState<QueuedMessage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const processingRef = useRef(false);

    // Load queue from localStorage on mount
    useEffect(() => {
        const savedQueue = localStorage.getItem('offline_message_queue');
        if (savedQueue) {
            try {
                const parsed = JSON.parse(savedQueue);
                setQueue(parsed);
                logger.info('Loaded offline message queue', {
                    metadata: { queueSize: parsed.length },
                });
            } catch (error) {
                logger.error('Failed to parse offline queue', error as Error);
                localStorage.removeItem('offline_message_queue');
            }
        }
    }, []);

    // Save queue to localStorage whenever it changes
    useEffect(() => {
        if (queue.length > 0) {
            localStorage.setItem('offline_message_queue', JSON.stringify(queue));
        } else {
            localStorage.removeItem('offline_message_queue');
        }
    }, [queue]);

    // Process queue when connection is restored
    useEffect(() => {
        if (isConnected && queue.length > 0 && !processingRef.current) {
            processQueue();
        }
    }, [isConnected, queue.length]);

    const addToQueue = (message: Omit<QueuedMessage, 'id' | 'timestamp' | 'retryCount'>) => {
        const queuedMessage: QueuedMessage = {
            ...message,
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            retryCount: 0,
        };

        setQueue((prev) => [...prev, queuedMessage]);

        logger.info('Message added to offline queue', {
            conversationId: message.conversationId,
            metadata: { queueSize: queue.length + 1 },
        });
    };

    const processQueue = async () => {
        if (processingRef.current || queue.length === 0) return;

        processingRef.current = true;
        setIsProcessing(true);

        logger.info('Processing offline message queue', {
            metadata: { queueSize: queue.length },
        });

        const messagesToProcess = [...queue];
        const failedMessages: QueuedMessage[] = [];

        for (const message of messagesToProcess) {
            try {
                // Attempt to send message via tRPC
                await sendMessageMutation.mutateAsync({
                    conversationId: message.conversationId,
                    content: message.content,
                    encryptionIv: message.encryptionIv,
                    messageType: message.messageType || 'text',
                    replyToId: message.replyToId,
                });

                logger.info('Offline message sent', {
                    conversationId: message.conversationId,
                    messageId: message.id,
                });

                // Wait a bit between messages to avoid rate limiting
                await new Promise((resolve) => setTimeout(resolve, 500));
            } catch (error) {
                logger.error('Failed to send offline message', error as Error, {
                    conversationId: message.conversationId,
                    messageId: message.id,
                    metadata: { retryCount: message.retryCount },
                });

                // Retry logic
                if (message.retryCount < MAX_RETRY_COUNT) {
                    failedMessages.push({
                        ...message,
                        retryCount: message.retryCount + 1,
                    });
                } else {
                    logger.error('Message exceeded max retry count', undefined, {
                        conversationId: message.conversationId,
                        messageId: message.id,
                    });
                }
            }
        }

        // Update queue with only failed messages
        setQueue(failedMessages);
        setIsProcessing(false);
        processingRef.current = false;

        if (failedMessages.length > 0) {
            logger.warn('Some messages failed to send', {
                metadata: { failedCount: failedMessages.length },
            });

            // Retry after delay
            setTimeout(() => {
                if (isConnected) {
                    processQueue();
                }
            }, RETRY_DELAY);
        }
    };

    const clearQueue = () => {
        setQueue([]);
        localStorage.removeItem('offline_message_queue');
        logger.info('Offline message queue cleared');
    };

    return {
        queue,
        queueSize: queue.length,
        isProcessing,
        addToQueue,
        clearQueue,
    };
}
