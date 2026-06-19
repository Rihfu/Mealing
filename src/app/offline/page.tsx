import Link from 'next/link';

/**
 * Page de repli hors-ligne (pré-cachée par le service worker). Affichée quand une
 * navigation échoue sans réseau et qu'aucune version en cache n'existe. Volontairement
 * statique et sans données (utilisable sans connexion ni session).
 */
export const metadata = { title: 'Hors-ligne — Mealing' };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="" width={56} height={56} aria-hidden="true" />
      <h1 className="font-display text-2xl font-semibold text-ink">Tu es hors-ligne</h1>
      <p className="max-w-sm text-sm text-ink-soft">
        Cette page n’a pas encore été chargée. Reconnecte-toi à internet, ou reviens à une page déjà
        consultée (ta liste de courses reste disponible si tu l’as ouverte récemment).
      </p>
      <Link href="/courses" className="btn-primary mt-1 py-2.5">
        Réessayer ma liste
      </Link>
    </main>
  );
}
