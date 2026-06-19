/** Squelette de la fiche produit (affiché le temps du rendu serveur). */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-5" aria-hidden="true">
      <div>
        <div className="h-4 w-28 rounded bg-line/70" />
        <div className="mt-2 flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-line" />
          <div className="space-y-2">
            <div className="h-6 w-44 rounded-lg bg-line" />
            <div className="h-3 w-24 rounded bg-line/60" />
          </div>
        </div>
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-4">
          <div className="mb-3 h-5 w-40 rounded bg-line" />
          <div className="h-24 w-full rounded-xl bg-line/40" />
        </div>
      ))}
    </div>
  );
}
