/** Squelette de l'historique des courses (affiché le temps du rendu serveur). */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-line/70" />
        <div className="h-7 w-64 rounded-lg bg-line" />
        <div className="h-4 w-48 rounded bg-line/60" />
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
            <div className="h-5 w-5 rounded bg-line" />
            <div className="h-4 flex-1 rounded bg-line/60" />
            <div className="h-6 w-20 rounded-full bg-line/40" />
            <div className="h-5 w-5 rounded bg-line/40" />
          </div>
        ))}
      </div>
    </div>
  );
}
