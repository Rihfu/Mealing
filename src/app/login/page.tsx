import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { LoginForm } from './login-form';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { userId } = await getAuthContext();
  if (userId) redirect('/');
  // `?error=auth` = le callback de confirmation n'a pas pu créer de session (lien
  // ouvert sur un autre appareil que celui de l'inscription, ou lien expiré).
  const { error } = await searchParams;
  return <LoginForm callbackError={error === 'auth'} />;
}
