import Link from 'next/link';

/** Bascule Historique / Statistiques (en tête de l'historique). */
export function HistoriqueTabs({ active }: { active: 'list' | 'stats' }) {
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
        on ? 'bg-sage-tint text-green-strong' : 'text-ink-soft hover:text-ink'
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="inline-flex rounded-full border border-line bg-surface p-1">
      {tab('/courses/historique', 'Historique', active === 'list')}
      {tab('/courses/historique/stats', 'Statistiques', active === 'stats')}
    </div>
  );
}
