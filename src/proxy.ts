import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { publicEnv } from '@/lib/env';

/**
 * Proxy (ex-Middleware avant Next.js 16). Rafraîchit la session Supabase à chaque
 * requête en réécrivant les cookies sur la réponse. Indispensable pour que la
 * session reste valide côté Server Components (voir avertissements @supabase/ssr).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Headers anti-cache fournis par la lib (évite qu'un CDN serve la session d'un autre).
          if (headers) {
            for (const [key, value] of Object.entries(headers)) {
              response.headers.set(key, value);
            }
          }
        },
      },
    },
  );

  // IMPORTANT : appeler getUser() tôt pour déclencher le refresh avant la réponse.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  // Exécute le proxy partout sauf assets statiques.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
