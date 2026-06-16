import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fonctions backend réutilisables (principe directeur n°4).
 *
 * Toutes les opérations métier vivent ici, sous forme de fonctions pures prenant
 * un client Supabase en paramètre. L'interface humaine ET le futur assistant IA
 * agentique appelleront EXACTEMENT ces mêmes fonctions — aucune logique métier ne
 * doit être enfouie dans les composants d'interface.
 */
export type DB = SupabaseClient;

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type ConsumptionStatus = 'conforme' | 'different' | 'skipped';
export type StockTrackingMode = 'quantity' | 'presence';

/** Déballe un résultat Supabase ou lève une erreur explicite. */
export function unwrap<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error('Résultat vide inattendu.');
  return result.data;
}
