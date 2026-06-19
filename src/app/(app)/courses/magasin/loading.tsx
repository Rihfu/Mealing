/** Squelette du mode magasin (affiché instantanément le temps du rendu serveur). */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-md animate-pulse pb-28" aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <div className="h-4 w-16 rounded bg-line/70" />
        <div className="h-7 w-40 rounded-lg bg-line" />
        <span className="w-12" />
      </div>
      <div className="mt-3 h-2.5 w-full rounded-full bg-line" />
      <div className="mt-6 space-y-4">
        {[0, 1].map((g) => (
          <div key={g}>
            <div className="mb-2 h-4 w-32 rounded bg-line/70" />
            <div className="flex flex-col gap-2.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 w-full rounded-2xl border border-line bg-surface" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
