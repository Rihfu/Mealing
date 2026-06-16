import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { signOut } from '@/app/auth/actions';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { userId, profile, email } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link href="/planning" className="hover:underline">
            Planning
          </Link>
          <Link href="/recettes" className="hover:underline">
            Recettes
          </Link>
          <Link href="/nutrition" className="hover:underline">
            Nutrition
          </Link>
          <Link href="/stock" className="hover:underline">
            Stock
          </Link>
          <Link href="/courses" className="hover:underline">
            Courses
          </Link>
          <Link href="/foyer" className="hover:underline">
            Foyer
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-500">{profile.display_name || email}</span>
          <form action={signOut}>
            <button type="submit" className="text-gray-500 underline">
              Déconnexion
            </button>
          </form>
        </div>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
