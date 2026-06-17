import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const { userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  if (profile?.household_id) redirect('/planning');

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-2 p-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="" width={52} height={52} className="mx-auto" aria-hidden="true" />
      <h1 className="text-center text-2xl font-semibold text-ink">Crée ton foyer</h1>
      <p className="mx-auto mb-4 max-w-xs text-center text-sm text-ink-soft">
        Tu pourras inviter les autres membres ensuite.
      </p>
      <OnboardingForm />
    </main>
  );
}
