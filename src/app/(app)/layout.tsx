import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { signOut } from '@/app/auth/actions';
import { NavTabs } from './nav-tabs';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId, profile, email } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');

  const name = profile.display_name || email || '';
  const initial = (name.trim()[0] || '?').toUpperCase();

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-2.5">
          <Link href="/planning" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={26} height={26} aria-hidden="true" />
            <span className="font-display text-lg font-semibold tracking-tight text-ink">Mealing</span>
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sage-tint text-xs font-extrabold text-sage-deep">
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
        <NavTabs />
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
