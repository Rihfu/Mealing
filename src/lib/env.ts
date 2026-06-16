import { z } from 'zod';

/**
 * Variables d'environnement PUBLIQUES (NEXT_PUBLIC_*), sûres côté navigateur.
 * Référencées en littéral pour que Next.js les inline au build.
 * Ne JAMAIS ajouter ici une clé secrète : tout ce qui est ici part dans le bundle client.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_URL manquant'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY manquant'),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
