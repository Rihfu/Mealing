/** Squelette instantané des statistiques du stock (parité Courses). */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-5">
      <div>
        <div className="h-4 w-28 rounded bg-line" />
        <div className="mt-2 h-7 w-56 rounded bg-line" />
        <div className="mt-1 h-4 w-44 rounded bg-line" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
          <div className="mb-3 h-5 w-40 rounded bg-line" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[0, 1, 2, 3].map((j) => (
              <div key={j} className="h-14 rounded-xl bg-paper" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
