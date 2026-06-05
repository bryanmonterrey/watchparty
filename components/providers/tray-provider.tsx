'use client';

import React, { createContext, useContext, useState } from 'react';

type TrayView = 'send' | 'request' | null;

interface TrayContextType {
    activeView: TrayView;
    setActiveView: (view: TrayView) => void;
    isOpen: boolean;
    setIsOpen: (open: boolean) => void;
    closeTray: () => void;
    openTray: (view: TrayView) => void;
}

const TrayContext = createContext<TrayContextType | undefined>(undefined);

export function TrayProvider({ children }: { children: React.ReactNode }) {
    const [activeView, setActiveView] = useState<TrayView>(null);
    const [isOpen, setIsOpen] = useState(false);

    const openTray = (view: TrayView) => {
        setActiveView(view);
        setIsOpen(true);
    };

    const closeTray = () => {
        setIsOpen(false);
        setTimeout(() => setActiveView(null), 300); // Reset view after animation
    };

    return (
        <TrayContext.Provider
            value={{
                activeView,
                setActiveView,
                isOpen,
                setIsOpen,
                closeTray,
                openTray,
            }}
        >
            {children}
        </TrayContext.Provider>
    );
}

export function useTray() {
    const context = useContext(TrayContext);
    if (context === undefined) {
        throw new Error('useTray must be used within a TrayProvider');
    }
    return context;
}
