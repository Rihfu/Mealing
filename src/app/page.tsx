export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 p-8">
      <h1 className="text-3xl font-bold">Mealing</h1>
      <p className="text-balance text-gray-600 dark:text-gray-300">
        Planification de repas, nutrition et courses — réduire la charge mentale liée à
        l’alimentation quotidienne.
      </p>
      <p className="text-sm text-gray-500">
        Phase 0 — fondations en place : schéma de données, authentification, Row Level Security,
        couches d’abstraction des fournisseurs (USDA, Open Food Facts, Groq) et fonctions backend
        réutilisables.
      </p>
    </main>
  );
}
