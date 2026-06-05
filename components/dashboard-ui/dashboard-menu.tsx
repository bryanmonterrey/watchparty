"use client";

import React, { useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from "@/lib/utils";
import { useAuthSession } from "@/hooks/use-auth-session";
import { User, Video, MessageCircle, Library, Users, CreditCard, Settings, Menu } from 'lucide-react';
import {
    Drawer,
    DrawerContent,
    DrawerTrigger,
    DrawerTitle,
} from "@/components/ui/drawer";
import { VisuallyHidden } from "@/components/ui/visually-hidden";

export const DashboardMenu = () => {
    const pathname = usePathname();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const { data: session, isLoading: loading } = useAuthSession();
    const username = session?.user?.username || "";

    if (loading) {
        return <div></div>; // Loading state
    }

    if (!session || !username) {
        return null; // No user or username
    }

    const navigationItems = [
        {
            key: 'profile',
            label: 'profile',
            path: `/dashboard/${username}`,
            icon: <User className="w-5 h-5" />,
        },
        {
            key: 'settings',
            label: 'settings',
            path: `/dashboard/${username}/settings`,
            icon: <Settings className="w-5 h-5" />,
        },
    ];

    const handleNavigation = (path: string) => {
        router.push(path);
        setOpen(false);
    };

    return (
        <>
            {/* Desktop Navigation */}
            <div className='hidden lg:flex ml-2 gap-x-3'>
                {navigationItems.map((item) => (
                    <Button
                        key={item.key}
                        variant="outline"
                        aria-label={item.label}
                        className={cn(
                            'rounded-full transition-all ease-in-out duration-300 shadow-none ',
                            pathname === item.path ? 'text-white' : 'text-neutral-400 hover:text-white'
                        )}
                        onClick={() => handleNavigation(item.path)}
                    >
                        <div className={cn(
                            'flex items-center justify-center gap-2',
                            'hover:transition-all hover:ease-in-out hover:duration-300',
                            'font-semibold text-sm',
                            'active:text-white active:duration-300 active:transition-all active:ease-in-out',
                            pathname === item.path && 'text-white'
                        )}>
                            <p>{item.label}</p>
                        </div>
                    </Button>
                ))}
            </div>

            {/* Mobile Navigation Drawer */}
            <Drawer open={open} onOpenChange={setOpen} direction="bottom">
                <DrawerTrigger asChild>
                    <Button
                        variant="outline"
                        size="icon"
                        aria-label="Menu"
                        className="lg:hidden ml-2 bg-white/5 shadow-none hover:bg-white/10 border border-zinc-500/5 transition-all rounded-full ease-in-out duration-200 p-2 text-white/75 hover:text-white"
                    >
                        <Menu className="w-5 h-5" />
                    </Button>
                </DrawerTrigger>
                <DrawerContent className="border-zinc-800">
                    <VisuallyHidden>
                        <DrawerTitle>Navigation Menu</DrawerTitle>
                    </VisuallyHidden>
                    <div className="w-full p-6 pb-8">
                        <div className="grid grid-cols-2 gap-4 max-w-sm mx-auto">
                            {navigationItems.map((item) => (
                                <button
                                    key={item.key}
                                    onClick={() => handleNavigation(item.path)}
                                    className={cn(
                                        "aspect-square rounded-4xl bg-matte border border-neutral-500/5 flex flex-col items-center justify-center gap-2 transition-all",
                                        pathname === item.path
                                            ? "bg-matte text-white border-neutral-500/5"
                                            : "text-neutral-400 hover:bg-white/10 hover:text-white"
                                    )}
                                >
                                    {item.icon}
                                    <span className="text-xs font-medium">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </DrawerContent>
            </Drawer>
        </>
    );
};