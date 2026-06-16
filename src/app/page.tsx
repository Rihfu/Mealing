import { redirect } from 'next/navigation';

export default function RootPage() {
  // Le gating réel (auth + foyer) est assuré par le layout (app) et /onboarding.
  redirect('/planning');
}
