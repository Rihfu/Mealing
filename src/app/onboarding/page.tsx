import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const { userId, profile } = await getAuthContext();
  if (!userId) redirect('/login');
  if (profile?.household_id) redirect('/planning');

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Bienvenue</h1>
        <p className="text-sm text-ink-soft">
          Créez votre foyer pour commencer à planifier vos repas. Vous pourrez inviter d’autres
          membres plus tard.
        </p>
      </div>
      <OnboardingForm />
    </main>
  );
}
