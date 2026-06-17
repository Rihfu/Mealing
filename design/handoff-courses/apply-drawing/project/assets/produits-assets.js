/* ===================================================================
   Mealing — Banque d'assets : figures produits
   -------------------------------------------------------------------
   Jeu de pictos « doodle » monoline (style hand-drawn pastel Mealing)
   pour chaque type de produit. Réutilisable dans tous les écrans
   (courses, stock, recettes, planning…).

   Convention de dessin : viewBox 24×24, trait = currentColor,
   stroke-width ~1.6, bouts ronds, remplissage translucide léger
   (fill="currentColor" fill-opacity≈.12) pour l'effet « croquis ».

   Usage :
     import { PRODUCTS, CATEGORIES, PROVENANCE, productSvg, findProduct }
       from './assets/produits-assets.js';
     el.innerHTML = productSvg('carotte', { size: 22 });
     const p = findProduct('saumon');   // -> { key, label, cat, svg }
   =================================================================== */

/* ---- Catégories (rayon) : libellé + teinte de jeton ---- */
export const CATEGORIES = {
  legumes:   { label: 'Fruits & légumes',          tint: 'var(--color-sage-tint)',   ink: 'var(--color-sage-deep)' },
  cremerie:  { label: 'Frais & crémerie',          tint: 'var(--color-butter-tint)', ink: '#8a6d1f' },
  proteines: { label: 'Viandes, poissons & œufs',  tint: 'var(--color-clay-tint)',   ink: '#a96a4a' },
  epicerie:  { label: 'Épicerie salée',            tint: 'var(--color-sage-tint)',   ink: 'var(--color-sage-deep)' },
  sucre:     { label: 'Petit-déj & sucré',         tint: 'var(--color-butter-tint)', ink: '#8a6d1f' },
  boissons:  { label: 'Boissons',                  tint: 'var(--color-clay-tint)',   ink: '#a96a4a' },
  surgeles:  { label: 'Surgelés',                  tint: 'var(--color-sage-tint)',   ink: 'var(--color-sage-deep)' },
  maison:    { label: 'Maison & entretien',        tint: 'var(--color-clay-tint)',   ink: '#a96a4a' },
};

