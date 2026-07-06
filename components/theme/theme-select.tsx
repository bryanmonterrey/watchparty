'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { buttonVariants } from '@/components/ui/button'
import { GooDropdown } from '@/components/ui/goo-dropdown'

export function ThemeSelect() {
  const { setTheme } = useTheme()

  return (
    <GooDropdown
      align="end"
      width={160}
      triggerAriaLabel="Toggle theme"
      triggerClassName={buttonVariants({ variant: 'outline', size: 'icon' })}
      trigger={
        <>
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </>
      }
      items={[
        { label: 'Light', onClick: () => setTheme('light') },
        { label: 'Dark', onClick: () => setTheme('dark') },
        { label: 'System', onClick: () => setTheme('system') },
      ]}
    />
  )
}
