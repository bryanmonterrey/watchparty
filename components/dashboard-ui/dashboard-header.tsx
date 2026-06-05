'use client'

import { usePathname } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Menu, Home } from 'lucide-react'
import { ThemeSelect } from '@/components/theme/theme-select'
import { ClusterUiSelect } from '../cluster/cluster-ui'
import WalletButton from '@/components/wallet/wallet-button'
import Image from 'next/image'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { DashboardMenu } from './dashboard-menu'

export function DashboardHeader() {
  const pathname = usePathname()
  const [showMenu, setShowMenu] = useState(false)

  return (
    <header className="w-full absolute bg-transparent top-0 fixed z-50 px-3 py-2 dark:text-neutral-400">
      <div className="mx-auto flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link className="" href="/">
            <Image src="/logo.svg" alt="Logo" width={20} height={20} />
          </Link>
          <DashboardMenu />
        </div>


        <div className="flex items-center gap-2 ">
          <Button variant="outline" asChild>
            <Link href="/">
              Exit dashboard
            </Link>
          </Button>
          <div className="hidden">
            <ClusterUiSelect />
            <ThemeSelect />
          </div>
        </div>
      </div>
    </header>
  )
}
