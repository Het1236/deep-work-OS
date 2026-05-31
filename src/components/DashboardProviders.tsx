'use client'

import { XPToastProvider } from '@/components/XPToast'
import { ThemeProvider } from '@/components/ThemeProvider'
import CommandPalette from '@/components/CommandPalette'
import QuickCapture from '@/components/QuickCapture'

export default function DashboardProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <XPToastProvider>
        {children}
        <CommandPalette />
        <QuickCapture />
      </XPToastProvider>
    </ThemeProvider>
  )
}
