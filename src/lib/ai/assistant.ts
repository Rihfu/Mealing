import { getAIProvider, type ChatMessage } from '@/lib/providers/ai';
import { aggregatePeriodNutrition, getStockWithExpiry } from '@/lib/core';
import { addDays, isoDate, mondayOf, SLOTS } from '@/lib/dates';
import type { DB } from '@/lib/core';

/**
 * Assistant conversationnel IA — LECTURE SEULE (Phase 5, specs §9).
 *
 * L'assistant lit un contexte assemblé de façon déterministe (repas planifiés,
 * stock, macros du jour) et répond. Il NE modifie aucune donnée (l'action sur les
 * données est réservée à la Phase 6). Les chiffres du contexte proviennent des
 * fonctions de calcul (principe n°3), jamais d'une génération.
 */
const MACRO_LABELS: Record<string, string> = {
  energy_kcal: 'Énergie (kcal)',
  protein: 'Protéines (g)',
  carbs: 'Glucides (g)',
  fat: 'Lipides (g)',
};

const SYSTEM_PROMPT = `Tu es l'assistant de l'application Mealing. Tu fonctionnes en LECTURE SEULE : tu ne peux rien créer, modifier ni supprimer ; si on te le demande, explique que ce n'est pas encore possible.

Réponds en français, de façon concise et concrète, en t'appuyant UNIQUEMENT sur le contexte fourni (repas planifiés, stock, macros). Si une information n'est pas dans le contexte, dis-le clairement plutôt que d'inventer. Ne fournis pas de conseils médicaux ; tu peux faire des suggestions simples (idées de repas à partir du stock, équilibre indicatif).`;

async function buildContext(
  db: DB,
  params: { householdId: string; profileId: string },
): Promise<string> {
  const today = new Date();
  const weekStart = mondayOf();
  const fromIso = isoDate(weekStart);
  const toIso = isoDate(addDays(weekStart, 6));
  const todayIso = isoDate(today);

  const [{ data: meals }, { data: recipes }, stock, macros] = await Promise.all([
    db
      .from('planned_meal')
      .select('meal_date, slot, recipe_id, free_text')
      .eq('household_id', params.householdId)
      .gte('meal_date', fromIso)
      .lte('meal_date', toIso)
      .order('meal_date', { ascending: true }),
    db.from('recipe').select('id, name'),
    getStockWithExpiry(db, params.householdId),
    aggregatePeriodNutrition(db, {
      householdId: params.householdId,
      profileId: params.profileId,
      from: todayIso,
      to: todayIso,
    }),
  ]);

  const recipeName = new Map((recipes ?? []).map((r) => [r.id, r.name]));
  const slotLabel = (s: string) => SLOTS.find((x) => x.key === s)?.label ?? s;

  const mealsTxt =
    (meals ?? [])
      .map(
        (m) =>
          `- ${m.meal_date} ${slotLabel(m.slot)} : ${
            m.recipe_id ? recipeName.get(m.recipe_id) ?? '(recette)' : m.free_text ?? '(libre)'
          }`,
      )
      .join('\n') || '(aucun repas planifié cette semaine)';

  const stockTxt =
    stock
      .map((s) => {
        const exp = s.daysRemaining != null ? ` [péremption ~${s.daysRemaining} j]` : '';
        return `- ${s.name}${exp}`;
      })
      .join('\n') || '(stock vide)';

  const macroTxt =
    Object.keys(MACRO_LABELS)
      .map(
        (code) =>
          `- ${MACRO_LABELS[code]} : planifié ${Math.round(macros.planned[code] ?? 0)}, réel estimé ${Math.round(
            macros.real[code] ?? 0,
          )}`,
      )
      .join('\n');

  return `Repas planifiés (semaine du ${fromIso}) :
${mealsTxt}

Stock du foyer :
${stockTxt}

Macros du jour (${todayIso}) :
${macroTxt}`;
}

export async function askAssistant(
  db: DB,
  params: { householdId: string; profileId: string; message: string },
): Promise<string> {
  // Historique récent (messages user/assistant uniquement).
  const { data: history } = await db
    .from('conversation_ia')
    .select('role, content')
    .eq('profile_id', params.profileId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(20);

  const context = await buildContext(db, params);

  const messages: ChatMessage[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n--- CONTEXTE ---\n${context}` },
    ...((history ?? []) as Array<{ role: string; content: string }>).map((h) => ({
      role: h.role as ChatMessage['role'],
      content: h.content,
    })),
    { role: 'user', content: params.message },
  ];

  const res = await getAIProvider().chat(messages, { temperature: 0.4 });

  // Persistance (lecture seule côté données métier, mais on trace la conversation).
  await db.from('conversation_ia').insert([
    { profile_id: params.profileId, role: 'user', content: params.message },
    { profile_id: params.profileId, role: 'assistant', content: res.content },
  ]);

  return res.content;
}
