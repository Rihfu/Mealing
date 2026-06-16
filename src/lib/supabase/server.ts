import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { publicEnv } from '@/lib/env';
import type { Database } from './types';

/**
 * Client Supabase côté serveur (Server Components, Server Actions, Route Handlers).
 * Next.js 16 : `cookies()` est asynchrone -> on l'await.
 * Un nouveau client est créé à chaque requête (ne jamais partager entre requêtes).
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Appelé depuis un Server Component (cookies non modifiables ici) :
            // le rafraîchissement de session est assuré par proxy.ts.
          }
        },
      },
    },
  );
}
