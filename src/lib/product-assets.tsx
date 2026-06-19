/* ===================================================================
   Mealing — Banque d'assets : figures produits (handoff Claude Design)
   -------------------------------------------------------------------
   Pictos « doodle » monoline (style hand-drawn pastel Mealing) par type
   de produit, + rayons (catégories) et puces de provenance. Réutilisable
   dans tous les écrans (courses, stock, recettes, planning…).

   viewBox 24×24, trait = currentColor, stroke-width ~1.6, bouts ronds,
   remplissage translucide léger pour l'effet « croquis ».

   Usage React :
     import { ProductIcon, CATEGORIES, PROVENANCE } from '@/lib/product-assets';
     <ProductIcon slug="carotte" size={22} />
   =================================================================== */

export type CategoryKey =
  | 'legumes'
  | 'proteines'
  | 'cremerie'
  | 'boulangerie'
  | 'epicerie'
  | 'sucre'
  | 'surgeles'
  | 'boissons'
  | 'maison';

export interface CategoryDef {
  label: string;
  tint: string; // couleur de fond du jeton (CSS var)
  ink: string; // couleur d'encre du jeton
}

/**
 * Rayons : clé stable (= `food.category`) → libellé + teinte de jeton.
 * L'ordre des entrées fait foi pour l'affichage trié (parcours type magasin).
 * Les libellés collent à ceux du seed catalogue (migrations 0009/0011).
 */
export const CATEGORIES: Record<CategoryKey, CategoryDef> = {
  legumes: { label: 'Fruits & légumes', tint: 'var(--color-sage-tint)', ink: 'var(--color-sage-deep)' },
  proteines: { label: 'Viandes & poissons', tint: 'var(--color-clay-tint)', ink: '#a96a4a' },
  cremerie: { label: 'Crémerie & œufs', tint: 'var(--color-butter-tint)', ink: '#8a6d1f' },
  boulangerie: { label: 'Pains & céréales', tint: 'var(--color-butter-tint)', ink: '#8a6d1f' },
  epicerie: { label: 'Épicerie salée', tint: 'var(--color-sage-tint)', ink: 'var(--color-sage-deep)' },
  sucre: { label: 'Épicerie sucrée', tint: 'var(--color-butter-tint)', ink: '#8a6d1f' },
  surgeles: { label: 'Surgelés', tint: 'var(--color-sage-tint)', ink: 'var(--color-sage-deep)' },
  boissons: { label: 'Boissons', tint: 'var(--color-clay-tint)', ink: '#a96a4a' },
  maison: { label: 'Maison & entretien', tint: 'var(--color-clay-tint)', ink: '#a96a4a' },
};

/** Clés de rayon dans l'ordre d'affichage (l'ordre de `CATEGORIES` fait foi). */
export const CATEGORY_ORDER = Object.keys(CATEGORIES) as CategoryKey[];

/**
 * Tolérance : anciens libellés d'affichage (avant migration 0011) → clé stable.
 * Couvre aussi les libellés du seed 0009 historiques. Permet au lecteur de rester
 * robuste si une donnée porte encore un libellé (rétro-compat / état partiel).
 */
const LEGACY_LABEL_TO_KEY: Record<string, CategoryKey> = {
  'Fruits & légumes': 'legumes',
  'Viandes & poissons': 'proteines',
  'Viandes, poissons & œufs': 'proteines',
  'Crémerie & œufs': 'cremerie',
  'Frais & crémerie': 'cremerie',
  'Pains & céréales': 'boulangerie',
  'Épicerie salée': 'epicerie',
  'Épicerie sucrée': 'sucre',
  'Petit-déj & sucré': 'sucre',
  Surgelés: 'surgeles',
  Boissons: 'boissons',
  'Maison & entretien': 'maison',
};

/** Définition d'un rayon depuis sa clé stable (`food.category`) ; undefined si inconnue. */
export function categoryDef(key?: string | null): CategoryDef | undefined {
  if (!key) return undefined;
  return CATEGORIES[key as CategoryKey] ?? CATEGORIES[LEGACY_LABEL_TO_KEY[key]];
}

/** Libellé d'affichage d'un rayon depuis sa clé stable ; null si inconnue. */
export function categoryLabel(key?: string | null): string | null {
  return categoryDef(key)?.label ?? null;
}

/**
 * Palette de teintes proposée pour les rayons personnalisés (pastels Mealing).
 * `tint` = fond du jeton (stocké dans `shopping_category.tint`), `ink` = encre.
 * Élargie pour la personnalisation ; `rayonInk` retrouve l'encre depuis la teinte.
 */
export interface RayonColor {
  label: string;
  tint: string;
  ink: string;
}
export const RAYON_PALETTE: RayonColor[] = [
  { label: 'Vert', tint: 'var(--color-sage-tint)', ink: 'var(--color-sage-deep)' },
  { label: 'Beurre', tint: 'var(--color-butter-tint)', ink: '#8a6d1f' },
  { label: 'Terracotta', tint: 'var(--color-clay-tint)', ink: '#a96a4a' },
  { label: 'Bleu', tint: '#dce8f1', ink: '#3f6b85' },
  { label: 'Lavande', tint: '#e7e1f3', ink: '#6b5e9c' },
  { label: 'Rose', tint: '#f3e0e7', ink: '#a05c74' },
  { label: 'Menthe', tint: '#d8ece2', ink: '#3f7d63' },
  { label: 'Pêche', tint: '#f8e3d3', ink: '#b56a3c' },
  { label: 'Prune', tint: '#e8dde3', ink: '#7a5567' },
  { label: 'Ardoise', tint: '#e2e5e3', ink: '#5b6660' },
];

/** Encre lisible associée à une teinte de rayon (défaut terracotta si inconnue). */
export function rayonInk(tint?: string | null): string {
  return RAYON_PALETTE.find((p) => p.tint === tint)?.ink ?? '#a96a4a';
}

export type ProvenanceKey = 'repas' | 'essentiel' | 'ajoute';

export interface ProvenanceDef {
  label: string;
  tint: string;
  ink: string;
  svg: string;
}

/** Provenance d'une ligne de courses (puce discrète). */
export const PROVENANCE: Record<ProvenanceKey, ProvenanceDef> = {
  repas: {
    label: 'repas',
    tint: 'var(--color-sage-tint)',
    ink: 'var(--color-sage-deep)',
    svg: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  },
  essentiel: {
    label: 'essentiel',
    tint: 'var(--color-butter-tint)',
    ink: '#8a6d1f',
    svg: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  },
  ajoute: {
    label: 'ajouté',
    tint: 'var(--color-clay-tint)',
    ink: '#a96a4a',
    svg: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  },
};

export interface ProductDef {
  key: string;
  label: string;
  cat: string; // regroupement de la banque d'assets (showcase) — indépendant des rayons DB
  svg: string;
}

/** Icône générique (produit ou emblème de rayon) : forme commune {key,label,svg}. */
export interface IconDef {
  key: string;
  label: string;
  svg: string;
}

