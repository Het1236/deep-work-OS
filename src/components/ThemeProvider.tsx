'use client'

import { createContext, useContext, useCallback, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'
type ThemeContextType = { theme: Theme; toggleTheme: () => void; setTheme: (t: Theme) => void }

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  toggleTheme: () => {},
  setTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  // Sync from the attribute the no-FOUC script already set.
  useEffect(() => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme) || 'dark'
    setThemeState(current)
  }, [])

  const apply = useCallback((t: Theme) => {
    document.documentElement.setAttribute('data-theme', t)
    try { localStorage.setItem('theme', t) } catch { /* ignore */ }
    setThemeState(t)
  }, [])

  const toggleTheme = useCallback(() => {
    apply(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light')
  }, [apply])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme: apply }}>
      {children}
    </ThemeContext.Provider>
  )
}
