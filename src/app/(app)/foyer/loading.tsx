/** Squelette instantané de la page Foyer (même gabarit que les autres sections). */
export default function FoyerLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-6">
      <div>
        <div className="h-7 w-56 rounded-lg bg-sage-tint/60" />
        <div className="mt-2 h-4 w-96 max-w-full rounded bg-line/60" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="flex flex-col gap-5">
          <div className="h-56 rounded-2xl border border-line bg-surface" />
          <div className="h-24 rounded-2xl border border-line bg-surface" />
        </div>
        <div className="flex flex-col gap-4">
          <div className="h-40 rounded-2xl border border-line bg-surface" />
          <div className="h-48 rounded-2xl border border-line bg-surface" />
          <div className="h-24 rounded-2xl border border-line bg-surface" />
        </div>
      </div>
    </div>
  );
}
