"use client";
 
import { ThemeSelect } from '@/components/theme/theme-select'
import { ClusterUiSelect } from '../cluster/cluster-ui'
import WalletButton from '@/components/wallet/wallet-button'
import { useAuthSession } from '@/hooks/use-auth-session'
import { useSidebar } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { CreateIcon, MenuIcon } from '../icons'
import Image from 'next/image'
import { CreateDialog } from './create-dialog'
import { WithAuth } from '@/components/auth/with-auth'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { GlobalSearch } from './global-search'
import Link from 'next/link'
 
export function AppHeader() {
  const pathname = usePathname()
  const { data: session, isLoading } = useAuthSession()
  const { toggleSidebar } = useSidebar()
  const [mounted, setMounted] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => setMounted(true), [])

  const PROTECTED_FIRST_SEGMENTS = ['settings', 'communities', 'messages', 'shorts', 'discover', 'notifications'];
  const segments = pathname.split('/');
  const firstSegment = segments[1] ?? '';

  const showSearch = pathname === '/' ||
                     pathname === '/trade' ||
                     pathname === '/search' ||
                     ((segments.length === 2 || segments.length === 3) && !PROTECTED_FIRST_SEGMENTS.includes(firstSegment));

  const isWatchPage = segments.length === 3 && !PROTECTED_FIRST_SEGMENTS.includes(firstSegment);
  const isTokenPage = segments.length === 2 && firstSegment.length >= 21;
  const isMediaPage = isWatchPage || isTokenPage;
  // The scroll-in backdrop only exists on media-style pages (watch/token +
  // the /home feed); everywhere else the header stays as-is on scroll.
  const showScrollBackdrop = isMediaPage || pathname === '/home';

  useEffect(() => {
    if (!showScrollBackdrop) return
    // Capture-phase listener sees scrolls from ANY container (the main
    // app scroller, discover's independent feed column, etc.), so the header
    // backdrop reacts regardless of which scroller the page uses — ported
    // behavior was main-container only.
    const handler = (e: Event) => {
      const el = e.target instanceof HTMLElement ? e.target : document.documentElement
      setScrollY(el.scrollTop)
    }
    const container = document.getElementById('app-scroll-container')
    setScrollY(container?.scrollTop ?? 0)
    document.addEventListener('scroll', handler, { passive: true, capture: true })
    return () => document.removeEventListener('scroll', handler, { capture: true })
  }, [pathname, showScrollBackdrop])

  return (
    <header
      className="fixed top-0 left-0 w-full z-50 max-md:hidden flex items-center justify-between px-4 py-3 pointer-events-none"
    >
      {/* Scroll backdrop, media pages + /home only: media pages keep the
          black scrim over video; /home gets the theme canvas so it works in
          light and dark. Other pages have no scroll backdrop at all. */}
      {showScrollBackdrop && (
        <div
          className="absolute inset-0 transition-colors"
          style={{
            backgroundColor: isMediaPage
              ? `rgba(0,0,0,${Math.min(scrollY / 1, 1) * 0.4})`
              : `color-mix(in srgb, var(--background) ${Math.min(scrollY / 32, 1) * 85}%, transparent)`,
            backdropFilter: `blur(${Math.min(scrollY / (isMediaPage ? 1 : 32), 1) * 24}px)`,
          }}
        />
      )}
      {/* Mobile Menu & Logo */}
      <div className="relative z-10 flex-1 flex items-center justify-start">
        {/* Trigger + logo, desktop too (per desktopdesigns/*.svg): pressing
            the trigger pins the sidebar open / closes it; hover on the rail
            and click-outside are handled by Sidebar itself. */}
        {/* Plain trigger + logo on the canvas — no pill, per desktopdesigns. */}
        <div className="flex items-center gap-3 h-11 pointer-events-auto">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            data-sidebar="trigger"
            className="size-10 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <MenuIcon className="size-8" />
          </Button>
          <Link href="/home">
            <Image
            src="/Star2.svg"
            alt="Logo"
            width={28}
            height={28}
            className="opacity-90"
          />
          </Link>
        </div>
      </div>

      {/* SEARCH BAR CENTERED */}
      {showSearch && (
        <div className="relative z-10 flex-[2] flex items-center justify-center">
           <div className="w-full max-w-[560px] pointer-events-auto">
              <GlobalSearch placeholder="Search" />
           </div>
        </div>
      )}

      {/* Right Actions */}
      <div className="relative z-10 flex-1 flex items-center justify-end">
        <div className="flex items-center gap-2 pointer-events-auto">
        <CreateDialog>
          <WithAuth>
            {!mounted || isLoading ? (
              <Button
                disabled
                variant="outline"
                className="rounded-full border-none font-semibold flex bg-zinc-500/35 backdrop-blur-xs text-white/90 gap-2 px-4 h-11 w-[110px]"
              >
                <div className="size-5 rounded-full shimmer-skeleton shrink-0" />
                <div className="h-3 w-full rounded-full shimmer-skeleton" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="rounded-full font-semibold flex text-[17px] h-11 px-3 text-flexwhite hover:bg-white/10"
              >
                <span className="flex items-center gap-1">
                  <CreateIcon className="size-5" strokeWidth={2}/>
                  Create
                </span>
              </Button>
            )}
          </WithAuth>
        </CreateDialog>
        <WalletButton />
        <div className="hidden">
          <ClusterUiSelect />
          <ThemeSelect />
        </div>
        </div>
      </div>
    </header>
  )
}
