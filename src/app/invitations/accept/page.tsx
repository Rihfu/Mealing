import Link from 'next/link';
import { getAuthContext } from '@/lib/auth';
import { acceptInvitationAction } from './actions';

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  const { userId } = await getAuthContext();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">Invitation au foyer</h1>

      {!token ? (
        <p className="text-sm text-red-600">Lien d’invitation invalide (token manquant).</p>
      ) : !userId ? (
        <>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Connectez-vous ou créez un compte, puis rouvrez ce lien d’invitation pour rejoindre le
            foyer.
          </p>
          <Link
            href="/login"
            className="self-start rounded bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
          >
            Se connecter
          </Link>
        </>
      ) : (
        <>
          {error && (
            <p className="text-sm text-red-600">
              Cette invitation n’est plus valide (déjà utilisée ou expirée).
            </p>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-300">
            En acceptant, vous rejoignez ce foyer et partagez son stock, ses courses et ses repas
            planifiés.
          </p>
          <form action={acceptInvitationAction}>
            <input type="hidden" name="token" value={token} />
            <button className="rounded bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black">
              Rejoindre le foyer
            </button>
          </form>
        </>
      )}
    </main>
  );
}
