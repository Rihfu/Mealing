'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface AuthFormState {
  error?: string;
  message?: string;
}

const credentialsSchema = z.object({
  email: z.string().email('Email invalide.'),
  password: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères.'),
});

export async function signIn(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Champs invalides.' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: 'Identifiants incorrects.' };
  }

  redirect('/');
}

export async function signUp(
  _prevState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Champs invalides.' };
  }

  const supabase = await createSupabaseServerClient();
  // Le lien de confirmation doit rediriger vers /auth/callback (seul endroit qui
  // échange le code contre une session). Sans emailRedirectTo, Supabase renvoie vers
  // la racine du site → compte confirmé mais AUCUNE session créée (l'utilisateur
  // retombe sur /login sans explication — constat des premiers tests réels).
  const h = await headers();
  const origin = h.get('origin') ?? `https://${h.get('x-forwarded-host') ?? h.get('host') ?? 'mealings.netlify.app'}`;
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    // Anti-énumération : ne pas révéler qu'un email est déjà inscrit → même message
    // neutre qu'une inscription réussie. Les autres erreurs (email invalide, rate
    // limit…) restent utiles et sont affichées telles quelles.
    if (/already (registered|exists)/i.test(error.message)) {
      return {
        message:
          'Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.',
      };
    }
    return { error: error.message };
  }

  // Si la confirmation email est activée, aucune session n'est créée immédiatement.
  if (!data.session) {
    return {
      message:
        'Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse, puis connectez-vous.',
    };
  }

  redirect('/');
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
