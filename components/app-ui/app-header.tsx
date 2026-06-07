"use client";
 
import { ThemeSelect } from '@/components/theme/theme-select'
import { WalletEntry } from './wallet-entry'
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
 
export function AppHeader() {
  const pathname = usePathname()
  const { data: session, isLoading } = useAuthSession()
  const { toggleSidebar } = useSidebar()
  const [mounted, setMounted] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    const container = document.getElementById('app-scroll-container')
    if (!container) return
    setScrollY(container.scrollTop)
    const handler = () => setScrollY(container.scrollTop)
    container.addEventListener('scroll', handler, { passive: true })
    return () => container.removeEventListener('scroll', handler)
  }, [pathname])

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

  return (
    <header
      className="absolute top-0 left-0 w-full z-50 flex items-center justify-between p-2 pointer-events-none"
    >
      {isMediaPage && (
        <div
          className="absolute inset-0 transition-colors"
          style={{
            backgroundColor: `rgba(0,0,0,${Math.min(scrollY / 1, 1) * 0.4})`,
            backdropFilter: `blur(${Math.min(scrollY / 1, 1) * 24}px)`,
          }}
        />
      )}
      {/* Mobile Menu & Logo */}
      <div className="relative z-10 flex-1 flex items-center justify-start">
        <div className="flex items-center gap-2 h-11 px-3 pointer-events-auto md:hidden bg-white/5 rounded-full p-1 backdrop-blur-xs border border-white/5 ">
          <Image
            src="/Star2.svg"
            alt="Logo"
            width={20}
            height={20}
            className="opacity-90"
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleSidebar}
            className="text-white/80 hover:bg-white/10 hover:text-white"
          >
            <MenuIcon className="size-5" />
          </Button>
        </div>
      </div>

      {/* SEARCH BAR CENTERED */}
      {showSearch && (
        <div className="relative z-10 flex-[2] flex items-center justify-center">
           <div className="w-full max-w-[500px] pointer-events-auto">
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
                variant="outline"
                className="mix-blend-difference rounded-full border-none font-medium flex bg-zinc-500/35 hover:bg-zinc-500/60 text-[18px] h-11 backdrop-blur-xs text-flexwhite"
              >
                <span className="flex items-center gap-1">
                  <CreateIcon className="size-5" strokeWidth={2}/>
                  Create
                </span>
              </Button>
            )}
          </WithAuth>
        </CreateDialog>
        <WalletEntry />
        <div className="hidden">
          <ThemeSelect />
        </div>
        </div>
      </div>
    </header>
  )
}
