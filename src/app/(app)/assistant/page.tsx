import { getAuthContext } from '@/lib/auth';
import { AgentChat } from './agent-chat';

export default async function AssistantPage() {
  const { supabase, userId } = await getAuthContext();

  const { data: messages } = await supabase
    .from('conversation_ia')
    .select('role, content')
    .eq('profile_id', userId as string)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(100);

  const initial = ((messages ?? []) as Array<{ role: string; content: string }>).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  return <AgentChat initial={initial} />;
}