export const PRODUCTS: ProductDef[] = [
  // Fruits & légumes
  { key: 'brocoli', label: 'Brocoli', cat: 'legumes', svg: '<circle cx="9" cy="8" r="2.3" fill="currentColor" fill-opacity=".12"/><circle cx="13.5" cy="6.6" r="2.6" fill="currentColor" fill-opacity=".12"/><circle cx="16" cy="9.6" r="2.2" fill="currentColor" fill-opacity=".12"/><path d="M9.4 10.2 11.2 13h1.6l2-3.2"/><path d="M12 13v7"/><path d="M8.5 20h7"/>' },
  { key: 'carotte', label: 'Carotte', cat: 'legumes', svg: '<path d="M5 19a3 3 0 0 0 4.2 0L18 10l-4-4-8.8 8.8A3 3 0 0 0 5 19Z" fill="currentColor" fill-opacity=".12"/><path d="m9.5 9.5 1.6 1.6M12.5 6.5l1.6 1.6"/><path d="M14 6c.2-1.8 1.4-3 3.2-2.8M18 10c1.8.2 3-1 2.8-3"/>' },
  { key: 'tomate', label: 'Tomate', cat: 'legumes', svg: '<circle cx="12" cy="14" r="6.2" fill="currentColor" fill-opacity=".12"/><path d="M12 7.8c-1.2-2-3-2.2-4-2 .2 1.6 1.4 2.6 2.6 2.8M12 7.8c1.2-2 3-2.2 4-2-.2 1.6-1.4 2.6-2.6 2.8M12 5.5v2.3"/>' },
  { key: 'pomme', label: 'Pomme', cat: 'legumes', svg: '<path d="M12 8c-1-2-3-2.6-4.6-1.8C5 7.4 4.5 10 5.4 12.8c.7 2.2 2 4.6 3.4 5.6 1 .7 2 .4 3.2.4s2.2.3 3.2-.4c1.4-1 2.7-3.4 3.4-5.6.9-2.8.4-5.4-2-6.6C18 5.4 13 6 12 8Z" fill="currentColor" fill-opacity=".12"/><path d="M12 8c.2-1.6 1-3 2.6-3.4"/>' },
  { key: 'banane', label: 'Banane', cat: 'legumes', svg: '<path d="M5 9c1 5 5 8.5 10 8.5 1.6 0 3-.4 3.8-1-1.2.2-2.2 0-2.2 0 1.6-1.2 2.2-2.8 2.2-2.8C16 13 9 12.5 6.5 7.5 6 8 5.4 8.4 5 9Z" fill="currentColor" fill-opacity=".12"/>' },
  { key: 'herbes', label: 'Herbes / basilic', cat: 'legumes', svg: '<path d="M12 21c0-4 0-8 0-13"/><path d="M12 9c0-2.2 1.6-3.7 4-3.7.2 2.2-1.4 3.8-4 3.8Z" fill="currentColor" fill-opacity=".12"/><path d="M12 9c0-2.2-1.6-3.7-4-3.7-.2 2.2 1.4 3.8 4 3.8Z" fill="currentColor" fill-opacity=".12"/><path d="M12 13.5c0-1.9 1.4-3.2 3.4-3.2.2 1.9-1.2 3.3-3.4 3.3Z" fill="currentColor" fill-opacity=".12"/><path d="M12 13.5c0-1.9-1.4-3.2-3.4-3.2-.2 1.9 1.2 3.3 3.4 3.3Z" fill="currentColor" fill-opacity=".12"/>' },
  { key: 'oignon', label: 'Oignon', cat: 'legumes', svg: '<path d="M12 4c-1.4 1.4-1.4 3 0 4 1.4-1 1.4-2.6 0-4Z"/><path d="M12 8c-3.6 0-6 2.6-6 6s2.4 6 6 6 6-2.6 6-6-2.4-6-6-6Z" fill="currentColor" fill-opacity=".12"/><path d="M10 9.5C8.4 11 8 13.6 9.5 19M14 9.5c1.6 1.5 2 4.1.5 9.5"/>' },
  { key: 'poivron', label: 'Poivron', cat: 'legumes', svg: '<path d="M12 7c2-2 5-1.6 6 .4 1.4 3 .6 7-2 9.4-1.2 1.2-2.6 1.2-4 0C9 14.4 8.2 10 9.6 7.4 10.6 5.4 13 5 14 7" fill="currentColor" fill-opacity=".12"/><path d="M12 7V4.5"/>' },
  { key: 'champignon', label: 'Champignon', cat: 'legumes', svg: '<path d="M5 11a7 7 0 0 1 14 0Z" fill="currentColor" fill-opacity=".12"/><path d="M10 11v5a2 2 0 0 0 4 0v-5"/>' },
  { key: 'citron', label: 'Citron', cat: 'legumes', svg: '<ellipse cx="12" cy="13" rx="6.4" ry="4.8" transform="rotate(-25 12 13)" fill="currentColor" fill-opacity=".12"/><path d="M6.2 15.7 5.2 16.7M17.8 10.3l1-1"/><path d="M15.4 8.6c.3-1.8 1.8-2.8 3.4-2.5-.1 1.7-1.5 2.8-3.1 2.7"/>' },
  { key: 'salade', label: 'Salade', cat: 'legumes', svg: '<path d="M4 12h16a8 8 0 0 1-16 0Z" fill="currentColor" fill-opacity=".12"/><path d="M7 12c-1-2-.6-4 1-5 1 .6 1.4 1.6 1.4 2.6M12 12c-.6-3 .6-6 3-7 1.4 2.2 1 5-1 6.4M16.5 12c.6-1.6 2-2.6 3.5-2.6"/>' },
  { key: 'poire', label: 'Poire', cat: 'legumes', svg: '<path d="M12 8C9.5 8.5 8.2 11 8 13.4c-.2 2.6 1.4 5.1 4 5.1s4.2-2.5 4-5.1C15.8 11 14.5 8.5 12 8Z" fill="currentColor" fill-opacity=".12"/><path d="M12 8V4.5"/><path d="M12.2 5.5c.3-1.5 1.7-2.4 3.2-2.2-.1 1.5-1.4 2.5-2.9 2.4"/>' },
  { key: 'raisin', label: 'Raisin', cat: 'legumes', svg: '<circle cx="9.2" cy="11.2" r="2" fill="currentColor" fill-opacity=".12"/><circle cx="13" cy="10.4" r="2" fill="currentColor" fill-opacity=".12"/><circle cx="16" cy="11.8" r="2" fill="currentColor" fill-opacity=".12"/><circle cx="11" cy="14.6" r="2" fill="currentColor" fill-opacity=".12"/><circle cx="14.7" cy="14.2" r="2" fill="currentColor" fill-opacity=".12"/><circle cx="12.8" cy="17.8" r="2" fill="currentColor" fill-opacity=".12"/><path d="M13 8.6 12.5 6"/><path d="M12.5 6c0-1.4 1.4-2.4 3-2.2-.2 1.4-1.4 2.2-2.8 2.2"/>' },
  { key: 'peche', label: 'Pêche', cat: 'legumes', svg: '<circle cx="12" cy="13.2" r="6.2" fill="currentColor" fill-opacity=".12"/><path d="M12.2 7.2c.2-1.4 1-2.6 2.4-3 .2 1.4-.4 2.6-1.6 3.2"/><path d="M11.6 7.5C10 9.1 9.4 11 9.8 13.4 10 14.8 10.6 16 11.5 17"/>' },
  { key: 'cerise', label: 'Cerise', cat: 'legumes', svg: '<circle cx="8.5" cy="16.5" r="3.2" fill="currentColor" fill-opacity=".12"/><circle cx="15.5" cy="15.5" r="3.2" fill="currentColor" fill-opacity=".12"/><path d="M8.5 13.3C9 9 11 6 14 5M15.5 12.3C15.5 9 14.8 7 14 5"/><path d="M14 5c1-1.2 2.6-1.4 4-.6-.6 1.4-2 2-3.4 1.4"/>' },
  { key: 'ananas', label: 'Ananas', cat: 'legumes', svg: '<path d="M7.5 12c0-2.6 2-4.6 4.5-4.6s4.5 2 4.5 4.6v2.6c0 3-2 5.4-4.5 5.4S7.5 17.6 7.5 14.6Z" fill="currentColor" fill-opacity=".12"/><path d="M9 11.5 15 17M15 11.5 9 17"/><path d="M12 7.4c-.6-2-1.8-3.2-3.6-3.2.2 2 1.4 3.2 3.6 3.2ZM12 7.4c.6-2 1.8-3.2 3.6-3.2-.2 2-1.4 3.2-3.6 3.2ZM12 7.4V4"/>' },
  { key: 'mangue', label: 'Mangue', cat: 'legumes', svg: '<path d="M16 6c2.5 1.5 4 4.5 3 7.5s-4 5.5-7.5 5.5c-3 0-5.5-1.5-6-4-.6-3 1.5-6.5 5-8 1.8-.8 3.7-1.2 5.5-1Z" fill="currentColor" fill-opacity=".12"/><path d="M16 6c.6-1.2 1.8-1.8 3-1.5-.2 1.2-1.2 2-2.4 1.9"/>' },
  { key: 'melon', label: 'Melon', cat: 'legumes', svg: '<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity=".12"/><path d="M12 4c-2.4 2.4-2.4 13.6 0 16M12 4c2.4 2.4 2.4 13.6 0 16M4.2 10.5c4 1.2 11.6 1.2 15.6 0M4.2 13.5c4-1.2 11.6-1.2 15.6 0"/>' },
  { key: 'pasteque', label: 'Pastèque', cat: 'legumes', svg: '<path d="M4 18A16 16 0 0 1 20 18Z" fill="currentColor" fill-opacity=".12"/><path d="M4 18a16 16 0 0 1 16 0"/><path d="M6 18a10 10 0 0 1 12 0"/><path d="M10.6 14l-.6 1.4M13 13.6l.4 1.4M11.9 15.7l.2 1.2"/>' },
  { key: 'kiwi', label: 'Kiwi', cat: 'legumes', svg: '<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity=".12"/><circle cx="12" cy="12" r="2.2"/><path d="M12 7h.01M15 8.2h.01M16.8 11h.01M16.8 13.4h.01M15 16.2h.01M12 17.4h.01M9 16.2h.01M7.2 13.4h.01M7.2 11h.01M9 8.2h.01"/>' },
  { key: 'fraise', label: 'Fraise', cat: 'legumes', svg: '<path d="M6 12c0-2.4 2.4-4 6-4s6 1.6 6 4c0 4-3.4 8-6 8.5C9.4 20 6 16 6 12Z" fill="currentColor" fill-opacity=".12"/><path d="M9.5 6c0-1.2 1-2 2.5-2s2.5.8 2.5 2c-1 .4-1.8.6-2.5.6S10.5 6.4 9.5 6ZM12 8V5.5" fill="currentColor" fill-opacity=".12"/><path d="M10 11.5h.01M14 11.5h.01M12 13.5h.01M9.6 14.6h.01M14.4 14.6h.01M12 16.6h.01"/>' },
  { key: 'fruits-rouges', label: 'Fruits rouges', cat: 'legumes', svg: '<circle cx="8.8" cy="14.6" r="3.3" fill="currentColor" fill-opacity=".12"/><circle cx="15.3" cy="13.3" r="3" fill="currentColor" fill-opacity=".12"/><circle cx="12.3" cy="18.3" r="2.5" fill="currentColor" fill-opacity=".12"/><path d="M8.8 11.3l-.6-1M8.8 11.3l.6-1M8.8 11.3v-1.2M15.3 10.3l-.5-1M15.3 10.3l.5-1"/><path d="M14 6.5c1-1.2 2.6-1.4 4-.6-.6 1.4-2 2-3.4 1.4"/>' },
  { key: 'figue', label: 'Figue', cat: 'legumes', svg: '<path d="M12 7c-2.8.4-4.8 2.6-4.8 5.6 0 2.4 1.2 4.4 2.8 6 .9.9 1.3 1.9 1.6 2.4h.8c.3-.5.7-1.5 1.6-2.4 1.6-1.6 2.8-3.6 2.8-6C16.8 9.6 14.8 7.4 12 7Z" fill="currentColor" fill-opacity=".12"/><path d="M12 7V4.5M12 4.5c1-.6 2.2-.4 3 .4"/>' },
  { key: 'avocat', label: 'Avocat', cat: 'legumes', svg: '<path d="M12 4c-2.6 0-4.5 2.2-4.5 5 0 1.6.6 2.8.6 4 0 3.6 1.7 7.5 3.9 7.5s3.9-3.9 3.9-7.5c0-1.2.6-2.4.6-4 0-2.8-1.9-5-4.5-5Z" fill="currentColor" fill-opacity=".12"/><circle cx="12" cy="14.5" r="2.6" fill="currentColor" fill-opacity=".12"/>' },
  { key: 'pomme-de-terre', label: 'Pomme de terre', cat: 'legumes', svg: '<path d="M6 13c-1-3.4 1.6-6.6 5.4-7 3.4-.4 6.6 1.4 7.2 4.4.6 3-1.4 6-4.8 6.8C9.8 19 7 16.4 6 13Z" fill="currentColor" fill-opacity=".12"/><path d="m9.5 11.5.6.6M13 10.5l.5.5M11 14l.6.6M15 13l.5.5"/>' },
  { key: 'courgette', label: 'Courgette', cat: 'legumes', svg: '<path d="M7 8.5c1.5-2 4-2.3 6.5-1 2.6 1.4 4.5 4.2 4.5 7 0 2.2-1.4 3.5-3.4 3.2-2.4-.4-4.6-1.6-6.4-3.4C6.4 12.7 5.6 10.4 7 8.5Z" fill="currentColor" fill-opacity=".12"/><path d="M7 8.5 5.6 7M7 8.5c-.4-1 0-2 1-2.6"/>' },
  { key: 'aubergine', label: 'Aubergine', cat: 'legumes', svg: '<path d="M16.5 9c1.2 3-.4 7-3.6 9.2-3 2-6.4 1.6-7.6-.8-1-2.2.4-5 3.2-7 1.8-1.2 3.8-2 5.6-2 1 0 1.8.4 2.4.6Z" fill="currentColor" fill-opacity=".12"/><path d="M14 7.6c-1.2-.8-2.6-.8-3.8 0 .8 1.2 2 1.6 3.4 1.2M15.4 8.2c.4-1.4 1.4-2.2 2.6-2.4"/>' },
  { key: 'concombre', label: 'Concombre', cat: 'legumes', svg: '<path d="M5.5 16.5c-1.4-1.4-1-3.8.8-5.6l5.6-5.6c1.8-1.8 4.2-2.2 5.6-.8 1.4 1.4 1 3.8-.8 5.6l-5.6 5.6c-1.8 1.8-4.2 2.2-5.6.8Z" fill="currentColor" fill-opacity=".12"/><path d="m9 12 1 1M11.5 9.5l1 1M13.5 7.5l1 1"/>' },
  { key: 'mais', label: 'Maïs', cat: 'legumes', svg: '<path d="M9 4c-1.6 1.6-2 4.4-2 7.5C7 16 9 20 12 20s5-4 5-8.5c0-3.1-.4-5.9-2-7.5-1 .8-2 1-3 1s-2-.2-3-1Z" fill="currentColor" fill-opacity=".12"/><path d="M10 8v9M12 7.5v12.5M14 8v9M8 11h8M8 14h8"/><path d="M9 4c-1.6-.6-3 0-3.6 1.6 1.4.6 2.8.2 3.6-1.6ZM15 4c1.6-.6 3 0 3.6 1.6-1.4.6-2.8.2-3.6-1.6Z"/>' },
  { key: 'poireau', label: 'Poireau', cat: 'legumes', svg: '<path d="M9.5 21c-1 0-1.5-.7-1.5-1.8v-7h8v7c0 1.1-.5 1.8-1.5 1.8Z" fill="currentColor" fill-opacity=".12"/><path d="M8 12.2c-.4-3.4.4-6.6 2.2-9 .6 1 .8 2.4.8 3.8M16 12.2c.4-3.4-.4-6.6-2.2-9-.6 1-.8 2.4-.8 3.8M12 12.2V4.5"/>' },
  { key: 'chou-fleur', label: 'Chou / chou-fleur', cat: 'legumes', svg: '<circle cx="9.5" cy="9.5" r="2.4" fill="currentColor" fill-opacity=".12"/><circle cx="12.6" cy="8.2" r="2.6" fill="currentColor" fill-opacity=".12"/><circle cx="15" cy="10" r="2.4" fill="currentColor" fill-opacity=".12"/><circle cx="11" cy="11.4" r="2.2" fill="currentColor" fill-opacity=".12"/><circle cx="14" cy="11.8" r="2.2" fill="currentColor" fill-opacity=".12"/><path d="M8 12.5c-1.6.4-2.8 1.8-3 3.6 1.8 0 3-1 3.4-2.6M16 12.5c1.6.4 2.8 1.8 3 3.6-1.8 0-3-1-3.4-2.6M9 13.8c0 3 1.4 5.4 3 5.4s3-2.4 3-5.4"/>' },
  { key: 'courge', label: 'Courge / potiron', cat: 'legumes', svg: '<path d="M12 6c-3.6 0-6.5 3-6.5 6.8S8.4 19.5 12 19.5s6.5-3 6.5-6.7S15.6 6 12 6Z" fill="currentColor" fill-opacity=".12"/><path d="M12 6.2c-2 .4-3 3.2-3 6.6s1 6.2 3 6.6M12 6.2c2 .4 3 3.2 3 6.6s-1 6.2-3 6.6"/><path d="M12 6V3.5c1-.4 2 0 2.4 1"/>' },
  { key: 'betterave', label: 'Betterave', cat: 'legumes', svg: '<path d="M12 20.5c-2.8 0-5-2.4-5-5.4 0-2.4 1.4-4.4 3.4-5.2.8-.3 1.6-.9 1.6-2 0 1.1.8 1.7 1.6 2 2 .8 3.4 2.8 3.4 5.2 0 3-2.2 5.4-5 5.4Z" fill="currentColor" fill-opacity=".12"/><path d="M12 20.5c0 1 .4 1.8 1 2.3M12 8c-1-2.4-2.4-3.6-4-3.6.2 2 1.6 3.4 4 3.6ZM12 8c1-2.4 2.4-3.6 4-3.6-.2 2-1.6 3.4-4 3.6ZM12 8V4"/>' },
  { key: 'radis', label: 'Radis', cat: 'legumes', svg: '<path d="M12 21c-2.4 0-4.2-2-4.2-4.6 0-2.2 1.6-4 3.4-4.4.6-.1.8-.5.8-1.2 0 .7.2 1.1.8 1.2 1.8.4 3.4 2.2 3.4 4.4 0 2.6-1.8 4.6-4.2 4.6Z" fill="currentColor" fill-opacity=".12"/><path d="M12 21.5c.2.6.6 1 1.2 1.2M11 11c-.8-1.8-1.8-2.8-3.2-2.8.2 1.6 1.2 2.6 3 2.8M13 11c.8-1.8 1.8-2.8 3.2-2.8-.2 1.6-1.2 2.6-3 2.8M12 11V8"/>' },
  { key: 'asperge', label: 'Asperge', cat: 'legumes', svg: '<path d="M8 21c0-4 .2-7.5 1.4-9.6M12 21c0-4.5 0-8.4 0-10.8M16 21c0-4-.2-7.5-1.4-9.6"/><path d="M9.4 11.4c-.6-1-.6-2 0-3 .6 1 .6 2 0 3ZM12 10.2c-.7-1-.7-2.2 0-3.4.7 1.2.7 2.4 0 3.4ZM14.6 11.4c.6-1 .6-2 0-3-.6 1-.6 2 0 3Z" fill="currentColor" fill-opacity=".12"/><path d="M7 16.5h10"/>' },
  { key: 'petits-pois', label: 'Petits pois', cat: 'legumes', svg: '<path d="M6 7c-1 5 1.5 11 7 13 1.6.6 3 .4 3.8-.4-3.5-1.6-6-5.4-7-9.6C9.4 8.4 8 7.4 6 7Z" fill="currentColor" fill-opacity=".12"/><circle cx="9.5" cy="11" r="1.3"/><circle cx="11.5" cy="13.6" r="1.3"/><circle cx="13.6" cy="16.2" r="1.3"/>' },
  { key: 'gingembre', label: 'Gingembre', cat: 'legumes', svg: '<path d="M6 14c-1-2 0-4 2-4.5 1.4-.4 2-1.4 2-2.6 0 1.4 1.2 2.2 2.6 2 1.6-.2 2.8.6 3.4 1.8.6 1.4 2 1.6 3 1 .8 1.6 0 3.4-1.8 3.8-1.2.3-1.8 1.2-1.8 2.4 0-1.2-1.2-2-2.6-1.8-1.6.2-3-.4-3.6-1.6C8.8 13.6 7 13.4 6 14Z" fill="currentColor" fill-opacity=".12"/><path d="M10 10.5c.5.5.5 1.4 0 2M14 13c.5.5.5 1.4 0 2"/>' },
  { key: 'piment', label: 'Piment', cat: 'legumes', svg: '<path d="M7 9c4 0 7 2 9 6 .8 1.6 0 3.4-1.8 3.6-2.6.3-5.2-1.4-6.8-4C5.8 12 6 10 7 9Z" fill="currentColor" fill-opacity=".12"/><path d="M7 9c-.6-1.4-.4-2.6.6-3.6.8 1 1.8 1.4 3 1.2"/>' },
  // Frais & crémerie
  { key: 'lait', label: 'Lait', cat: 'cremerie', svg: '<path d="M8 3h8M9 3v2.8a4 4 0 0 1-.7 2.2l-.6 1A4 4 0 0 0 7 11.2V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-8.8a4 4 0 0 0-.7-2.2l-.6-1A4 4 0 0 1 15 5.8V3" fill="currentColor" fill-opacity=".10"/><path d="M7 14.5a6.5 6.5 0 0 1 5 0 6.5 6.5 0 0 0 5 0"/>' },
  { key: 'yaourt', label: 'Yaourt', cat: 'cremerie', svg: '<path d="M6 8h12l-1 11a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 19L6 8Z" fill="currentColor" fill-opacity=".12"/><path d="M5 8c0-1.6 3-2.4 7-2.4S19 6.4 19 8M9 12h6"/>' },
  { key: 'fromage', label: 'Fromage (part)', cat: 'cremerie', svg: '<path d="M4 16 14 6c4 0 6 2 6 6v4Z" fill="currentColor" fill-opacity=".12"/><path d="M4 16h16M9 12.5h.01M13 14h.01M16 11h.01"/>' },
  { key: 'fromage-bloc', label: 'Fromage (bloc)', cat: 'cremerie', svg: '<path d="M4 10 9 7h11v8l-5 3H4Z" fill="currentColor" fill-opacity=".12"/><path d="M4 10h11v8M15 10l5-3"/>' },
  { key: 'creme', label: 'Crème', cat: 'cremerie', svg: '<path d="M6 9h12l-.8 9.5a2 2 0 0 1-2 1.8H8.8a2 2 0 0 1-2-1.8Z" fill="currentColor" fill-opacity=".12"/><rect x="5" y="6.2" width="14" height="3.2" rx="1.2" fill="currentColor" fill-opacity=".12"/><path d="M9.5 13c1.6-.8 3.4-.8 5 0"/>' },
  { key: 'oeufs', label: 'Œufs', cat: 'cremerie', svg: '<path d="M9 21c-2.4 0-4-2-4-4.6C5 12 7 7 9 7s4 5 4 9.4C13 19 11.4 21 9 21Z" fill="currentColor" fill-opacity=".12"/><path d="M16 21c-1.6 0-2.8-1.4-2.8-3.4 0-3 1.4-6.6 2.8-6.6s2.8 3.6 2.8 6.6c0 2-1.2 3.4-2.8 3.4Z"/>' },
  { key: 'beurre', label: 'Beurre', cat: 'cremerie', svg: '<path d="M4 13 8 9h11a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4Z" fill="currentColor" fill-opacity=".12"/><path d="M4 13v3M8 9v7"/>' },
  // Viandes, poissons & œufs
  { key: 'poisson', label: 'Poisson / saumon', cat: 'proteines', svg: '<path d="M16.5 12c2 0 4-1.5 5.5-3-.5 2-.5 4 0 6-1.5-1.5-3.5-3-5.5-3Z"/><path d="M3 12c2.5-4.5 8-6 13.5-3 0 0-1.5 1.5-1.5 3s1.5 3 1.5 3C11 18 5.5 16.5 3 12Z" fill="currentColor" fill-opacity=".12"/><path d="M7 11h.01"/>' },
  { key: 'filet-poisson', label: 'Filet de poisson', cat: 'proteines', svg: '<path d="M5 14c2-5 7-9 13-9-1 5-5 11-10 12-1.6.3-2.6-1.2-3-3Z" fill="currentColor" fill-opacity=".12"/><path d="M8.4 12c1.4.5 2.8.5 4.2 0M9.4 14.5c1.4.5 2.8.5 4.2 0M10.6 9.5c1.4.5 2.8.5 4.2 0"/>' },
  { key: 'crevette', label: 'Crevette', cat: 'proteines', svg: '<path d="M17 6c-5-1.2-9.8 2-10.4 6.8C6 17 8.6 20 12.4 20c2 0 3.6-.8 4.6-2-2.8.4-5.4-1-6.4-3.6-1.2-3 .4-6.6 3.6-8 1-.4 2-.6 2.8-.4Z" fill="currentColor" fill-opacity=".12"/><path d="M10.5 11l-1 1.4M12.5 12l-1 1.4M14 13.5l-1 1.4"/><path d="M17 6c1.4-.6 2.6-.2 3.4 1M17 6c.4-1.2 0-2.4-1.2-3"/>' },
  { key: 'poulet', label: 'Poulet', cat: 'proteines', svg: '<path d="M14 4a4 4 0 0 1 4 6.5c-1 1-2.6 1.2-3.8.6l-1.4 1.4a2.5 2.5 0 1 1-3.6 3.6c-.6.6-1 1.5-1 2.4L8 19l-2 2-1.5-.5L4 19l1-1.4c.9 0 1.8-.4 2.4-1A2.5 2.5 0 1 1 11 13l1.4-1.4c-.6-1.2-.4-2.8.6-3.8A4 4 0 0 1 14 4Z" fill="currentColor" fill-opacity=".10"/>' },
  { key: 'viande', label: 'Viande', cat: 'proteines', svg: '<path d="M6 8.5c.5-3 3.5-5 7-4.6 3.8.4 6.6 3.2 6.4 6.8-.2 3-2.4 5.2-5.4 5.6-1 .1-1.7.5-2 1.4l-.7 2c-.4 1.1-2 1.1-2.4 0l-.7-2C6.5 14.5 5.6 11.4 6 8.5Z" fill="currentColor" fill-opacity=".12"/><circle cx="14.3" cy="9.5" r="1.7"/>' },
  { key: 'steak', label: 'Steak / bœuf', cat: 'proteines', svg: '<path d="M4.5 12c0-3.6 4-6 8-6 4.6 0 7 2.6 7 5.4 0 3.4-3.8 5.6-8 5.6-4 0-7-2.4-7-5Z" fill="currentColor" fill-opacity=".12"/><path d="M8 11c1-1.2 3-1.2 4 0M9 13.6c1-1 2.6-1 3.6 0"/>' },
  { key: 'saucisse', label: 'Saucisse', cat: 'proteines', svg: '<path d="M5.5 9.5C5.5 7 7.5 5.5 10 5.5c4.5 0 8.5 4 8.5 8.5 0 2.5-1.5 4.5-4 4.5-1.4 0-2.5-1.1-2.5-2.5 0-2.8-2.2-5-5-5C5.9 11 5.5 10.5 5.5 9.5Z" fill="currentColor" fill-opacity=".12"/><path d="M7 7 5.5 6M17 17l1.5 1"/>' },
  { key: 'jambon', label: 'Jambon', cat: 'proteines', svg: '<path d="M6 6c3-3 9-2 11 2s0 9-4 11-9 1-11-3c-1-2 0-4 1-5l-2-2Z" fill="currentColor" fill-opacity=".12"/><path d="m4 6 2 2M14 11h.01"/>' },
  // Épicerie & boulangerie
  { key: 'riz', label: 'Riz', cat: 'epicerie', svg: '<path d="M4 13h16a8 8 0 0 1-16 0Z" fill="currentColor" fill-opacity=".12"/><path d="M5 13c2-1.6 12-1.6 14 0"/><path d="M8 11h.01M10.5 10h.01M13 10.4h.01M15.5 11h.01M11.8 12h.01"/><path d="M14 4 19 9M16 3.5 20.5 8"/>' },
  { key: 'pates', label: 'Pâtes', cat: 'epicerie', svg: '<path d="M4 13h16a8 8 0 0 1-16 0Z" fill="currentColor" fill-opacity=".12"/><path d="M7 13c0-3 1-7 2-8M11 13c0-3 .5-8 1-9M15 13c0-3 1-7 2-8"/>' },
  { key: 'conserve', label: 'Conserve / boîte', cat: 'epicerie', svg: '<ellipse cx="12" cy="6" rx="6" ry="2.2" fill="currentColor" fill-opacity=".12"/><path d="M6 6v12c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V6"/><path d="M6 12c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/>' },
  { key: 'huile', label: 'Huile', cat: 'epicerie', svg: '<path d="M10 3h4v2.5l1.6 2.4A4 4 0 0 1 16 10v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8a4 4 0 0 1 .4-2.1L10 5.5Z" fill="currentColor" fill-opacity=".12"/><path d="M8 13h8"/>' },
  { key: 'pain', label: 'Pain (miche)', cat: 'epicerie', svg: '<path d="M4 11a4 4 0 0 1 1.2-7.6C6.5 3.2 8 4 8 4s1.5-1 3-1 3 1 3 1 1.5-.8 2.8-.6A4 4 0 0 1 20 11l-1 8a1.5 1.5 0 0 1-1.5 1.3h-11A1.5 1.5 0 0 1 5 19Z" fill="currentColor" fill-opacity=".12"/><path d="M8 4v15M16 4v15"/>' },
  { key: 'baguette', label: 'Baguette', cat: 'epicerie', svg: '<path d="M4.5 18.5c-1-1 .8-3.8 4-7s6-5 7-4-.8 3.8-4 7-6 5-7 4Z" fill="currentColor" fill-opacity=".12"/><path d="m9 12.5 1.5 1.5M11 10.5l1.5 1.5M13 8.5l1.5 1.5"/>' },
  { key: 'croissant', label: 'Croissant', cat: 'epicerie', svg: '<path d="M5 15.5a9 9 0 0 1 14 0 12 12 0 0 0-14 0Z" fill="currentColor" fill-opacity=".12"/><path d="M8 13.2l1.4 1.6M11 12.2l1.2 1.8M14 12.5l1 1.8"/>' },
  { key: 'pate-feuilletee', label: 'Pâte à dérouler', cat: 'epicerie', svg: '<path d="M13.5 7c0-1.4 1.2-2.2 2.7-2.2S19 5.6 19 7v9c0 1.4-1.2 2.2-2.8 2.2S13.5 17.4 13.5 16Z" fill="currentColor" fill-opacity=".12"/><ellipse cx="16.2" cy="7" rx="2.7" ry="1.2"/><path d="M13.5 9.5c-3.5.2-7 1.2-10 3.2l10 1.6" fill="currentColor" fill-opacity=".12"/><path d="M3.5 12.7l10 1.6"/>' },
  { key: 'farine', label: 'Farine / sac', cat: 'epicerie', svg: '<path d="M7.5 8.5c-.6-1 0-2.3 1.2-3L8 4h8l-.7 1.5c1.2.7 1.8 2 1.2 3l1 9.8A2 2 0 0 1 15.5 21h-7A2 2 0 0 1 6.5 18.3Z" fill="currentColor" fill-opacity=".10"/><path d="M8 4.5h8"/><path d="M12 17v-3.4M12 13.6c-1.3 0-1.9-1-1.9-2 1.3 0 1.9 1 1.9 2ZM12 13.6c1.3 0 1.9-1 1.9-2-1.3 0-1.9 1-1.9 2Z"/>' },
  { key: 'epices', label: "Pot d'épices", cat: 'epicerie', svg: '<path d="M7 10h10v8.5a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z" fill="currentColor" fill-opacity=".12"/><path d="M7.5 10V8a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v2" fill="currentColor" fill-opacity=".12"/><path d="M9.5 8.6h.01M12 8.6h.01M14.5 8.6h.01M9 13.5h6"/>' },
  { key: 'sauce', label: 'Bouteille de sauce', cat: 'epicerie', svg: '<path d="M10 3h4v2.5l.6 1.6a3 3 0 0 1 .4 1.5V19a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2V8.6a3 3 0 0 1 .4-1.5L10 5.5Z" fill="currentColor" fill-opacity=".12"/><rect x="9.6" y="11.5" width="4.8" height="5.5" rx=".6"/>' },
  { key: 'saliere', label: 'Salière / poivrière', cat: 'epicerie', svg: '<path d="M7 11a5 5 0 0 1 10 0v8a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19Z" fill="currentColor" fill-opacity=".12"/><path d="M7 13.5h10M10.5 8.5h.01M12 8h.01M13.5 8.5h.01"/>' },
  { key: 'bocal', label: 'Bocal (olives)', cat: 'epicerie', svg: '<rect x="6.5" y="8" width="11" height="12.5" rx="2" fill="currentColor" fill-opacity=".12"/><path d="M7.5 8V6.5a1.5 1.5 0 0 1 1.5-1.5h6a1.5 1.5 0 0 1 1.5 1.5V8"/><circle cx="9.8" cy="13" r="1.4"/><circle cx="13.5" cy="12.2" r="1.4"/><circle cx="11.8" cy="16" r="1.4"/><circle cx="14.6" cy="16" r="1.3"/>' },
  { key: 'noix', label: 'Noix / fruits secs', cat: 'epicerie', svg: '<path d="M12 4c-4 0-7 3-7 7 0 5 4 9 7 9s7-4 7-9c0-4-3-7-7-7Z" fill="currentColor" fill-opacity=".12"/><path d="M12 5v15M9 7c-1.5 2-1.5 5 0 8M15 7c1.5 2 1.5 5 0 8M9.5 11c1 .6 4 .6 5 0"/>' },
  { key: 'sucre', label: 'Sucre (morceaux)', cat: 'epicerie', svg: '<path d="M4 13l3.5-2 3.5 2v3.5l-3.5 2L4 16.5Z" fill="currentColor" fill-opacity=".12"/><path d="M4 13l3.5 2 3.5-2M7.5 15v3.5"/><path d="M13 11l3.5-2 3.5 2v3.5l-3.5 2-3.5-2Z" fill="currentColor" fill-opacity=".12"/><path d="M13 11l3.5 2 3.5-2M16.5 13v3.5"/>' },
  // Petit-déj & sucré
  { key: 'cafe', label: 'Café', cat: 'sucre', svg: '<path d="M5 8h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" fill="currentColor" fill-opacity=".12"/><path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c-.5.6-.5 1.4 0 2M11 3.5c-.5.6-.5 1.4 0 2"/>' },
  { key: 'the', label: 'Thé / infusion', cat: 'sucre', svg: '<path d="M6 9h10v4a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V9Z" fill="currentColor" fill-opacity=".12"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M11 3v3M11 6c-1 1-1 2 0 3"/>' },
  { key: 'chocolat', label: 'Chocolat', cat: 'sucre', svg: '<rect x="6" y="4" width="12" height="16" rx="1.5" fill="currentColor" fill-opacity=".12"/><path d="M12 4v16M6 9.3h12M6 14.6h12"/>' },
  { key: 'confiture', label: 'Confiture / miel', cat: 'sucre', svg: '<path d="M8 3h8v2H8z" fill="currentColor" fill-opacity=".12"/><path d="M7 8c0-1.6 2.2-3 5-3s5 1.4 5 3v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z" fill="currentColor" fill-opacity=".12"/><path d="M9 12h6"/>' },
  { key: 'biscuit', label: 'Biscuits', cat: 'sucre', svg: '<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity=".12"/><path d="M10 9h.01M14 10h.01M9 14h.01M14.5 14h.01M12 12.5h.01"/>' },
  { key: 'cereales', label: 'Céréales', cat: 'sucre', svg: '<path d="M6 4h12l-1 4H7Z" fill="currentColor" fill-opacity=".12"/><path d="M6 8h12l-1 11a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 19Z" fill="currentColor" fill-opacity=".12"/><path d="M10 13h4"/>' },
  // Boissons
  { key: 'eau', label: 'Eau', cat: 'boissons', svg: '<path d="M9 2h6v2l1 2v13a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V6l1-2Z" fill="currentColor" fill-opacity=".12"/><path d="M8 11h8"/>' },
  { key: 'vin', label: 'Vin', cat: 'boissons', svg: '<path d="M7 4h10s-.5 7-5 7-5-7-5-7Z" fill="currentColor" fill-opacity=".12"/><path d="M12 11v6M8.5 21h7"/>' },
  { key: 'biere', label: 'Bière', cat: 'boissons', svg: '<path d="M7 7h10l-1 12.5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 19.5Z" fill="currentColor" fill-opacity=".12"/><path d="M7 7c0-1.5 1-2.5 2.5-2 .8-1 2.2-1.2 3.2-.4 1-.6 2.3-.3 2.8.8 1.2 0 2 1 1.5 2.1-.8.5-9.2.5-10 0Z" fill="currentColor" fill-opacity=".12"/><path d="M7.3 11h9.4"/>' },
  { key: 'jus', label: 'Jus', cat: 'boissons', svg: '<path d="M6 7h12l-1.2 12.4A2 2 0 0 1 14.8 21H9.2a2 2 0 0 1-2-1.6L6 7Z" fill="currentColor" fill-opacity=".12"/><path d="M5 7h14M11 3l2 1.5L11 7"/>' },
  { key: 'lait-vegetal', label: 'Lait végétal (brique)', cat: 'boissons', svg: '<path d="M7 9h10v9.8a1.6 1.6 0 0 1-1.6 1.7H8.6A1.6 1.6 0 0 1 7 18.8Z" fill="currentColor" fill-opacity=".12"/><path d="M7 9l1.6-4.2h6.8L17 9"/><path d="M10.5 15.5c0-1.6 1.2-2.7 2.8-2.7.1 1.6-1.1 2.8-2.8 2.7Zm0 0V14"/>' },
  { key: 'soda', label: 'Soda (bouteille)', cat: 'boissons', svg: '<path d="M9 2h6v2l1 2v13a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V6l1-2Z" fill="currentColor" fill-opacity=".12"/><path d="M8.6 11.5h6.8v5H8.6z"/>' },
  { key: 'canette', label: 'Canette', cat: 'boissons', svg: '<rect x="7" y="5" width="10" height="15" rx="2.5" fill="currentColor" fill-opacity=".12"/><path d="M7 8h10M10 6.3h4M11.6 6.3l1 1.4"/>' },
  // Plats & traiteur
  { key: 'plat-prepare', label: 'Plat préparé', cat: 'plats', svg: '<path d="M4 11h16l-1 7.5a2 2 0 0 1-2 1.8H7a2 2 0 0 1-2-1.8Z" fill="currentColor" fill-opacity=".12"/><path d="M3 11l1-2.5a1.5 1.5 0 0 1 1.4-1h13.2a1.5 1.5 0 0 1 1.4 1L21 11Z" fill="currentColor" fill-opacity=".12"/><path d="M3 11h18M10 5.5c-.5-.8-.5-1.6 0-2.4M14 5.5c-.5-.8-.5-1.6 0-2.4"/>' },
  { key: 'tofu', label: 'Tofu / steak végétal', cat: 'plats', svg: '<path d="M5 10l7-3 7 3v6l-7 3-7-3Z" fill="currentColor" fill-opacity=".12"/><path d="M5 10l7 3 7-3M12 13v6"/><path d="M12 7c1-1.4 2.6-1.8 4.2-1.2-.4 1.6-1.8 2.4-3.4 2"/>' },
  { key: 'burger', label: 'Burger', cat: 'plats', svg: '<path d="M4.5 10a7.5 7.5 0 0 1 15 0Z" fill="currentColor" fill-opacity=".12"/><path d="M9 6.5h.01M12 6h.01M15 6.5h.01M4.5 10h15"/><path d="M4.5 13c1-1 2-1 3 0s2 1 3 0 2-1 3 0 2 1 3 0 1.5-.5 3 0"/><path d="M5 15.5h14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 15.5Z" fill="currentColor" fill-opacity=".12"/>' },
  // Surgelés
  { key: 'surgele', label: 'Surgelé', cat: 'surgeles', svg: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/><path d="M12 6 9.5 4M12 6l2.5-2M12 18l-2.5 2M12 18l2.5 2M6 12 4 9.5M6 12l-2 2.5M18 12l2-2.5M18 12l2 2.5"/>' },
  { key: 'glace', label: 'Glace', cat: 'surgeles', svg: '<path d="M8 10a4 4 0 0 1 8 0Z" fill="currentColor" fill-opacity=".12"/><path d="M8 10h8l-3.4 9a.6.6 0 0 1-1.2 0Z" fill="currentColor" fill-opacity=".08"/>' },
  { key: 'legumes_surgeles', label: 'Légumes surgelés', cat: 'surgeles', svg: '<rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor" fill-opacity=".10"/><path d="M9 8.5 8 5M12 8.5V5M15 8.5 16 5M8 13h.01M12 13h.01M16 13h.01M10 16h.01M14 16h.01"/>' },
  // Maison & entretien
  { key: 'eponge', label: 'Éponge', cat: 'maison', svg: '<rect x="4" y="8" width="16" height="9" rx="2.5" fill="currentColor" fill-opacity=".12"/><path d="M4 12.5h16M8 8c0-1.5 1-2.5 2.5-2.5M13 8c0-1.5 1-2.5 2.5-2.5"/><path d="M7 15h.01M10 15h.01M13 15h.01M16 15h.01"/>' },
  { key: 'poubelle', label: 'Sacs poubelle', cat: 'maison', svg: '<path d="M5 7h14l-1 13a2 2 0 0 1-2 1.8H8A2 2 0 0 1 6 20Z" fill="currentColor" fill-opacity=".12"/><path d="M3 7h18M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>' },
  { key: 'papier', label: 'Papier toilette', cat: 'maison', svg: '<rect x="5" y="6" width="14" height="12" rx="2" fill="currentColor" fill-opacity=".10"/><ellipse cx="9" cy="12" rx="3" ry="6" fill="currentColor" fill-opacity=".12"/><path d="M9 9v6"/>' },
  { key: 'essuie-tout', label: 'Essuie-tout', cat: 'maison', svg: '<path d="M6 8c0-1.6 2.7-2.8 6-2.8s6 1.2 6 2.8v9c0 1.6-2.7 2.8-6 2.8s-6-1.2-6-2.8Z" fill="currentColor" fill-opacity=".12"/><ellipse cx="12" cy="8" rx="6" ry="2.8"/><ellipse cx="12" cy="8" rx="2" ry=".9" fill="currentColor" fill-opacity=".12"/><path d="M18 11.5c1.8 0 2.6 1.2 2.6 2.8v4.5h-2.6M19 16h1.4"/>' },
  { key: 'mouchoirs', label: 'Boîte de mouchoirs', cat: 'maison', svg: '<path d="M4 11h16v6.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" fill="currentColor" fill-opacity=".12"/><path d="M4 11l1.5-2.5h13L20 11"/><path d="M10.5 9c.4-1.6 1-2.8 1.5-3.5.5.7 1.1 1.9 1.5 3.5" fill="currentColor" fill-opacity=".12"/>' },
  { key: 'spray', label: 'Spray nettoyant', cat: 'maison', svg: '<path d="M9.5 12h5.5v7.5a1.5 1.5 0 0 1-1.5 1.5h-2.5A1.5 1.5 0 0 1 9.5 19.5Z" fill="currentColor" fill-opacity=".12"/><path d="M9.5 12v-2h4v-2h3l1.5-1.5M13.5 8l-3.5 2"/><path d="M18.5 6l.4 1.6M20 6.8l-1 1.2M19.5 8.6l-1.4-.4"/>' },
  { key: 'nettoyant', label: 'Nettoyant', cat: 'maison', svg: '<path d="M9 8h6v11a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2Z" fill="currentColor" fill-opacity=".12"/><path d="M10 8V5h4M10 5 8 3M16 6h2M16 9h2M18 4h.01"/>' },
  { key: 'lessive', label: 'Bouteille de lessive', cat: 'maison', svg: '<path d="M8 9h7a2 2 0 0 1 2 2v8a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 19V11a2 2 0 0 1 2-2Z" fill="currentColor" fill-opacity=".12"/><path d="M9 9V6.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V9"/><path d="M17 11.5h2.5a1 1 0 0 1 1 1V15a1 1 0 0 1-1 1H17" fill="currentColor" fill-opacity=".12"/><path d="M8.5 13h6"/>' },
  { key: 'savon', label: 'Savon', cat: 'maison', svg: '<rect x="6" y="7" width="12" height="14" rx="2" fill="currentColor" fill-opacity=".12"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M9 12h6"/>' },
];

/**
 * Icônes « catégorie / rayon » génériques — à proposer quand l'utilisateur crée
 * son propre rayon de courses (emblèmes, pas des produits). Forme {key,label,svg}.
 */
export const CATEGORY_ICONS: IconDef[] = [
  { key: 'panier', label: 'Panier', svg: '<path d="M5 9h14l-1.2 9a2 2 0 0 1-2 1.7H8.2a2 2 0 0 1-2-1.7Z" fill="currentColor" fill-opacity=".12"/><path d="M5 9 8 4M19 9l-3-5M9.5 12.5v4M14.5 12.5v4"/>' },
  { key: 'chariot', label: 'Chariot', svg: '<path d="M3 5h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L21 8H7" fill="currentColor" fill-opacity=".12"/><circle cx="10" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>' },
  { key: 'etiquette', label: 'Étiquette', svg: '<path d="M3 12.5 11.5 4H20v8.5L11.5 21Z" fill="currentColor" fill-opacity=".12"/><circle cx="16" cy="8" r="1.3"/>' },
  { key: 'etoile', label: 'Étoile', svg: '<path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.8 6.7 19.6l1-5.8L3.5 9.7l5.9-.9Z" fill="currentColor" fill-opacity=".12"/>' },
  { key: 'coeur', label: 'Cœur', svg: '<path d="M12 20.5C5 16 2.5 12 2.5 8.5 2.5 6 4.5 4.5 6.8 4.5c1.8 0 3.4 1 4.2 2.4.8-1.4 2.4-2.4 4.2-2.4 2.3 0 4.3 1.5 4.3 4 0 3.5-2.5 7.5-9.5 12Z" fill="currentColor" fill-opacity=".12"/>' },
  { key: 'feuille', label: 'Feuille (végétal)', svg: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14Z" fill="currentColor" fill-opacity=".12"/><path d="M5 19C9 14 13 11 18 9"/>' },
  { key: 'flocon', label: 'Flocon (surgelé)', svg: '<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/><path d="M12 6l-2-1.5M12 6l2-1.5M12 18l-2 1.5M12 18l2 1.5M6 12l-1.5-2M6 12l-1.5 2M18 12l1.5-2M18 12l1.5 2"/>' },
  { key: 'bouteille', label: 'Bouteille', svg: '<path d="M10 3h4v3.5l1.2 2A4 4 0 0 1 16 11v7.5a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V11a4 4 0 0 1 .8-2.5L10 6.5Z" fill="currentColor" fill-opacity=".12"/><path d="M9 13h6"/>' },
  { key: 'pot', label: 'Pot / bocal', svg: '<rect x="6" y="8" width="12" height="12.5" rx="2" fill="currentColor" fill-opacity=".12"/><path d="M7.5 8V6a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 16.5 6v2M8 12h8"/>' },
  { key: 'sac', label: 'Sac', svg: '<path d="M6 8h12l-.8 11a2 2 0 0 1-2 1.8H8.8a2 2 0 0 1-2-1.8Z" fill="currentColor" fill-opacity=".12"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>' },
  { key: 'boite', label: 'Boîte', svg: '<path d="M3 8l9-4 9 4Z" fill="currentColor" fill-opacity=".12"/><path d="M3 8v8l9 4 9-4V8M12 12v8"/>' },
  { key: 'marmite', label: 'Marmite', svg: '<path d="M4 10h16v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5Z" fill="currentColor" fill-opacity=".12"/><path d="M2.5 10h19M5 10V8.5h14V10M9 8.5l.5-1.5h5l.5 1.5M4 13H2.5M20 13h1.5"/>' },
  { key: 'soleil', label: 'Soleil (petit-déj)', svg: '<circle cx="12" cy="12" r="4.5" fill="currentColor" fill-opacity=".12"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>' },
  { key: 'epi', label: 'Épi (céréales)', svg: '<path d="M12 21V8"/><path d="M12 9c-2 0-3.4-1.4-3.4-3.4C10.6 5.6 12 7 12 9ZM12 9c2 0 3.4-1.4 3.4-3.4C13.4 5.6 12 7 12 9Z" fill="currentColor" fill-opacity=".12"/><path d="M12 13.5c-2 0-3.4-1.4-3.4-3.4C10.6 10.1 12 11.5 12 13.5ZM12 13.5c2 0 3.4-1.4 3.4-3.4C13.4 10.1 12 11.5 12 13.5Z" fill="currentColor" fill-opacity=".12"/><path d="M12 18c-2 0-3.4-1.4-3.4-3.4C10.6 14.6 12 16 12 18ZM12 18c2 0 3.4-1.4 3.4-3.4C13.4 14.6 12 16 12 18Z" fill="currentColor" fill-opacity=".12"/>' },
];

/** Picto générique (article inconnu) : panier. */
export const FALLBACK: ProductDef = {
  key: 'panier',
  label: 'Article',
  cat: 'epicerie',
  svg: '<path d="M4 9h16l-1.4 9.4A2 2 0 0 1 16.6 20H7.4a2 2 0 0 1-2-1.6Z" fill="currentColor" fill-opacity=".12"/><path d="M4 9 8 3M20 9l-4-6M9 13v3M15 13v3"/>',
};

// Produits + emblèmes de rayon : ProductIcon résout les deux par clé.
const _byKey: Record<string, IconDef> = Object.fromEntries(
  [...PRODUCTS, ...CATEGORY_ICONS].map((p) => [p.key, p]),
);

/**
 * Alias : slugs du catalogue (`food.external_id` = `cat:<slug>`) → clé de picto.
 * Best-effort ; tout ce qui n'est pas mappé retombe sur FALLBACK (panier).
 */
const ALIASES: Record<string, string> = {
  echalote: 'oignon',
  ail: 'oignon',
  basilic: 'herbes',
  persil: 'herbes',
  epinards: 'salade',
  'creme-fraiche': 'lait',
  'yaourt-nature': 'yaourt',
  'fromage-rape': 'fromage',
  parmesan: 'fromage',
  emmental: 'fromage',
  camembert: 'fromage',
  mozzarella: 'fromage',
  'boeuf-hache': 'viande',
  steak: 'viande',
  lardons: 'viande',
  saumon: 'poisson',
  'filet-poisson': 'poisson',
  'thon-boite': 'poisson',
  'pois-chiches': 'conserve',
  'haricots-rouges': 'conserve',
  'tomates-pelees': 'conserve',
  'concentre-tomate': 'conserve',
  'bouillon-cube': 'conserve',
  moutarde: 'confiture',
  mayonnaise: 'confiture',
  ketchup: 'confiture',
  miel: 'confiture',
  'huile-olive': 'huile',
  'huile-tournesol': 'huile',
  vinaigre: 'huile',
  semoule: 'riz',
  quinoa: 'riz',
  lentilles: 'riz',
  levure: 'farine',
  biscuits: 'biscuit',
  'pain-de-mie': 'pain',
  orange: 'citron',
  fraise: 'pomme',
  'jus-orange': 'jus',
  'frites-surgelees': 'surgele',
  'legumes-surgeles': 'legumes_surgeles',
  pizza: 'surgele',
  // --- Catalogue étendu (migration 0012) ---
  // Fruits
  poire: 'pomme',
  raisin: 'pomme',
  peche: 'pomme',
  abricot: 'pomme',
  nectarine: 'pomme',
  prune: 'pomme',
  cerise: 'pomme',
  kiwi: 'pomme',
  ananas: 'pomme',
  mangue: 'pomme',
  melon: 'pomme',
  pasteque: 'pomme',
  framboise: 'pomme',
  myrtille: 'pomme',
  clementine: 'citron',
  mandarine: 'citron',
  pamplemousse: 'citron',
  'citron-vert': 'citron',
  grenade: 'pomme',
  figue: 'pomme',
  rhubarbe: 'salade',
  // Légumes
  'tomate-cerise': 'tomate',
  'patate-douce': 'carotte',
  'oignon-rouge': 'oignon',
  poireau: 'oignon',
  aubergine: 'poivron',
  chou: 'salade',
  'chou-fleur': 'brocoli',
  'chou-rouge': 'salade',
  'chou-bruxelles': 'brocoli',
  navet: 'carotte',
  radis: 'carotte',
  fenouil: 'salade',
  celeri: 'salade',
  'celeri-rave': 'carotte',
  artichaut: 'salade',
  panais: 'carotte',
  endive: 'salade',
  mache: 'salade',
  roquette: 'salade',
  blette: 'salade',
  piment: 'poivron',
  // Herbes
  coriandre: 'herbes',
  ciboulette: 'herbes',
  menthe: 'herbes',
  thym: 'herbes',
  romarin: 'herbes',
  laurier: 'herbes',
  origan: 'herbes',
  aneth: 'herbes',
  estragon: 'herbes',
  sauge: 'herbes',
  // Viandes
  boeuf: 'viande',
  'roti-boeuf': 'viande',
  entrecote: 'viande',
  bavette: 'viande',
  porc: 'viande',
  'cote-porc': 'viande',
  'filet-mignon': 'viande',
  'roti-porc': 'viande',
  saucisse: 'viande',
  chipolata: 'viande',
  merguez: 'viande',
  saucisson: 'jambon',
  agneau: 'viande',
  gigot: 'viande',
  'cotelette-agneau': 'viande',
  veau: 'viande',
  'escalope-veau': 'viande',
  canard: 'viande',
  'magret-canard': 'viande',
  lapin: 'viande',
  'blanc-poulet': 'poulet',
  'cuisse-poulet': 'poulet',
  dinde: 'poulet',
  'escalope-dinde': 'poulet',
  // Poissons
  cabillaud: 'poisson',
  colin: 'poisson',
  lieu: 'poisson',
  truite: 'poisson',
  dorade: 'poisson',
  bar: 'poisson',
  sole: 'poisson',
  sardine: 'poisson',
  maquereau: 'poisson',
  anchois: 'poisson',
  crevette: 'poisson',
  gambas: 'poisson',
  moules: 'poisson',
  calamar: 'poisson',
  'saint-jacques': 'poisson',
  surimi: 'poisson',
  crabe: 'conserve',
  'sardines-boite': 'conserve',
  // Crémerie
  'lait-demi-ecreme': 'lait',
  'lait-entier': 'lait',
  'lait-ecreme': 'lait',
  'creme-liquide': 'lait',
  margarine: 'beurre',
  'yaourt-grec': 'yaourt',
  'fromage-blanc': 'yaourt',
  'petit-suisse': 'yaourt',
  skyr: 'yaourt',
  comte: 'fromage',
  gruyere: 'fromage',
  cheddar: 'fromage',
  feta: 'fromage',
  chevre: 'fromage',
  brie: 'fromage',
  roquefort: 'fromage',
  ricotta: 'fromage',
  mascarpone: 'fromage',
  raclette: 'fromage',
  'creme-dessert': 'yaourt',
  // Pains & céréales
  baguette: 'pain',
  'pain-complet': 'pain',
  'pain-cereales': 'pain',
  'pain-burger': 'pain',
  biscotte: 'pain',
  wrap: 'pain',
  tortilla: 'pain',
  'pate-feuilletee': 'farine',
  'pate-brisee': 'farine',
  'pate-sablee': 'farine',
  'pate-pizza': 'farine',
  chapelure: 'farine',
  'farine-complete': 'farine',
  brioche: 'pain',
  croissant: 'pain',
  pita: 'pain',
  naan: 'pain',
  // Épicerie salée
  spaghetti: 'pates',
  penne: 'pates',
  macaroni: 'pates',
  tagliatelles: 'pates',
  lasagnes: 'pates',
  coquillettes: 'pates',
  nouilles: 'pates',
  gnocchi: 'pates',
  boulgour: 'riz',
  polenta: 'riz',
  couscous: 'riz',
  'riz-basmati': 'riz',
  'riz-complet': 'riz',
  flageolets: 'conserve',
  'haricots-blancs': 'conserve',
  'mais-boite': 'conserve',
  'sauce-tomate': 'conserve',
  'coulis-tomate': 'conserve',
  'tomates-concassees': 'conserve',
  'huile-colza': 'huile',
  'huile-sesame': 'huile',
  'vinaigre-balsamique': 'huile',
  'vinaigre-cidre': 'huile',
  'sauce-soja': 'huile',
  'nuoc-mam': 'huile',
  'fond-veau': 'conserve',
  'bouillon-volaille': 'conserve',
  'bouillon-legumes': 'conserve',
  'bouillon-boeuf': 'conserve',
  'lait-coco': 'conserve',
  'creme-coco': 'conserve',
  olives: 'conserve',
  cornichons: 'conserve',
  capres: 'conserve',
  chips: 'biscuit',
  cacahuetes: 'biscuit',
  noix: 'biscuit',
  noisettes: 'biscuit',
  amandes: 'biscuit',
  pignons: 'biscuit',
  'raisins-secs': 'biscuit',
  // Épicerie sucrée
  'chocolat-noir': 'chocolat',
  'chocolat-lait': 'chocolat',
  'chocolat-blanc': 'chocolat',
  'pepites-chocolat': 'chocolat',
  cacao: 'chocolat',
  'pate-a-tartiner': 'chocolat',
  'sirop-erable': 'confiture',
  compote: 'confiture',
  'the-vert': 'the',
  infusion: 'the',
  'flocons-avoine': 'cereales',
  muesli: 'cereales',
  granola: 'cereales',
  madeleines: 'biscuit',
  bonbons: 'biscuit',
  // Boissons
  'eau-gazeuse': 'eau',
  'jus-pomme': 'jus',
  'jus-multifruits': 'jus',
  'jus-raisin': 'jus',
  cola: 'soda',
  limonade: 'soda',
  'sirop-menthe': 'jus',
  'sirop-grenadine': 'jus',
  'vin-rouge': 'vin',
  'vin-blanc': 'vin',
  'vin-rose': 'vin',
  biere: 'soda',
  champagne: 'vin',
  cidre: 'vin',
  'lait-amande': 'lait',
  'lait-soja': 'lait',
  'lait-avoine': 'lait',
  // Surgelés
  'epinards-surgeles': 'legumes_surgeles',
  'poelee-legumes': 'legumes_surgeles',
  'petits-pois-surgeles': 'legumes_surgeles',
  'poisson-pane': 'surgele',
  nuggets: 'surgele',
  'cordon-bleu': 'surgele',
  'pommes-noisettes': 'surgele',
  sorbet: 'glace',
  'fruits-surgeles': 'legumes_surgeles',
  // Maison
  'liquide-vaisselle': 'nettoyant',
  lessive: 'savon',
  adoucissant: 'savon',
  'papier-toilette': 'papier',
  'essuie-tout': 'papier',
  'sacs-poubelle': 'poubelle',
  'film-alimentaire': 'papier',
  'papier-alu': 'papier',
  'papier-cuisson': 'papier',
  'nettoyant-multi': 'nettoyant',
  'gel-douche': 'savon',
  shampoing: 'savon',
  dentifrice: 'nettoyant',
  mouchoirs: 'papier',
  'tablettes-lv': 'nettoyant',
  javel: 'nettoyant',
};

/** Résout une icône (produit ou emblème) à partir d'un slug catalogue/clé. */
export function resolveProduct(slug?: string | null): IconDef {
  if (!slug) return FALLBACK;
  const k = slug.replace(/^cat:/, '');
  return _byKey[k] ?? _byKey[ALIASES[k] ?? ''] ?? FALLBACK;
}

/** Regroupe les produits par catégorie de la banque d'assets (showcase). */
export function productsByCategory(): Record<string, ProductDef[]> {
  const out: Record<string, ProductDef[]> = {};
  PRODUCTS.forEach((p) => {
    (out[p.cat] = out[p.cat] ?? []).push(p);
  });
  return out;
}

/** Picto produit (doodle monoline). `slug` accepte la clé brute ou `cat:<slug>`. */
export function ProductIcon({
  slug,
  size = 24,
  strokeWidth = 1.6,
  className,
}: {
  slug?: string | null;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const p = resolveProduct(slug);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: p.svg }}
    />
  );
}

/** Petite puce de provenance (icône + libellé), pour les lignes de courses. */
export function ProvenanceBadge({
  kind,
  labelHiddenOnMobile = false,
}: {
  kind: ProvenanceKey;
  /** Sur mobile (< sm), n'affiche que le picto (gain de largeur sur les lignes denses). */
  labelHiddenOnMobile?: boolean;
}) {
  const p = PROVENANCE[kind];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: p.tint, color: p.ink }}
      title={p.label}
    >
      <svg
        width={12}
        height={12}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: p.svg }}
      />
      <span className={labelHiddenOnMobile ? 'hidden sm:inline' : undefined}>{p.label}</span>
    </span>
  );
}
