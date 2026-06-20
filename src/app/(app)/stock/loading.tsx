/**
 * Squelette de chargement du Stock. Next.js l'affiche INSTANTANÉMENT pendant que le
 * serveur prépare la page (navigation perçue comme immédiate), avant que la vue
 * cache-first ne prenne le relais. Parité avec `courses/loading.tsx`.
 */
export default function Loading() {
  return (
    <div className="grid animate-pulse gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start" aria-hidden="true">
      <div className="flex items-start justify-between gap-3 lg:col-span-2">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded-lg bg-line" />
          <div className="h-4 w-64 rounded bg-line/70" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-32 rounded-xl bg-line/70" />
          <div className="h-9 w-40 rounded-xl bg-line/70" />
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft lg:col-start-2 lg:row-start-2">
        <div className="mb-3 h-5 w-36 rounded bg-line" />
        <div className="h-10 w-full rounded-xl bg-line/70" />
        <div className="mt-2 h-10 w-full rounded-xl bg-line/40" />
        <div className="mt-3 h-11 w-full rounded-xl bg-line" />
      </div>

      <div className="flex flex-col gap-4 lg:col-start-1">
        {[0, 1].map((s) => (
          <div key={s} className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-line" />
              <div className="h-5 w-24 rounded bg-line" />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                <div className="h-9 w-9 rounded-xl bg-line/70" />
                <div className="h-4 flex-1 rounded bg-line/60" />
                <div className="h-5 w-16 rounded-full bg-line/40" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
