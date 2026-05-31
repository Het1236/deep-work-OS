'use client'

import { XPToastProvider } from '@/components/XPToast'
import { ThemeProvider } from '@/components/ThemeProvider'
import CommandPalette from '@/components/CommandPalette'

export default function DashboardProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <XPToastProvider>
        {children}
        <CommandPalette />
      </XPToastProvider>
    </ThemeProvider>
  )
}
