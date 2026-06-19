/** Squelette de l'onglet Statistiques (affiché le temps du rendu serveur). */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-line/70" />
        <div className="h-7 w-56 rounded-lg bg-line" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl border border-line bg-surface" />
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="h-40 rounded-2xl border border-line bg-surface" />
      ))}
    </div>
  );
}
