/**
 * Utilitaires d'asynchronisme partagés (SOURCE UNIQUE — principe n°4).
 */

/**
 * `map` avec concurrence bornée : exécute `fn` sur chaque élément avec au plus
 * `limit` exécutions simultanées (évite de saturer USDA/OFF et le budget temps
 * des server actions). Préserve l'ordre des résultats.
 */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
