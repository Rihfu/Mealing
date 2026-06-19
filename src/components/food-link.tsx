import Link from 'next/link';

/**
 * Nom d'aliment cliquable → fiche produit (`/courses/produit/[foodId]`), depuis
 * n'importe quelle page. `from` = chemin de la page d'origine (le bouton retour de
 * la fiche y ramène). Sans `foodId` (texte libre non rattaché au catalogue), rend un
 * simple `<span>` non cliquable. L'affordance (vert + souligné) n'apparaît qu'au survol.
 *
 * Composant sans état : utilisable côté serveur **et** dans un composant client.
 */
export function FoodLink({
  foodId,
  from,
  className = '',
  children,
}: {
  foodId: string | null | undefined;
  from: string;
  className?: string;
  children: React.ReactNode;
}) {
  if (!foodId) return <span className={className}>{children}</span>;
  return (
    <Link
      href={`/courses/produit/${foodId}?from=${encodeURIComponent(from)}`}
      // Feedback de tap explicite (mobile) : surbrillance + couleur active immédiates,
      // car la fiche met un instant à charger (sinon on ne sait pas si le tap a pris).
      className={`${className} -mx-1 rounded px-1 transition-colors hover:text-green-strong hover:underline active:bg-sage-tint active:text-green-strong`.trim()}
    >
      {children}
    </Link>
  );
}
