import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { signOut } from '@/app/auth/actions';

const NAV = [
  ['/planning', 'Planning'],
  ['/recettes', 'Recettes'],
  ['/nutrition', 'Nutrition'],
  ['/stock', 'Stock'],
  ['/courses', 'Courses'],
  ['/foyer', 'Foyer'],
  ['/assistant', 'Assistant'],
] as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId, profile, email } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/planning" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={28} height={28} aria-hidden="true" />
            <span className="font-display text-lg font-semibold text-ink">Mealing</span>
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-soft sm:inline">{profile.display_name || email}</span>
            <form action={signOut}>
              <button type="submit" className="nav-link underline-offset-2 hover:underline">
                Déconnexion
              </button>
            </form>
          </div>
        </div>
        <nav className="flex items-center gap-4 overflow-x-auto px-4 pb-2">
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className="nav-link whitespace-nowrap hover:underline">
              {label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
