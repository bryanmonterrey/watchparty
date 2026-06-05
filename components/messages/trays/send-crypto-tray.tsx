'use client';

import { Tray } from '@/components/ui/tray';
import { Button } from '@/components/ui/button';
import { NumberInput } from '@/components/ui/number-input';
import { useChat } from '../chat-context';
import { useEffect, useState } from 'react';
import { ArrowUpRightIcon } from '@/components/icons';
import { useSendMessage } from '@/hooks/use-messages';
import { trpc } from '@/lib/trpc/client';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Label } from '@/components/ui/label';

interface SendCryptoTrayProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SendCryptoTray({ open, onOpenChange }: SendCryptoTrayProps) {
    const { activeRecipient } = useChat();
    const [amount, setAmount] = useState('');
    const [address, setAddress] = useState('');

    const { sendMessage, isSending } = useSendMessage(activeRecipient?.conversationId || '');

    const { data: keyData } = trpc.encryption.getPublicKey.useQuery(
        { userId: activeRecipient?.id || '' },
        { enabled: !!activeRecipient?.id }
    );

    useEffect(() => {
        if (open && activeRecipient?.walletAddress) {
            setAddress(activeRecipient.walletAddress);
        } else if (open && !activeRecipient) {
            setAddress('');
        }
    }, [open, activeRecipient]);

    const handleSend = async () => {
        if (!activeRecipient?.conversationId || !keyData?.publicKey) {
            toast.error("Cannot send message: Missing context or encryption key");
            return;
        }

        try {
            const content = JSON.stringify({
                amount: amount,
                currency: 'SOL',
                recipientAddress: address,
                recipientName: activeRecipient.name
            });

            await sendMessage(content, keyData.publicKey, 'transaction_send');
            toast.success(`Sent ${amount} SOL`);
            onOpenChange(false);
            setAmount('');
        } catch (error) {
            console.error('Failed to send transaction message', error);
            toast.error("Failed to send transaction message");
        }
    };

    return (
        <Tray
            open={open}
            onOpenChange={onOpenChange}
            className="bg-zinc-950"
        >
            <div className="flex flex-col h-full bg-zinc-950">
                <div className="p-6 pb-2 text-center">
                    <div className="flex items-center justify-center gap-2 text-lg font-medium text-white/90 mb-6">
                        <div className="bg-white/10 p-2 rounded-full">
                            <ArrowUpRightIcon className="size-5 text-white" />
                        </div>
                        Send Crypto
                    </div>

                    <div className="flex flex-col items-center gap-4">
                        <Avatar className="h-24 w-24 border-4 border-zinc-900 shadow-xl">
                            <AvatarImage src={activeRecipient?.image} />
                            <AvatarFallback className="bg-zinc-800 text-3xl text-zinc-400">
                            </AvatarFallback>
                        </Avatar>

                        <div className="text-center space-y-1">
                            <h3 className="text-2xl font-semibold text-white">
                                {activeRecipient?.name}
                            </h3>
                            {activeRecipient?.walletAddress ? (
                                <p className="text-sm text-zinc-500  bg-zinc-900/50 px-3 py-1 rounded-full inline-block">
                                    {activeRecipient.walletAddress.slice(0, 4)}...{activeRecipient.walletAddress.slice(-4)}
                                </p>
                            ) : (
                                <p className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded-full inline-block">
                                    No wallet connected
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-1 px-6 pt-8">
                    <div className="w-full space-y-3">
                        <Label htmlFor="amount" className="text-xs font-medium text-zinc-500 uppercase tracking-wider ml-1">
                            Amount (SOL)
                        </Label>
                        <div className="flex justify-center w-full">
                            <NumberInput
                                value={Number(amount)}
                                onChange={(val) => setAmount(val.toString())}
                                min={0}
                            />
                        </div>
                    </div>
                </div>

                <div className="p-6 pb-12 mt-auto">
                    <Button
                        onClick={handleSend}
                        className={cn(
                            "w-full h-14 text-black font-bold rounded-full text-lg shadow-lg transition-all",
                            "bg-white hover:bg-zinc-200 active:scale-[0.98]",
                            "disabled:opacity-50 disabled:pointer-events-none"
                        )}
                        disabled={!amount || !address || isSending}
                    >
                        {isSending ? 'Sending...' : 'Send Now'}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="w-full mt-4 h-12 text-zinc-500 hover:text-white hover:bg-transparent rounded-full"
                    >
                        Cancel
                    </Button>
                </div>
            </div>
        </Tray>
    );
}
