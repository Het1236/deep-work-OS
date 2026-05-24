'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User } from '@supabase/supabase-js'

type UserContextType = {
  user: User | null
  userId: string | null
  loading: boolean
  lastUpdate: number
  triggerRefresh: () => void
}

const UserContext = createContext<UserContextType>({ user: null, userId: null, loading: true, lastUpdate: 0, triggerRefresh: () => {} })

export function UserProvider({ children, initialUser }: { children: ReactNode; initialUser?: User | null }) {
  const [user, setUser] = useState<User | null>(initialUser ?? null)
  const [loading, setLoading] = useState(!initialUser)
  const [lastUpdate, setLastUpdate] = useState(Date.now())

  const triggerRefresh = () => {
    setLastUpdate(Date.now())
  }

  useEffect(() => {
    if (initialUser) return

    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [initialUser])

  return (
    <UserContext.Provider value={{ user, userId: user?.id ?? null, loading, lastUpdate, triggerRefresh }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
