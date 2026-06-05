'use client'

import { ThemeProvider } from '@/components/theme/theme-provider'

import React, { Suspense } from 'react'
import { ClusterChecker } from '@/components/cluster/cluster-ui'
import OnboardingDialog from '@/components/app-ui/app-onboarding'

export function AppLayout({
    children,
    links = [],
}: {
    children: React.ReactNode
    links?: { label: string; path: string }[]
}) {
    return (
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <main className="flex flex-col h-screen overflow-hidden hidden-scrollbar">
                <ClusterChecker>
                    {children}
                </ClusterChecker>
                <Suspense>
                    <OnboardingDialog />
                </Suspense>
            </main>
        </ThemeProvider>
    )
}
