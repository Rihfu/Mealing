/**
 * Squelette de chargement de la Liste de courses. Next.js l'affiche INSTANTANÉMENT
 * pendant que le serveur prépare la page (navigation perçue comme immédiate).
 */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-6" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-lg bg-line" />
        <div className="h-4 w-72 rounded bg-line/70" />
      </div>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="order-1 rounded-2xl border border-line bg-surface p-4 shadow-soft lg:order-none lg:col-start-2">
          <div className="mb-3 h-5 w-40 rounded bg-line" />
          <div className="h-10 w-full rounded-xl bg-line/70" />
          <div className="mt-2 h-10 w-full rounded-xl bg-line/40" />
          <div className="mt-3 h-11 w-full rounded-xl bg-line" />
        </div>
        <div className="order-2 rounded-2xl border border-line bg-surface p-4 shadow-soft lg:order-none lg:col-start-1 lg:row-span-2">
          <div className="mb-3 h-5 w-32 rounded bg-line" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
              <div className="h-5 w-5 rounded-md bg-line" />
              <div className="h-9 w-9 rounded-xl bg-line/70" />
              <div className="h-4 flex-1 rounded bg-line/60" />
              <div className="h-4 w-12 rounded bg-line/40" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
