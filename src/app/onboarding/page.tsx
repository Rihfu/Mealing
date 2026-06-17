import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const { userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  if (profile?.household_id) redirect('/planning');

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-paper px-4 py-8 sm:px-6">
      <section className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 text-center shadow-card sm:p-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={64} height={64} className="mx-auto" aria-hidden="true" />
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink">Crée ton foyer</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm text-ink-soft">
          Donne un nom à ton espace partagé. Tu pourras inviter les autres membres ensuite.
        </p>
        <div className="mt-7 text-left">
          <OnboardingForm />
        </div>
      </section>
    </main>
  );
}
