'use client'

import { XPToastProvider } from '@/components/XPToast'

export default function DashboardProviders({ children }: { children: React.ReactNode }) {
  return (
    <XPToastProvider>
      {children}
    </XPToastProvider>
  )
}
