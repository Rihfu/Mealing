import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { signOut } from '@/app/auth/actions';
import { NavTabs } from './nav-tabs';
import { SyncManager } from './sync-manager';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId, profile, email } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');

  const name = profile.display_name || email || '';
  const initial = (name.trim()[0] || '?').toUpperCase();

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 lg:px-8">
          <Link href="/planning" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={34} height={34} aria-hidden="true" />
            <span className="font-display text-xl font-semibold tracking-tight text-ink">Mealing</span>
          </Link>
          <div className="hidden min-w-0 flex-1 justify-center lg:flex">
            <NavTabs />
          </div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sage-tint text-xs font-extrabold text-sage-deep">
              {initial}
            </span>
            <span className="hidden text-sm font-bold text-ink sm:inline">{profile.display_name || email}</span>
            <form action={signOut}>
              <button type="submit" className="text-xs text-ink-soft hover:underline">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
        <div className="lg:hidden">
          <NavTabs />
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 lg:px-8 lg:py-8">{children}</main>
      <SyncManager />
    </div>
  );
}
