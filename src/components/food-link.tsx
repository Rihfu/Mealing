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
      className={`${className} hover:text-green-strong hover:underline`.trim()}
    >
      {children}
    </Link>
  );
}
