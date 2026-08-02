"use client";
 
import { ThemeSelect } from '@/components/theme/theme-select'
import { ClusterUiSelect } from '../cluster/cluster-ui'
import WalletButton from '@/components/wallet/wallet-button'
import { WalletButtonSkeleton } from '@/components/wallet/wallet-button-skeleton'
import { useSidebar } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { SearchIcon, PinkStarLogo } from '../icons'
import { MorphMenuIcon } from '@/components/marketing/morph-menu-icon'
import { useClipsOverlay } from '@/hooks/use-clips-overlay'
import { useHomeFeedOverlay } from '@/hooks/use-home-feed-overlay'
import { useCoinOverlay } from '@/hooks/use-coin-overlay'
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
import { cn } from '@/lib/utils'
 
// Same skin as the live CreateMenu trigger below (52px circle,
// bg-soft-gray-10), with the icon slot as the only shimmering part — the tile
// itself never changes between loading and loaded, so nothing pops.
//
// Circle, and no <Squircle>: Create is a pill by the repo rule, and it's what
// GooDropdown already draws — it takes no buttonRadius here, so its goo blob
// falls back to btn.h / 2 (goo-dropdown.tsx). rounded-2xl had the CSS and the
// blob disagreeing.
function CreateButtonSkeleton() {
  return (
    <div
      aria-hidden
      className="flex size-11 items-center justify-center rounded-full border-sidebar-hover/10"
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
  const { toggleSidebar, state: sidebarState } = useSidebar()
  const clipsOpen = useClipsOverlay((s) => s.open)
  const closeClips = useClipsOverlay((s) => s.onClose)
  const homeFeedOpen = useHomeFeedOverlay((s) => s.open)
  const closeHomeFeed = useHomeFeedOverlay((s) => s.onClose)
  const coinOpen = useCoinOverlay((s) => !!s.coin)
  const closeCoin = useCoinOverlay((s) => s.onClose)
  const homeOverlayOpen = clipsOpen || homeFeedOpen || coinOpen
  const closeHomeOverlay = () => {
    if (clipsOpen) closeClips()
    else if (coinOpen) closeCoin()
    else if (homeFeedOpen) closeHomeFeed()
  }
  const [mounted, setMounted] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => setMounted(true), [])

  const PROTECTED_FIRST_SEGMENTS = ['settings', 'communities', 'messages', 'shorts', 'feed', 'notifications'];
  const segments = pathname.split('/');
  const firstSegment = segments[1] ?? '';

  const showSearch = pathname === '/' ||
                     pathname === '/trade' ||
                     pathname === '/search' ||
                     ((segments.length === 2 || segments.length === 3) && !PROTECTED_FIRST_SEGMENTS.includes(firstSegment));

  // `/coin/<mint>` is excluded from isWatchPage explicitly: it's three segments
  // and 'coin' isn't a protected first segment, so without this a coin page
  // would read as a watch page. (isMediaPage would come out true either way —
  // but only by accident, and isWatchPage would be wrong for the next reader.)
  const isWatchPage = segments.length === 3 && firstSegment !== 'coin' && !PROTECTED_FIRST_SEGMENTS.includes(firstSegment);
  // Coins live at /coin/<mint> now. This used to be `segments.length === 2 &&
  // firstSegment.length >= 21` — guessing "is this a mint address?" from string
  // length, back when a coin and a username shared the top-level namespace.
  const isTokenPage = firstSegment === 'coin';
  const isMediaPage = isWatchPage || isTokenPage;
  // The scroll-in backdrop exists on media-style pages (watch/token), the /home
  // feed, /search, and /settings; everywhere else the header stays as-is on
  // scroll. NOT on /feed: the app shell stacks the fixed header above all
  // page content, so a backdrop there would sit over the feed — the feed must
  // stay unobstructed.
  const isHomePage = pathname === '/home';
  const isHubPage = pathname === '/settings' || pathname === '/premium';
  const showScrollBackdrop = isMediaPage || isHomePage || pathname === '/search' || isHubPage;

  useEffect(() => {
    if (!showScrollBackdrop) return
    const container = document.getElementById('app-scroll-container')
    if (!container) return

    // The app shell owns the page's only vertical scroller. Listening directly
    // to it keeps horizontal carousels and tab strips from resetting the header
    // backdrop with their own scrollTop (which is always zero).
    const syncBackdrop = () => setScrollY(container.scrollTop)
    syncBackdrop()
    container.addEventListener('scroll', syncBackdrop, { passive: true })
    return () => container.removeEventListener('scroll', syncBackdrop)
  }, [pathname, showScrollBackdrop])

  return (
    <header
      className="fixed top-0 left-0 w-full h-[var(--header-height)] z-50 max-md:hidden flex items-center justify-between px-[var(--header-px)] py-3 pointer-events-none"
    >
      {/* Scroll backdrop: media pages keep the black scrim over video; /search
          gets a whisper of theme background; /settings goes near-solid (85%).
          On /home it resolves to the app canvas once scrolled, joining the
          sticky category and column headers into one uninterrupted surface.
          Other pages have no scroll backdrop at all. */}
      {showScrollBackdrop && (
        <div
          className="absolute inset-0 transition-colors"
          style={{
            backgroundColor: isMediaPage
              ? `rgba(0,0,0,${Math.min(scrollY / 1, 1) * 0.2})`
              : `color-mix(in oklab, ${isHomePage ? 'var(--color-canvas)' : 'var(--background)'} ${Math.min(scrollY / 32, 1) * (isHomePage ? 100 : isHubPage ? 85 : 20)}%, transparent)`,
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
          {/* Home overlays share this close affordance: while one is open the
              hamburger path-morphs to an X and closes the active surface instead
              of touching the sidebar. */}
          <Button
            variant="ghost"
            size="icon"
            onClick={homeOverlayOpen ? closeHomeOverlay : toggleSidebar}
            data-sidebar={homeOverlayOpen ? undefined : 'trigger'}
            aria-label={homeOverlayOpen ? 'Close overlay' : 'Toggle sidebar'}
            className="size-10 text-white/80 hover:bg-white/10 hover:text-white"
          >
            <MorphMenuIcon open={homeOverlayOpen} className="size-8" />
          </Button>
          {/* Communities owns the star: it's the home tile at the top of the
              server rail there, directly under this spot — so the header drops
              its own copy rather than stacking two. Opening the sidebar (pinned
              or hovered) covers the rail, which takes the star with it, so the
              header takes the logo back for as long as it's expanded. */}
          {(firstSegment !== 'communities' || sidebarState === 'expanded') && (
            <Link href="/home" aria-label="Home">
              {/* Pink star logo, sized to match the menu icon (size-8). */}
              <PinkStarLogo className="size-5.5" />
            </Link>
          )}
          {/* Page titles — trade's switcher, the static settings/premium ones,
              messages' conversation switcher, discover's search.

              The header is `fixed left-0 w-full`, so it does NOT shift with the
              inset when the sidebar opens, and these would otherwise sit on top
              of an expanded sidebar. They do not MOVE to get out of the way —
              they hold their place and blur out while it's open.

              Not a z-index: the sidebar panel is also z-50, so at equal depth
              DOM order decides and the header — rendered after it, inside
              SidebarInset — always wins. Putting the titles under the sidebar
              would mean lifting them out of the header, which would also drop
              them under the header's own scroll backdrop (85% opaque on
              /settings once scrolled) and wash them out. Raising the SIDEBAR
              instead would cover the toggle and the logo with it, and the
              toggle is what closes the sidebar.

              pointer-events-none while faded, so an invisible TradeNav can't
              still be clicked. */}
          <div
            className={cn(
              'flex items-center gap-3 transition-[opacity,filter] duration-200 ease-out',
              sidebarState === 'expanded' && 'pointer-events-none opacity-0 blur-sm',
            )}
          >
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
          {firstSegment === 'feed' && (
            <Link
              href="/feed/search"
              aria-label="Search"
              className="flex size-10 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              <SearchIcon className="size-7" />
            </Link>
          )}
          </div>
        </div>
      </div>

      {/* Search targets the covered page, so all home overlays hide it while
          leaving the X and right-hand action cluster available. */}
      {showSearch && !homeOverlayOpen && (
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
                this header and the frozen one style it differently. It's a
                circle: Create is a pill (repo rule, no Squircle), and it's the
                shape GooDropdown's goo already morphs from — no buttonRadius is
                passed, so the blob uses btn.h / 2. */}
            {isLoading ? (
              <CreateButtonSkeleton />
            ) : (
              <CreateMenu triggerClassName="inner-shadow inner-shadow-blur-sm inner-shadow-white/50 cursor-pointer flex h-11 w-11 items-center justify-center rounded-full border-sidebar-hover/10 bg-soft-gray-10 p-0 text-flexwhite/80 transition-colors ease-out hover:bg-soft-gray-15" />
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
