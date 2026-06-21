import { z } from 'zod';

/**
 * Variables d'environnement SECRÈTES (serveur uniquement).
 * Ce module ne doit JAMAIS être importé depuis un composant client.
 * Les clés des fournisseurs externes restent confinées ici puis consommées
 * exclusivement dans les couches d'abstraction (principe directeur n°5).
 */
const serverSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY manquant'),
  // Conservé en repli (l'abstraction `AIProvider` permet de rebasculer en un module).
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY manquant'),
  USDA_API_KEY: z.string().min(1, 'USDA_API_KEY manquant'),
  // Nécessaire seulement pour les opérations admin/serveur (contourne le RLS).
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  // Notifications push (Web Push / VAPID) — OPTIONNELLES : sans elles, le push est
  // simplement indisponible (l'app fonctionne normalement). Publique = aussi côté client.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
});

export const serverEnv = serverSchema.parse({
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  USDA_API_KEY: process.env.USDA_API_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT,
});
