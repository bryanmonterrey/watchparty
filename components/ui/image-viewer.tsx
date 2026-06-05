"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";

interface ImageViewerProps {
    imageUrl: string;
    isOpen: boolean;
    onClose: () => void;
    rightContent?: React.ReactNode;
    bottomLeftContent?: React.ReactNode;
}

export function ImageViewer({ imageUrl, isOpen, onClose, rightContent, bottomLeftContent }: ImageViewerProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
        }
        
        return () => {
            document.body.style.overflow = "auto";
        };
    }, [isOpen]);

    if (!isOpen) return null;
 
    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex flex-row bg-black/95 backdrop-blur-xl cursor-pointer"
            onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onClose();
            }}
        >
            {/* Main Image Area */}
            <div 
                className="flex-1 flex flex-col relative h-full min-w-0"
                onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    onClose();
                }}
            >
                {/* Top bar */}
                <div className="flex items-center justify-between p-4 flex-shrink-0 relative z-10 w-full pt-12 md:pt-6 pointer-events-none">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        className="w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white hover:bg-white/10 transition-colors backdrop-blur-md cursor-pointer pointer-events-auto"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                {/* Image */}
                <div className="flex-1 flex items-center justify-center p-4 md:p-8 min-h-0 min-w-0 absolute inset-0 z-0 pointer-events-none pb-24">
                    <img
                        src={imageUrl}
                        alt="Expanded media view"
                        className="max-w-full max-h-full object-contain pointer-events-auto cursor-default select-none transition-transform duration-200"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
 
                {/* Bottom Left Content */}
                {bottomLeftContent && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 pb-6 bg-gradient-to-t from-black/80 to-transparent flex justify-center z-10 pointer-events-none">
                        <div className="pointer-events-auto w-full max-w-lg mb-2">
                            {bottomLeftContent}
                        </div>
                    </div>
                )}
            </div>
 
            {/* Right Column (optional) */}
            {rightContent && (
                <div 
                    className="w-full md:w-[350px] lg:w-[400px] h-full bg-black border-l border-white/10 flex flex-col cursor-auto relative z-10 hidden md:flex shrink-0"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="w-full h-full overflow-y-auto hidden-scrollbar">
                        {rightContent}
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
}