/* ---- Provenance d'une ligne de courses (puce discrète) ---- */
export const PROVENANCE = {
  repas:     { label: 'repas',     tint: 'var(--color-sage-tint)',   ink: 'var(--color-sage-deep)', svg: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>' },
  essentiel: { label: 'essentiel', tint: 'var(--color-butter-tint)', ink: '#8a6d1f',                svg: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>' },
  ajoute:    { label: 'ajouté',    tint: 'var(--color-clay-tint)',   ink: '#a96a4a',                svg: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>' },
};

/* ---- Figures produits ---- */
export const PRODUCTS = [
  /* === Fruits & légumes === */
  { key: 'brocoli',  label: 'Brocoli',   cat: 'legumes', svg: '<circle cx="9" cy="8" r="2.3" fill="currentColor" fill-opacity=".12"/><circle cx="13.5" cy="6.6" r="2.6" fill="currentColor" fill-opacity=".12"/><circle cx="16" cy="9.6" r="2.2" fill="currentColor" fill-opacity=".12"/><path d="M9.4 10.2 11.2 13h1.6l2-3.2"/><path d="M12 13v7"/><path d="M8.5 20h7"/>' },
  { key: 'carotte',  label: 'Carotte',   cat: 'legumes', svg: '<path d="M5 19a3 3 0 0 0 4.2 0L18 10l-4-4-8.8 8.8A3 3 0 0 0 5 19Z" fill="currentColor" fill-opacity=".12"/><path d="m9.5 9.5 1.6 1.6M12.5 6.5l1.6 1.6"/><path d="M14 6c.2-1.8 1.4-3 3.2-2.8M18 10c1.8.2 3-1 2.8-3"/>' },
  { key: 'tomate',   label: 'Tomate',    cat: 'legumes', svg: '<circle cx="12" cy="14" r="6.2" fill="currentColor" fill-opacity=".12"/><path d="M12 7.8c-1.2-2-3-2.2-4-2 .2 1.6 1.4 2.6 2.6 2.8M12 7.8c1.2-2 3-2.2 4-2-.2 1.6-1.4 2.6-2.6 2.8M12 5.5v2.3"/>' },
  { key: 'pomme',    label: 'Pomme',     cat: 'legumes', svg: '<path d="M12 8c-1-2-3-2.6-4.6-1.8C5 7.4 4.5 10 5.4 12.8c.7 2.2 2 4.6 3.4 5.6 1 .7 2 .4 3.2.4s2.2.3 3.2-.4c1.4-1 2.7-3.4 3.4-5.6.9-2.8.4-5.4-2-6.6C18 5.4 13 6 12 8Z" fill="currentColor" fill-opacity=".12"/><path d="M12 8c.2-1.6 1-3 2.6-3.4"/>' },
  { key: 'banane',   label: 'Banane',    cat: 'legumes', svg: '<path d="M5 9c1 5 5 8.5 10 8.5 1.6 0 3-.4 3.8-1-1.2.2-2.2 0-2.2 0 1.6-1.2 2.2-2.8 2.2-2.8C16 13 9 12.5 6.5 7.5 6 8 5.4 8.4 5 9Z" fill="currentColor" fill-opacity=".12"/>' },
  { key: 'herbes',   label: 'Herbes / basilic', cat: 'legumes', svg: '<path d="M11 20c0-5 2-9 8-11-1 6-4 9-8 11Z" fill="currentColor" fill-opacity=".12"/><path d="M11 20c0-4-1-7-5-8 0 3 1.6 6 5 8Z" fill="currentColor" fill-opacity=".12"/><path d="M11 20v-7"/>' },
  { key: 'oignon',   label: 'Oignon',    cat: 'legumes', svg: '<path d="M12 4c-1.4 1.4-1.4 3 0 4 1.4-1 1.4-2.6 0-4Z"/><path d="M12 8c-3.6 0-6 2.6-6 6s2.4 6 6 6 6-2.6 6-6-2.4-6-6-6Z" fill="currentColor" fill-opacity=".12"/><path d="M10 9.5C8.4 11 8 13.6 9.5 19M14 9.5c1.6 1.5 2 4.1.5 9.5"/>' },
  { key: 'poivron',  label: 'Poivron',   cat: 'legumes', svg: '<path d="M12 7c2-2 5-1.6 6 .4 1.4 3 .6 7-2 9.4-1.2 1.2-2.6 1.2-4 0C9 14.4 8.2 10 9.6 7.4 10.6 5.4 13 5 14 7" fill="currentColor" fill-opacity=".12"/><path d="M12 7V4.5"/>' },
  { key: 'champignon', label: 'Champignon', cat: 'legumes', svg: '<path d="M5 11a7 7 0 0 1 14 0Z" fill="currentColor" fill-opacity=".12"/><path d="M10 11v5a2 2 0 0 0 4 0v-5"/>' },
  { key: 'citron',   label: 'Citron',    cat: 'legumes', svg: '<ellipse cx="12" cy="12" rx="7" ry="5.4" transform="rotate(-30 12 12)" fill="currentColor" fill-opacity=".12"/><path d="M6.5 8.5 5 7M17.5 15.5 19 17"/>' },
  { key: 'salade',   label: 'Salade',    cat: 'legumes', svg: '<path d="M4 12h16a8 8 0 0 1-16 0Z" fill="currentColor" fill-opacity=".12"/><path d="M7 12c-1-2-.6-4 1-5 1 .6 1.4 1.6 1.4 2.6M12 12c-.6-3 .6-6 3-7 1.4 2.2 1 5-1 6.4M16.5 12c.6-1.6 2-2.6 3.5-2.6"/>' },

  /* === Frais & crémerie === */
  { key: 'lait',     label: 'Lait',      cat: 'cremerie', svg: '<path d="M8 3h8M9 3v2.8a4 4 0 0 1-.7 2.2l-.6 1A4 4 0 0 0 7 11.2V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-8.8a4 4 0 0 0-.7-2.2l-.6-1A4 4 0 0 1 15 5.8V3" fill="currentColor" fill-opacity=".10"/><path d="M7 14.5a6.5 6.5 0 0 1 5 0 6.5 6.5 0 0 0 5 0"/>' },
  { key: 'yaourt',   label: 'Yaourt',    cat: 'cremerie', svg: '<path d="M6 8h12l-1 11a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 19L6 8Z" fill="currentColor" fill-opacity=".12"/><path d="M5 8c0-1.6 3-2.4 7-2.4S19 6.4 19 8M9 12h6"/>' },
  { key: 'fromage',  label: 'Fromage',   cat: 'cremerie', svg: '<path d="M4 16 14 6c4 0 6 2 6 6v4Z" fill="currentColor" fill-opacity=".12"/><path d="M4 16h16M9 12.5h.01M13 14h.01M16 11h.01"/>' },
  { key: 'oeufs',    label: 'Œufs',      cat: 'cremerie', svg: '<path d="M9 21c-2.4 0-4-2-4-4.6C5 12 7 7 9 7s4 5 4 9.4C13 19 11.4 21 9 21Z" fill="currentColor" fill-opacity=".12"/><path d="M16 21c-1.6 0-2.8-1.4-2.8-3.4 0-3 1.4-6.6 2.8-6.6s2.8 3.6 2.8 6.6c0 2-1.2 3.4-2.8 3.4Z"/>' },
  { key: 'beurre',   label: 'Beurre',    cat: 'cremerie', svg: '<path d="M4 13 8 9h11a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4Z" fill="currentColor" fill-opacity=".12"/><path d="M4 13v3M8 9v7"/>' },

  /* === Viandes, poissons & œufs === */
  { key: 'poisson',  label: 'Poisson / saumon', cat: 'proteines', svg: '<path d="M16.5 12c2 0 4-1.5 5.5-3-.5 2-.5 4 0 6-1.5-1.5-3.5-3-5.5-3Z"/><path d="M3 12c2.5-4.5 8-6 13.5-3 0 0-1.5 1.5-1.5 3s1.5 3 1.5 3C11 18 5.5 16.5 3 12Z" fill="currentColor" fill-opacity=".12"/><path d="M7 11h.01"/>' },
  { key: 'poulet',   label: 'Poulet',    cat: 'proteines', svg: '<path d="M14 4a4 4 0 0 1 4 6.5c-1 1-2.6 1.2-3.8.6l-1.4 1.4a2.5 2.5 0 1 1-3.6 3.6c-.6.6-1 1.5-1 2.4L8 19l-2 2-1.5-.5L4 19l1-1.4c.9 0 1.8-.4 2.4-1A2.5 2.5 0 1 1 11 13l1.4-1.4c-.6-1.2-.4-2.8.6-3.8A4 4 0 0 1 14 4Z" fill="currentColor" fill-opacity=".10"/>' },
  { key: 'viande',   label: 'Viande',    cat: 'proteines', svg: '<path d="M7 5.5c4-1.6 9-.6 11 2.4s.4 7.6-3.6 9.6-9 1-11-2 .6-8.4 3.6-10Z" fill="currentColor" fill-opacity=".12"/><circle cx="9" cy="12" r="2"/>' },
  { key: 'jambon',   label: 'Jambon',    cat: 'proteines', svg: '<path d="M6 6c3-3 9-2 11 2s0 9-4 11-9 1-11-3c-1-2 0-4 1-5l-2-2Z" fill="currentColor" fill-opacity=".12"/><path d="m4 6 2 2M14 11h.01"/>' },

  /* === Épicerie salée === */
  { key: 'riz',      label: 'Riz / céréales', cat: 'epicerie', svg: '<path d="M12 22V8"/><path d="M12 8c0-2.2-1.8-4-4-4 0 2.2 1.8 4 4 4Z" fill="currentColor" fill-opacity=".12"/><path d="M12 8c0-2.2 1.8-4 4-4 0 2.2-1.8 4-4 4Z" fill="currentColor" fill-opacity=".12"/><path d="M12 13c0-2.2-1.8-4-4-4 0 2.2 1.8 4 4 4ZM12 13c0-2.2 1.8-4 4-4 0 2.2-1.8 4-4 4Z"/><path d="M12 18c0-2.2-1.8-4-4-4 0 2.2 1.8 4 4 4ZM12 18c0-2.2 1.8-4 4-4 0 2.2-1.8 4-4 4Z"/>' },
  { key: 'pates',    label: 'Pâtes',     cat: 'epicerie', svg: '<path d="M4 13h16a8 8 0 0 1-16 0Z" fill="currentColor" fill-opacity=".12"/><path d="M7 13c0-3 1-7 2-8M11 13c0-3 .5-8 1-9M15 13c0-3 1-7 2-8"/>' },
  { key: 'conserve', label: 'Conserve / boîte', cat: 'epicerie', svg: '<ellipse cx="12" cy="6" rx="6" ry="2.2" fill="currentColor" fill-opacity=".12"/><path d="M6 6v12c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2V6"/><path d="M6 12c0 1.2 2.7 2.2 6 2.2s6-1 6-2.2"/>' },
  { key: 'huile',    label: 'Huile',     cat: 'epicerie', svg: '<path d="M10 3h4v2.5l1.6 2.4A4 4 0 0 1 16 10v8a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8a4 4 0 0 1 .4-2.1L10 5.5Z" fill="currentColor" fill-opacity=".12"/><path d="M8 13h8"/>' },
  { key: 'pain',     label: 'Pain',      cat: 'epicerie', svg: '<path d="M4 11a4 4 0 0 1 1.2-7.6C6.5 3.2 8 4 8 4s1.5-1 3-1 3 1 3 1 1.5-.8 2.8-.6A4 4 0 0 1 20 11l-1 8a1.5 1.5 0 0 1-1.5 1.3h-11A1.5 1.5 0 0 1 5 19Z" fill="currentColor" fill-opacity=".12"/><path d="M8 4v15M16 4v15"/>' },
  { key: 'farine',   label: 'Farine / sac', cat: 'epicerie', svg: '<path d="M7 8c0-2 2-3 5-3s5 1 5 3l1 10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2Z" fill="currentColor" fill-opacity=".12"/><path d="M9 5c0-1 1.4-2 3-2s3 1 3 2M9.5 13h5"/>' },

  /* === Petit-déj & sucré === */
  { key: 'cafe',     label: 'Café',      cat: 'sucre', svg: '<path d="M5 8h11v5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Z" fill="currentColor" fill-opacity=".12"/><path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 3.5c-.5.6-.5 1.4 0 2M11 3.5c-.5.6-.5 1.4 0 2"/>' },
  { key: 'the',      label: 'Thé / infusion', cat: 'sucre', svg: '<path d="M6 9h10v4a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4V9Z" fill="currentColor" fill-opacity=".12"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M11 3v3M11 6c-1 1-1 2 0 3"/>' },
  { key: 'chocolat', label: 'Chocolat',  cat: 'sucre', svg: '<rect x="6" y="4" width="12" height="16" rx="1.5" fill="currentColor" fill-opacity=".12"/><path d="M12 4v16M6 9.3h12M6 14.6h12"/>' },
  { key: 'confiture',label: 'Confiture / miel', cat: 'sucre', svg: '<path d="M8 3h8v2H8z" fill="currentColor" fill-opacity=".12"/><path d="M7 8c0-1.6 2.2-3 5-3s5 1.4 5 3v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2Z" fill="currentColor" fill-opacity=".12"/><path d="M9 12h6"/>' },
  { key: 'biscuit',  label: 'Biscuits',  cat: 'sucre', svg: '<circle cx="12" cy="12" r="8" fill="currentColor" fill-opacity=".12"/><path d="M10 9h.01M14 10h.01M9 14h.01M14.5 14h.01M12 12.5h.01"/>' },
  { key: 'cereales', label: 'Céréales',  cat: 'sucre', svg: '<path d="M6 4h12l-1 4H7Z" fill="currentColor" fill-opacity=".12"/><path d="M6 8h12l-1 11a2 2 0 0 1-2 1.8H9A2 2 0 0 1 7 19Z" fill="currentColor" fill-opacity=".12"/><path d="M10 13h4"/>' },

  /* === Boissons === */
  { key: 'eau',      label: 'Eau',       cat: 'boissons', svg: '<path d="M9 2h6v2l1 2v13a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V6l1-2Z" fill="currentColor" fill-opacity=".12"/><path d="M8 11h8"/>' },
  { key: 'vin',      label: 'Vin',       cat: 'boissons', svg: '<path d="M7 4h10s-.5 7-5 7-5-7-5-7Z" fill="currentColor" fill-opacity=".12"/><path d="M12 11v6M8.5 21h7"/>' },
  { key: 'jus',      label: 'Jus',       cat: 'boissons', svg: '<path d="M6 7h12l-1.2 12.4A2 2 0 0 1 14.8 21H9.2a2 2 0 0 1-2-1.6L6 7Z" fill="currentColor" fill-opacity=".12"/><path d="M5 7h14M11 3l2 1.5L11 7"/>' },
  { key: 'soda',     label: 'Soda / canette', cat: 'boissons', svg: '<rect x="7" y="3" width="10" height="18" rx="2.5" fill="currentColor" fill-opacity=".12"/><path d="M7 7h10M10 3.5h4"/>' },

  /* === Surgelés === */
  { key: 'surgele',  label: 'Surgelé',   cat: 'surgeles', svg: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/><path d="M12 6 9.5 4M12 6l2.5-2M12 18l-2.5 2M12 18l2.5 2M6 12 4 9.5M6 12l-2 2.5M18 12l2-2.5M18 12l2 2.5"/>' },
  { key: 'glace',    label: 'Glace',     cat: 'surgeles', svg: '<path d="M8 10a4 4 0 0 1 8 0Z" fill="currentColor" fill-opacity=".12"/><path d="M8 10h8l-3.4 9a.6.6 0 0 1-1.2 0Z" fill="currentColor" fill-opacity=".08"/>' },
  { key: 'legumes_surgeles', label: 'Légumes surgelés', cat: 'surgeles', svg: '<rect x="4" y="5" width="16" height="14" rx="2" fill="currentColor" fill-opacity=".10"/><path d="M9 8.5 8 5M12 8.5V5M15 8.5 16 5M8 13h.01M12 13h.01M16 13h.01M10 16h.01M14 16h.01"/>' },

  /* === Maison & entretien === */
  { key: 'eponge',   label: 'Éponge',    cat: 'maison', svg: '<rect x="4" y="8" width="16" height="9" rx="2.5" fill="currentColor" fill-opacity=".12"/><path d="M4 12.5h16M8 8c0-1.5 1-2.5 2.5-2.5M13 8c0-1.5 1-2.5 2.5-2.5"/><path d="M7 15h.01M10 15h.01M13 15h.01M16 15h.01"/>' },
  { key: 'poubelle', label: 'Sacs poubelle', cat: 'maison', svg: '<path d="M5 7h14l-1 13a2 2 0 0 1-2 1.8H8A2 2 0 0 1 6 20Z" fill="currentColor" fill-opacity=".12"/><path d="M3 7h18M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>' },
  { key: 'papier',   label: 'Papier toilette', cat: 'maison', svg: '<rect x="5" y="6" width="14" height="12" rx="2" fill="currentColor" fill-opacity=".10"/><ellipse cx="9" cy="12" rx="3" ry="6" fill="currentColor" fill-opacity=".12"/><path d="M9 9v6"/>' },
  { key: 'nettoyant',label: 'Nettoyant', cat: 'maison', svg: '<path d="M9 8h6v11a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2Z" fill="currentColor" fill-opacity=".12"/><path d="M10 8V5h4M10 5 8 3M16 6h2M16 9h2M18 4h.01"/>' },
  { key: 'savon',    label: 'Savon / lessive', cat: 'maison', svg: '<rect x="6" y="7" width="12" height="14" rx="2" fill="currentColor" fill-opacity=".12"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M9 12h6"/>' },
];

/* ---- Fallback générique ---- */
export const FALLBACK = { key: 'panier', label: 'Article', svg: '<path d="M4 9h16l-1.4 9.4A2 2 0 0 1 16.6 20H7.4a2 2 0 0 1-2-1.6Z" fill="currentColor" fill-opacity=".12"/><path d="M4 9 8 3M20 9l-4-6M9 13v3M15 13v3"/>' };

/* ---- Helpers ---- */
const _byKey = Object.fromEntries(PRODUCTS.map((p) => [p.key, p]));

export function findProduct(key) {
  return _byKey[key] || FALLBACK;
}

export function productSvg(key, opts) {
  opts = opts || {};
  const size = opts.size || 24;
  const sw = opts.strokeWidth || 1.6;
  const inner = (_byKey[key] || FALLBACK).svg;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

export function productsByCategory() {
  const out = {};
  Object.keys(CATEGORIES).forEach((c) => (out[c] = []));
  PRODUCTS.forEach((p) => { (out[p.cat] = out[p.cat] || []).push(p); });
  return out;
}
