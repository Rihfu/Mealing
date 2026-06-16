import { getAuthContext } from '@/lib/auth';
import { FoodSearch } from './food-search';

export default async function AlimentsPage() {
  const { supabase } = await getAuthContext();
  const { data: foods } = await supabase
    .from('food')
    .select('id, name, source, barcode')
    .order('name', { ascending: true })
    .limit(100);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">Aliments</h1>
        <p className="text-sm text-gray-500">
          Recherchez et importez des aliments (USDA pour les produits bruts, Open Food Facts pour
          les produits emballés). Leurs valeurs nutritionnelles serviront au calcul des recettes.
        </p>
      </div>

      <FoodSearch />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-gray-600">Aliments importés</h2>
        <ul className="flex flex-col divide-y divide-gray-200 text-sm dark:divide-gray-800">
          {(foods ?? []).map((f) => (
            <li key={f.id} className="py-2">
              {f.name}
              <span className="ml-2 text-xs text-gray-500">{f.source}</span>
            </li>
          ))}
          {(!foods || foods.length === 0) && (
            <li className="py-2 text-gray-500">Aucun aliment importé pour le moment.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
