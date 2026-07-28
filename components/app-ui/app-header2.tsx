"use client";
 
import { ThemeSelect } from '@/components/theme/theme-select'
import { ClusterUiSelect } from '../cluster/cluster-ui'
import WalletButton from '@/components/wallet/wallet-button'
import { WalletButtonSkeleton } from '@/components/wallet/wallet-button-skeleton'
import { useSidebar } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { MenuIcon, SearchIcon, PinkStarLogo } from '../icons'
import { CreateMenu } from './create-menu'
import { SolBalanceChip, SolBalanceChipSkeleton, useHeaderWalletLoading } from '@/components/wallet/sol-balance-chip2'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useQueryState } from 'nuqs'
import { searchParams } from '@/lib/searchParams'
import { GlobalSearch } from './global-search2'
import { TradeNav } from '@/components/trade/trade-nav'
import { MessagesNav } from '@/components/messages/messages-nav'
import Link from 'next/link'
 
// Same skin as the live CreateMenu trigger below (52px, rounded-2xl,
// bg-soft-gray-10), with the icon slot as the only shimmering part — the tile
// itself never changes between loading and loaded, so nothing pops.
//
// Deliberately NOT wrapped in <Squircle>: the loaded trigger can't be squircled
// either (GooDropdown owns its own <button>, see create-menu.tsx), so a
// squircled skeleton would snap to a plain round-rect on load.
function CreateButtonSkeleton() {
  return (
    <div
      aria-hidden
      className="flex size-[52px] items-center justify-center rounded-2xl border-sidebar-hover/10 bg-soft-gray-10"
    >
      <div className="size-6 rounded-lg shimmer-skeleton" />
    </div>
  )
}

export function AppHeader2() {
  const pathname = usePathname()
  const isSearchPage = pathname === '/search'
  // On /search the header bar drives results live: every keystroke updates ?q
  // (which the search page reads), instead of only navigating on Enter.
  const [searchQ, setSearchQ] = useQueryState('q', searchParams.q)
  // Shared gate (session + first wallet-assets fetch) so the Create tile
  // leaves its skeleton in the same paint as the balance chip and avatar.
  const { loading: isLoading } = useHeaderWalletLoading()
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
  // The scroll-in backdrop exists on media-style pages (watch/token), the /home
  // feed, /search, and /settings; everywhere else the header stays as-is on
  // scroll. NOT on /discover: the app shell stacks the fixed header above all
  // page content, so a backdrop there would sit over the feed — the feed must
  // stay unobstructed.
  const isHubPage = pathname === '/settings' || pathname === '/premium';
  const showScrollBackdrop = isMediaPage || pathname === '/home' || pathname === '/search' || isHubPage;

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
      className="fixed top-0 left-0 w-full h-[var(--header-height)] z-50 max-md:hidden flex items-center justify-between px-[var(--header-px)] py-3 pointer-events-none"
    >
      {/* Scroll backdrop: media pages keep the black scrim over video; /home
          and /search get a whisper of theme canvas; /settings goes near-solid
          (85%) so the header reads as a real bar over the scrolled panels.
          Other pages have no scroll backdrop at all. */}
      {showScrollBackdrop && (
        <div
          className="absolute inset-0 transition-colors"
          style={{
            backgroundColor: isMediaPage
              ? `rgba(0,0,0,${Math.min(scrollY / 1, 1) * 0.2})`
              : `color-mix(in oklab, var(--background) ${Math.min(scrollY / 32, 1) * (isHubPage ? 85 : 20)}%, transparent)`,
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
          <Link href="/home" aria-label="Home">
            {/* Pink star logo, sized to match the menu icon (size-8). */}
            <PinkStarLogo className="size-5.5" />
          </Link>
          {/* Trade section switcher (Frame 546): the page title doubles as a
              goo dropdown over Discover/Memescope/Perps/Predictions. */}
          {firstSegment === 'trade' && <TradeNav />}
          {/* Settings/Premium: static page title right of the logo — their
              navigation is the in-page left rail. (The SettingsNav goo
              dropdown is retired but kept in settings-nav.tsx just in case.) */}
          {firstSegment === 'settings' && (
            <span className="px-3 text-lg font-bold tracking-tight text-white">Settings</span>
          )}
          {firstSegment === 'premium' && (
            <span className="px-3 text-lg font-bold tracking-tight text-white">Premium</span>
          )}
          {/* Messages: the title doubles as the conversation switcher (?c=). */}
          {firstSegment === 'messages' && <MessagesNav />}
          {/* Discover search lives in the header (right of the logo), not in the
              feed tab bar. */}
          {firstSegment === 'discover' && (
            <Link
              href="/discover/search"
              aria-label="Search"
              className="flex size-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <SearchIcon className="size-7" />
            </Link>
          )}
        </div>
      </div>

      {/* SEARCH BAR CENTERED */}
      {showSearch && (
        <div className="relative z-10 flex-[2] flex items-center justify-center">
           <div className="w-full max-w-[560px] pointer-events-auto">
              {isSearchPage ? (
                // Live mode: type → updates ?q → page shows results immediately.
                // Page renders the results, so the in-bar dropdown is suppressed.
                <GlobalSearch
                  placeholder="Search"
                  initialValue={searchQ ?? ""}
                  onSearch={(v) => setSearchQ(v || null)}
                  showDropdown={false}
                />
              ) : (
                <GlobalSearch placeholder="Search" />
              )}
           </div>
        </div>
      )}

      {/* Right Actions */}
      <div className="relative z-10 flex-1 flex items-center justify-end">
        <div className="flex items-center gap-2 pointer-events-auto">
        {/* Before mount, render BOTH action skeletons together so they appear in
            the same paint — the Create skeleton is server-rendered while the
            wallet button is a dynamic(ssr:false) chunk, so without this the
            Create pill showed first and the wallet popped in a beat later. */}
        {!mounted ? (
          <>
            <SolBalanceChipSkeleton />
            <CreateButtonSkeleton />
            <WalletButtonSkeleton />
          </>
        ) : (
          <>
            <SolBalanceChip />
            {/* The + button is a create MENU now (pick the content type), not a
                straight-to-CreateDialog trigger. The skin stays here because
                this header and the frozen one style it differently; rounded-2xl
                stands in for the Squircle, which GooDropdown can't take since it
                owns the trigger button itself. */}
            {isLoading ? (
              <CreateButtonSkeleton />
            ) : (
              <CreateMenu triggerClassName="inner-shadow inner-shadow-blur-sm inner-shadow-white/50 cursor-pointer flex h-[52px] w-[52px] items-center justify-center rounded-2xl border-sidebar-hover/10 bg-soft-gray-10 p-0 text-flexwhite/80 transition-colors ease-out hover:bg-soft-gray-15" />
            )}
            <WalletButton />
          </>
        )}
        <div className="hidden">
          <ClusterUiSelect />
          <ThemeSelect />
        </div>
        </div>
      </div>
    </header>
  )
}
