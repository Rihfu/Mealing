import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Callback de confirmation email Supabase : échange le `code` contre une session,
 * puis redirige vers l'application. Les cookies de session sont écrits ici (route
 * handler = contexte où les cookies sont modifiables).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Anti open-redirect : n'accepte qu'un chemin INTERNE (« / » sans « // » ni « \ » —
  // sinon `${origin}${next}` peut fabriquer un hôte externe, ex. next=".evil.com").
  const rawNext = searchParams.get('next') ?? '/';
  const next = /^\/(?!\/)/.test(rawNext) && !rawNext.includes('\\') ? rawNext : '/';

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
