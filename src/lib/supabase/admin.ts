import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env';
import { serverEnv } from '@/lib/env.server';
import type { Database } from './types';

/**
 * Client Supabase ADMIN (service_role) — SERVEUR UNIQUEMENT.
 * Contourne le Row Level Security : à n'utiliser que pour des opérations
 * d'administration contrôlées (jamais exposé à une requête utilisateur brute).
 */
export function createSupabaseAdminClient() {
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY manquant. Ajoutez-le dans .env.local pour les opérations admin.',
    );
  }

  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
