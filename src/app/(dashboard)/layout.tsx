import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/layout/Sidebar'
import Topbar from '@/components/layout/Topbar'
import { UserProvider } from '@/components/UserContext'
import DashboardProviders from '@/components/DashboardProviders'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if onboarding is completed
  const { data: profile } = await supabase
    .from('profiles')
    .select('identity_statement')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.identity_statement) {
    redirect('/onboarding')
  }

  return (
    <UserProvider initialUser={user}>
      <DashboardProviders>
        <div className="app-shell">
          <Sidebar />
          <div className="main-area">
            <Topbar />
            <main className="main-content">
              {children}
            </main>
          </div>
        </div>
      </DashboardProviders>
    </UserProvider>
  )
}
