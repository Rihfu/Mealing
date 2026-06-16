import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/types';

type Profile = Database['public']['Tables']['profile']['Row'];

export interface AuthContext {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
}

/**
 * Contexte d'authentification côté serveur : client Supabase, utilisateur vérifié
 * (getUser contacte le serveur Auth) et profil associé. Un seul client par requête.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (user) {
    const { data } = await supabase
      .from('profile')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    profile = data;
  }

  return {
    supabase,
    userId: user?.id ?? null,
    email: user?.email ?? null,
    profile,
  };
}
