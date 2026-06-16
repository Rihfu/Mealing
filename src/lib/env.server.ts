import { z } from 'zod';

/**
 * Variables d'environnement SECRÈTES (serveur uniquement).
 * Ce module ne doit JAMAIS être importé depuis un composant client.
 * Les clés des fournisseurs externes restent confinées ici puis consommées
 * exclusivement dans les couches d'abstraction (principe directeur n°5).
 */
const serverSchema = z.object({
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY manquant'),
  USDA_API_KEY: z.string().min(1, 'USDA_API_KEY manquant'),
  // Nécessaire seulement pour les opérations admin/serveur (contourne le RLS).
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

export const serverEnv = serverSchema.parse({
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  USDA_API_KEY: process.env.USDA_API_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
});
