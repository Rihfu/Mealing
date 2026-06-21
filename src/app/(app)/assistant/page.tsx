import { getAuthContext } from '@/lib/auth';
import { aggregatePeriodNutrition, getStockWithExpiry } from '@/lib/core';
import { isoDate, SLOTS } from '@/lib/dates';
import { AgentChat } from './agent-chat';

export default async function AssistantPage() {
  const { supabase, userId, profile } = await getAuthContext();
  const householdId = profile?.household_id as string;
  const today = isoDate(new Date());

  const [{ data: messages }, { data: meals }, { data: recipes }, stock, macros] = await Promise.all([
    supabase
      .from('conversation_ia')
      .select('role, content')
      .eq('profile_id', userId as string)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: true })
      .limit(100),
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

  const initial = ((messages ?? []) as Array<{ role: string; content: string }>).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

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
      context={{
        meals: mealContext,
        urgentStock,
        energy: Math.round(macros.real.energy_kcal ?? 0),
        sodium: Math.round(macros.real.sodium ?? 0),
      }}
    />
  );
}
