// Normalisation de libellés d'aliments — source de vérité unique partagée par le
// calcul de courses (shopping.ts), le rapprochement catalogue (foods.ts) et l'UI
// d'ajout (anti-doublon / anti-surplus). Neutralise casse, accents, ligature œ,
// ponctuation et pluriel simple pour rapprocher deux graphies du même aliment.
// Précision approximative assumée : risque marginal de sur-fusion (« pâte »/« pâtes »).

// Plage des marques diacritiques combinantes Unicode (U+0300–U+036F), construite
// par code pour éviter tout caractère combinant littéral dans le source.
const COMBINING_MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

export function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('œ', 'oe') // ligature œ
    .normalize('NFD')
    .replace(COMBINING_MARKS, '') // accents → retirés
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/s$/, '');
}
