import { normalizeLabel } from './text';

/**
 * Pont best-effort « aliment → catégorie FoodKeeper » (table conservation_rule).
 * Les rayons (legumes, proteines…) sont trop grossiers pour la conservation
 * (le lait, le beurre et les œufs ne se conservent pas pareil), on associe donc
 * par mots-clés sur le nom/slug. Conservateur : si aucun mot-clé ne matche, on
 * ne montre pas de conservation (plutôt que d'en inventer une — durées vérifiables).
 *
 * Les catégories ciblées doivent exister dans conservation_rule (seed 0007).
 */
const RULES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['Volaille crue', ['poulet', 'volaille', 'dinde', 'canard', 'magret', 'pintade', 'pilon']],
  ['Viande rouge crue', ['boeuf', 'steak', 'entrecote', 'bavette', 'roti de boeuf', 'porc', 'echine', 'cote de porc', 'filet mignon', 'veau', 'agneau', 'gigot', 'cotelette', 'viande hachee', 'viande']],
  ['Poisson frais', ['saumon', 'cabillaud', 'colin', 'poisson', 'truite', 'dorade', 'lieu', 'merlu', 'crevette', 'gambas', 'moule', 'fruits de mer']],
  ['Charcuterie', ['jambon', 'lardons', 'saucisse', 'chipolata', 'merguez', 'chorizo', 'bacon', 'pancetta', 'salami', 'rillettes']],
  ['Tofu', ['tofu', 'tempeh']],
  ['Beurre', ['beurre', 'margarine']],
  ['Yaourt / laitage', ['yaourt', 'fromage blanc', 'skyr', 'petit suisse', 'laitage', 'creme fraiche', 'creme liquide', 'creme epaisse']],
  ['Fromage à pâte molle', ['mozzarella', 'camembert', 'brie', 'chevre', 'feta', 'burrata', 'ricotta']],
  ['Fromage à pâte dure', ['parmesan', 'gruyere', 'emmental', 'comte', 'cheddar', 'fromage rape', 'pate dure']],
  ['Œufs', ['oeuf']],
  ['Pain', ['pain', 'baguette', 'brioche', 'viennoiserie', 'croissant']],
  ['Jus de fruits frais', ['jus de fruit', 'jus orange', 'jus de pomme', 'jus frais', 'jus d orange']],
  ['Salade / verdure', ['salade', 'laitue', 'roquette', 'mache', 'persil', 'coriandre', 'basilic', 'menthe', 'ciboulette', 'aneth', 'herbes']],
  ['Légumes frais', ['carotte', 'tomate', 'oignon', 'poireau', 'courgette', 'aubergine', 'poivron', 'concombre', 'brocoli', 'chou', 'haricot', 'champignon', 'pomme de terre', 'patate', 'legume', 'ail', 'echalote', 'celeri', 'navet', 'radis', 'betterave', 'potiron', 'courge', 'epinard']],
  ['Fruits frais', ['pomme', 'banane', 'poire', 'orange', 'fraise', 'raisin', 'peche', 'abricot', 'kiwi', 'mangue', 'ananas', 'citron', 'clementine', 'fruit', 'cerise', 'prune', 'melon', 'pasteque', 'framboise', 'myrtille']],
  ['Sauce / condiment', ['sauce', 'moutarde', 'ketchup', 'mayonnaise', 'condiment', 'pesto']],
];

// Laits végétaux : ne PAS les traiter comme du lait frais (conservation différente).
const VEG_MILK = ['coco', 'amande', 'soja', 'avoine', 'riz', 'noisette'];

/** Catégorie FoodKeeper pour un aliment (par nom + slug), ou null si rien ne matche. */
export function mapToConservationCategory(name: string, slug?: string | null): string | null {
  const hay = `${normalizeLabel(name)} ${normalizeLabel((slug ?? '').replace(/-/g, ' '))}`;
  // Lait frais (dairy) uniquement — exclut les laits végétaux.
  if (hay.includes('lait') && !VEG_MILK.some((v) => hay.includes(v))) return 'Lait';
  for (const [category, keywords] of RULES) {
    if (keywords.some((k) => hay.includes(k))) return category;
  }
  return null;
}
