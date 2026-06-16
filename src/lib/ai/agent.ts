import { z } from 'zod';
import { getAIProvider, type ChatMessage } from '@/lib/providers/ai';
import {
  addPlannedMeal,
  markDayOffPlan,
  upsertStockItem,
  getStockWithExpiry,
  type DB,
  type MealSlot,
} from '@/lib/core';
import { addDays, isoDate, mondayOf, SLOTS } from '@/lib/dates';

/**
 * Assistant AGENTIQUE (Phase 6, specs §9) — peut AGIR sur les données, mais
 * JAMAIS directement : il PROPOSE une action, l'utilisateur CONFIRME, puis on
 * exécute via les fonctions réutilisables de core/ (principe n°4).
 *
 * Garde-fou de confirmation systématique (exigence explicite) : `askAgent` ne fait
 * que produire une proposition validée ; seule `executeAgent`, appelée après
 * confirmation explicite de l'utilisateur, écrit en base. Liste blanche d'actions
 * additives uniquement (pas de suppression). Tout passe par le RLS de l'utilisateur.
 */

const slotEnum = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);

const ACTION_SCHEMAS = {
  add_meal: z.object({
    date: z.string(),
    slot: slotEnum,
    recipeName: z.string().optional(),
    description: z.string().optional(),
  }),
  add_stock_item: z.object({ label: z.string().min(1) }),
  add_shopping_item: z.object({
    label: z.string().min(1),
    quantity: z.number().optional(),
    unit: z.string().optional(),
  }),
  mark_day_off: z.object({ date: z.string() }),
} as const;

export type ActionName = keyof typeof ACTION_SCHEMAS;
export type AgentAction = { name: ActionName; params: Record<string, unknown> };
export interface AgentProposal {
  summary: string;
  action: AgentAction;
}
export type AgentDecision =
  | { type: 'reply'; message: string }
  | { type: 'action'; proposal: AgentProposal };

const SYSTEM_PROMPT = `Tu es l'assistant de Mealing. Tu peux répondre à des questions OU proposer UNE action sur les données.

Tu n'exécutes JAMAIS d'action toi-même : tu la PROPOSES, et l'utilisateur la confirmera avant exécution. Tu n'as pas le droit de supprimer des données.

Actions possibles (n'en proposer une que si l'utilisateur demande une modification) :
- add_meal : planifier un repas. params { date (YYYY-MM-DD), slot (breakfast|lunch|dinner|snack), recipeName?, description? }. Utilise recipeName si une recette existante correspond, sinon description.
- add_stock_item : ajouter un article au stock. params { label }.
- add_shopping_item : ajouter un article à la liste de courses. params { label, quantity?, unit? }.
- mark_day_off : marquer une journée entière hors-plan. params { date (YYYY-MM-DD) }.

Réponds UNIQUEMENT en JSON valide :
- Pour une réponse simple : { "type": "reply", "message": string }
- Pour une action : { "type": "action", "summary": string (phrase claire décrivant ce qui sera fait, à confirmer), "action": { "name": string, "params": object } }

Appuie-toi sur le contexte fourni. Si une info manque, demande-la via une reply plutôt que d'inventer.`;

async function buildContext(db: DB, householdId: string): Promise<string> {
  const weekStart = mondayOf();
  const fromIso = isoDate(weekStart);
  const toIso = isoDate(addDays(weekStart, 6));

  const [{ data: meals }, { data: recipes }, stock] = await Promise.all([
    db
      .from('planned_meal')
      .select('meal_date, slot, recipe_id, free_text')
      .eq('household_id', householdId)
      .gte('meal_date', fromIso)
      .lte('meal_date', toIso),
    db.from('recipe').select('name'),
    getStockWithExpiry(db, householdId),
  ]);

  const slotLabel = (s: string) => SLOTS.find((x) => x.key === s)?.label ?? s;
  const mealsTxt =
    (meals ?? []).map((m) => `- ${m.meal_date} ${slotLabel(m.slot)}`).join('\n') ||
    '(aucun repas planifié)';
  const recipesTxt = (recipes ?? []).map((r) => `- ${r.name}`).join('\n') || '(aucune recette)';
  const stockTxt = stock.map((s) => `- ${s.name}`).join('\n') || '(stock vide)';

  return `Date du jour : ${isoDate(new Date())} (semaine du ${fromIso} au ${toIso}).

Recettes existantes :
${recipesTxt}

Repas déjà planifiés cette semaine :
${mealsTxt}

Stock du foyer :
${stockTxt}`;
}

