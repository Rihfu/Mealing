import { getAuthContext } from '@/lib/auth';
import { clearConversationAction, sendMessageAction } from './actions';

interface Message {
  id: string;
  role: string;
  content: string;
}

export default async function AssistantPage() {
  const { supabase, userId } = await getAuthContext();

  const { data: messages } = await supabase
    .from('conversation_ia')
    .select('id, role, content')
    .eq('profile_id', userId as string)
    .in('role', ['user', 'assistant'])
    .order('created_at', { ascending: true })
    .limit(100);

  const history = (messages ?? []) as Message[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Assistant</h1>
        {history.length > 0 && (
          <form action={clearConversationAction}>
            <button className="text-xs text-gray-500 underline">Effacer la conversation</button>
          </form>
        )}
      </div>
      <p className="text-sm text-gray-500">
        Posez des questions sur vos repas, votre stock ou vos macros. L’assistant est en lecture
        seule : il ne modifie rien.
      </p>

      <div className="flex flex-col gap-2">
        {history.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'self-end bg-black text-white dark:bg-white dark:text-black'
                : 'self-start bg-gray-100 dark:bg-gray-800'
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
        ))}
        {history.length === 0 && (
          <p className="text-sm text-gray-400">
            Ex. « Qu’est-ce que je peux cuisiner avec mon stock ? » ou « Où en sont mes macros
            aujourd’hui ? »
          </p>
        )}
      </div>

      <form action={sendMessageAction} className="flex items-end gap-2">
        <textarea
          name="message"
          rows={2}
          required
          placeholder="Votre question…"
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
        >
          Envoyer
        </button>
      </form>
    </div>
  );
}
