import { redirect } from 'next/navigation';
import { getAuthContext } from '@/lib/auth';
import { FicheView } from './fiche-view';

/**
 * Fiche produit — page LÉGÈRE (auth + calcul du retour seulement). Les données passent
 * par le cache client (IndexedDB) via FicheView → ouverture instantanée + **consultation
 * hors-ligne** des fiches pré-chargées (cf. Phase 3 du chantier PWA).
 */
export default async function ProduitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { profile, userId } = await getAuthContext();
  if (!userId) redirect('/login');
  if (!profile?.household_id) redirect('/onboarding');
  const { id } = await params;

  // Retour vers la page d'origine (où on a cliqué). On n'accepte qu'un chemin interne
  // (sécurité : pas d'open-redirect via «//host»). Le repère ?viewed=<foodId>
  // (surbrillance au retour) n'est utilisé que par la liste de courses. Repli sur les
  // Statistiques si l'origine est inconnue.
  const sp = await searchParams;
  const rawFrom = typeof sp.from === 'string' ? sp.from : '';
  const from = /^\/(?!\/)/.test(rawFrom) ? rawFrom : null;
  // Libellé du bouton retour selon l'origine (du plus spécifique au plus général).
  const BACK_LABELS: ReadonlyArray<readonly [string, string]> = [
    ['/courses/historique/stats', 'Statistiques'],
    ['/courses/historique', 'Historique'],
    ['/courses/magasin', 'En magasin'],
    ['/courses', 'Liste de courses'],
    ['/stock', 'Stock'],
    ['/recettes', 'Recette'],
    ['/planning', 'Planning'],
    ['/nutrition', 'Nutrition'],
  ];
  const backLabel = from ? (BACK_LABELS.find(([p]) => from.startsWith(p))?.[1] ?? 'Retour') : 'Statistiques';
  const backHref = from ? (from === '/courses' ? `${from}?viewed=${id}` : from) : '/courses/historique/stats';

  return <FicheView foodId={id} backHref={backHref} backLabel={backLabel} />;
}