/** Produit une décision (réponse ou proposition d'action validée). N'écrit rien. */
export async function askAgent(
  db: DB,
  params: { householdId: string; profileId: string; message: string },
): Promise<AgentDecision> {
  const { data: history } = await db
    .from('conversation_ia')
    .select('role, content')
    .eq('profile_id', params.profileId)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(20);

  const context = await buildContext(db, params.householdId);

  const messages: ChatMessage[] = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n--- CONTEXTE ---\n${context}` },
    ...((history ?? []) as Array<{ role: string; content: string }>).map((h) => ({
      role: h.role as ChatMessage['role'],
      content: h.content,
    })),
    { role: 'user', content: params.message },
  ];

  const res = await getAIProvider().chat(messages, { jsonMode: true, temperature: 0.3 });

  let parsed: { type?: string; message?: string; summary?: string; action?: AgentAction };
  try {
    parsed = JSON.parse(res.content);
  } catch {
    return { type: 'reply', message: "Désolé, je n'ai pas pu traiter votre demande." };
  }

  if (parsed.type === 'action' && parsed.action && parsed.summary) {
    const name = parsed.action.name as ActionName;
    const schema = ACTION_SCHEMAS[name];
    if (!schema) {
      return { type: 'reply', message: "Je ne sais pas encore réaliser cette action." };
    }
    const validated = schema.safeParse(parsed.action.params);
    if (!validated.success) {
      return { type: 'reply', message: "Il me manque des informations pour faire ça correctement." };
    }
    return {
      type: 'action',
      proposal: { summary: parsed.summary, action: { name, params: validated.data } },
    };
  }

  return { type: 'reply', message: parsed.message ?? '…' };
}

/** Exécute une action confirmée via les fonctions core. À n'appeler qu'après confirmation. */
export async function executeAgent(
  db: DB,
  params: { householdId: string; profileId: string; action: AgentAction },
): Promise<string> {
  const { householdId, action } = params;

  switch (action.name) {
    case 'add_meal': {
      const p = ACTION_SCHEMAS.add_meal.parse(action.params);
      let recipeId: string | undefined;
      if (p.recipeName) {
        const { data } = await db
          .from('recipe')
          .select('id')
          .ilike('name', `%${p.recipeName}%`)
          .limit(1)
          .maybeSingle();
        recipeId = data?.id;
      }
      await addPlannedMeal(db, {
        householdId,
        date: p.date,
        slot: p.slot as MealSlot,
        recipeId,
        freeText: recipeId ? undefined : p.description ?? p.recipeName,
      });
      return `Repas planifié le ${p.date}.`;
    }
    case 'add_stock_item': {
      const p = ACTION_SCHEMAS.add_stock_item.parse(action.params);
      await upsertStockItem(db, { householdId, label: p.label, trackingMode: 'presence', present: true });
      return `« ${p.label} » ajouté au stock.`;
    }
    case 'add_shopping_item': {
      const p = ACTION_SCHEMAS.add_shopping_item.parse(action.params);
      const { error } = await db.from('shopping_manual_item').insert({
        household_id: householdId,
        label: p.label,
        quantity: p.quantity ?? null,
        unit: p.unit ?? null,
      });
      if (error) throw new Error(error.message);
      return `« ${p.label} » ajouté à la liste de courses.`;
    }
    case 'mark_day_off': {
      const p = ACTION_SCHEMAS.mark_day_off.parse(action.params);
      await markDayOffPlan(db, { householdId, date: p.date, scope: 'household' });
      return `Journée du ${p.date} marquée hors-plan.`;
    }
    default:
      throw new Error('Action inconnue.');
  }
}
