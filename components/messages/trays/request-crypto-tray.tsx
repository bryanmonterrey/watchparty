'use client';

import { Tray } from '@/components/ui/tray';
import { Button } from '@/components/ui/button';
import { ArrowDownLeftIcon } from '@/components/icons';
import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useChat } from '../chat-context';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { useSendMessage } from '@/hooks/use-messages';
import { trpc } from '@/lib/trpc/client';
import QRCodeStyling from "qr-code-styling";
import { Check, Copy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useWallet } from '@solana/wallet-adapter-react';

interface RequestCryptoTrayProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function RequestCryptoTray({ open, onOpenChange }: RequestCryptoTrayProps) {
    const { activeRecipient } = useChat();
    const { publicKey } = useWallet(); // Get REAL wallet address
    const [amount, setAmount] = useState('');

    const { sendMessage, isSending } = useSendMessage(activeRecipient?.conversationId || '');

    // Fallback if wallet not connected, though ideally should block or show connect button
    const address = publicKey ? publicKey.toBase58() : "";

    const { data: keyData } = trpc.encryption.getPublicKey.useQuery(
        { userId: activeRecipient?.id || '' },
        { enabled: !!activeRecipient?.id }
    );

    const handleSendRequest = async () => {
        if (!activeRecipient?.conversationId || !keyData?.publicKey) {
            toast.error("Cannot send request: Missing context or encryption key");
            return;
        }

        try {
            const content = JSON.stringify({
                amount: amount,
                currency: 'SOL',
                requesteeName: activeRecipient.name
            });

            await sendMessage(content, keyData.publicKey, 'transaction_request');
            toast.success(`Requested ${amount} SOL`);
            onOpenChange(false);
            setAmount('');
        } catch (error) {
            console.error('Failed to send request message', error);
            toast.error("Failed to send request");
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
                            <ArrowDownLeftIcon className="size-5 text-white" />
                        </div>
                        {activeRecipient ? `Request Payment` : 'Receive Crypto'}
                    </div>
                </div>

                <div className="flex-1 px-6 pt-4 flex flex-col items-center">
                    {activeRecipient ? (
                        /* Request Mode */
                        <>
                            <div className="flex flex-col items-center gap-4 mb-8">
                                <Avatar className="h-24 w-24 border-4 border-zinc-900 shadow-xl">
                                    <AvatarImage src={activeRecipient?.image} />
                                    <AvatarFallback className="bg-zinc-800 text-3xl text-zinc-400">
                                    </AvatarFallback>
                                </Avatar>
                                <div className="text-center">
                                    <h3 className="text-2xl font-semibold text-white">
                                        {activeRecipient?.name}
                                    </h3>
                                </div>
                            </div>

                            <div className="flex justify-center w-full">
                                <NumberInput
                                    value={Number(amount)}
                                    onChange={(val) => setAmount(val.toString())}
                                    min={0}
                                />
                            </div>
                        </>
                    ) : (
                        /* Generic Receive Mode */
                        <div className="flex flex-col items-center w-full max-w-sm gap-8 pt-4">
                            {/* QR Code Container */}
                            <div className="bg-white p-4 rounded-[2.5rem] shadow-2xl relative group transition-transform hover:scale-[1.02] duration-300">
                                <div className="absolute inset-0 bg-bleu/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <div className="relative">
                                    {address ? (
                                        <QRCodeContainer walletAddress={address} />
                                    ) : (
                                        <div className="w-[200px] h-[200px] flex items-center justify-center text-black/50 font-medium">
                                            Wallet not connected
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="text-center space-y-2">
                                <p className="text-lg font-medium text-white">Scan to Pay</p>
                                <p className="text-sm text-zinc-400">Solana (SOL) & SPL Tokens</p>
                            </div>

                            {/* Copy Button */}
                            <div className="w-full">
                                <CopyButton address={address} />
                            </div>
                        </div>
                    )}
                </div>

                {activeRecipient && (
                    <div className="p-6 pb-12 mt-auto">
                        <Button
                            onClick={handleSendRequest}
                            className={cn(
                                "w-full h-14 text-black font-bold rounded-full text-lg shadow-lg transition-all",
                                "bg-white hover:bg-zinc-200 active:scale-[0.98]",
                                "disabled:opacity-50 disabled:pointer-events-none"
                            )}
                            disabled={!amount || isSending}
                        >
                            {isSending ? 'Sending Request...' : 'Send Request'}
                        </Button>
                        <Button
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            className="w-full mt-4 h-12 text-zinc-500 hover:text-white hover:bg-transparent rounded-full"
                        >
                            Cancel
                        </Button>
                    </div>
                )}
            </div>
        </Tray>
    );
}

function QRCodeContainer({ walletAddress }: { walletAddress: string }) {
    const qrCodeRef = useRef<HTMLDivElement>(null);
    const qrCode = useRef<QRCodeStyling | null>(null);

    useEffect(() => {
        if (!qrCodeRef.current || !walletAddress) return;

        // Initialize only once
        if (!qrCode.current) {
            qrCode.current = new QRCodeStyling({
                width: 220,
                height: 220,
                type: "svg",
                data: walletAddress,
                margin: 0,
                qrOptions: {
                    typeNumber: 0,
                    mode: "Byte",
                    errorCorrectionLevel: "H",
                },
                imageOptions: {
                    hideBackgroundDots: true,
                    imageSize: 0.4,
                    margin: 4,
                },
                dotsOptions: {
                    type: "dots",
                    color: "#000000",
                },
                backgroundOptions: {
                    color: "#ffffff",
                },
                cornersSquareOptions: {
                    type: "extra-rounded",
                    color: "#000000",
                },
                cornersDotOptions: {
                    type: "dot",
                    color: "#000000",
                },
            });
            qrCode.current.append(qrCodeRef.current);
        } else {
            // Update logic if needed, usually just recreating if address changes drastically
            qrCode.current.update({
                data: walletAddress
            });
        }
    }, [walletAddress]);

    return <div ref={qrCodeRef} />;
}


function CopyButton({ address }: { address: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!address) {
            toast.error("No wallet connected");
            return;
        }
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            toast.success("Address copied!");
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            toast.error("Failed to copy");
        }
    };

    return (
        <button
            onClick={handleCopy}
            disabled={!address}
            className={cn(
                "w-full h-14 rounded-full font-medium transition-all flex items-center justify-center gap-2 shadow-lg",
                copied ? "bg-green-500 text-white" : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white",
                !address && "opacity-50 cursor-not-allowed"
            )}
        >
            {copied ? (
                <>
                    <Check className="w-5 h-5" />
                    <span className="text-base">Address Copied</span>
                </>
            ) : (
                <>
                    <Copy className="w-5 h-5" />
                    <span className="text-base">Copy Address</span>
                </>
            )}
        </button>
    );
}
