import { getAuthContext } from '@/lib/auth';
import {
  aggregatePeriodNutrition,
  getStockWithExpiry,
  getConversationMessages,
  listConversations,
  ASSISTANT_MESSAGE_LIMIT,
} from '@/lib/core';
import { isoDate, SLOTS } from '@/lib/dates';
import { AgentChat } from './agent-chat';

export default async function AssistantPage() {
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;
  const today = isoDate(new Date());

  // Conversation active = la plus récente du profil (sans en CRÉER une au chargement —
  // une nouvelle conversation n'est créée qu'au 1er message ou via « Nouvelle conversation »).
  const { data: activeConv } = await supabase
    .from('ia_conversation')
    .select('id')
    .eq('profile_id', userId as string)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const conversationId = (activeConv as { id: string } | null)?.id ?? '';

  const [conversations, initial, { data: meals }, { data: recipes }, stock, macros] = await Promise.all([
    listConversations(supabase, userId as string),
    conversationId ? getConversationMessages(supabase, conversationId) : Promise.resolve([]),
    supabase
      .from('planned_meal')
      .select('meal_date, slot, recipe_id, free_text')
      .eq('household_id', householdId)
      .gte('meal_date', today)
      .lte('meal_date', today),
    supabase.from('recipe').select('id, name'),
    getStockWithExpiry(supabase, householdId),
    aggregatePeriodNutrition(supabase, {
      householdId,
      profileId: userId as string,
      from: today,
      to: today,
    }),
  ]);

  const recipeName = new Map((recipes ?? []).map((r) => [r.id, r.name]));
  const slotLabel = (s: string) => SLOTS.find((x) => x.key === s)?.label ?? s;
  const mealContext = (meals ?? []).map((m) => ({
    slot: slotLabel(m.slot),
    name: m.recipe_id ? recipeName.get(m.recipe_id) ?? '(recette)' : m.free_text ?? '(libre)',
  }));
  const urgentStock = stock
    .filter((s) => s.daysRemaining != null && s.daysRemaining <= 3)
    .slice(0, 3)
    .map((s) => ({
      name: s.name,
      label: s.daysRemaining != null && s.daysRemaining < 0 ? 'périmé' : `${s.daysRemaining} j`,
      tone: s.daysRemaining != null && s.daysRemaining < 0 ? 'danger' : 'warn',
    }));

  return (
    <AgentChat
      initial={initial}
      conversationId={conversationId}
      conversations={conversations}
      limit={ASSISTANT_MESSAGE_LIMIT}
      context={{
        meals: mealContext,
        urgentStock,
        energy: Math.round(macros.real.energy_kcal ?? 0),
        sodium: Math.round(macros.real.sodium ?? 0),
      }}
    />
  );
}
