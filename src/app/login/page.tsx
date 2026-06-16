import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const { userId } = await getAuthContext();
  if (userId) redirect('/');
  return <LoginForm />;
}
