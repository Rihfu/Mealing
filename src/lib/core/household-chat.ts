import type { DB } from './types';
import { unwrap } from './types';

/**
 * Chat de foyer (Foyer V2, portée V1 mince : texte seul, fil unique par foyer).
 * Fonctions backend réutilisables (principe n°4) — UI et agent (lecture) les consomment.
 * RLS : lecture/écriture réservées aux membres du foyer ; édition/suppression = auteur.
 * La suppression est DOUCE (deleted_at) : le corps n'est plus jamais renvoyé au client.
 */

const PAGE_SIZE = 50;
const MAX_BODY = 4000;

export interface ChatMessage {
  id: string;
  authorId: string | null;
  /** Prénom résolu côté serveur (« Membre parti » si le compte a quitté/disparu). */
  authorName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
}

type MessageRow = {
  id: string;
  author_profile_id: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

async function requireUserId(db: DB): Promise<string> {
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) throw new Error('Utilisateur non authentifié.');
  return data.user.id;
}

function toMessage(row: MessageRow, names: Map<string, string>): ChatMessage {
  const deleted = row.deleted_at !== null;
  return {
    id: row.id,
    authorId: row.author_profile_id,
    authorName: (row.author_profile_id && names.get(row.author_profile_id)) || 'Membre parti',
    // Ne jamais renvoyer le corps d'un message supprimé.
    body: deleted ? '' : row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    deleted,
  };
}

/** Prénoms des auteurs (les profils hors foyer ne sont pas visibles sous RLS → repli). */
async function loadAuthorNames(db: DB, authorIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(authorIds.filter(Boolean)));
  if (ids.length === 0) return new Map();
  const { data } = await db.from('profile').select('id, display_name').in('id', ids);
  return new Map(
    ((data ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [
      p.id,
      p.display_name?.trim() || '(sans nom)',
    ]),
  );
}

/**
 * Messages du fil, du plus ancien au plus récent. `before` (ISO) = pagination vers le
 * passé (messages STRICTEMENT antérieurs). `hasMore` = il reste des messages plus anciens.
 */
export async function listChatMessages(
  db: DB,
  householdId: string,
  opts?: { before?: string; limit?: number },
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const limit = Math.min(Math.max(opts?.limit ?? PAGE_SIZE, 1), 200);
  let q = db
    .from('household_message')
    .select('id, author_profile_id, body, created_at, edited_at, deleted_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);
  if (opts?.before) q = q.lt('created_at', opts.before);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as MessageRow[];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse(); // → chronologique
  const names = await loadAuthorNames(db, page.map((r) => r.author_profile_id ?? ''));
  return { messages: page.map((r) => toMessage(r, names)), hasMore };
}

/** Envoie un message (texte seul en V1). */
export async function sendChatMessage(db: DB, householdId: string, body: string): Promise<ChatMessage> {
  const userId = await requireUserId(db);
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Message vide.');
  if (trimmed.length > MAX_BODY) throw new Error('Message trop long.');

  const row = unwrap(
    await db
      .from('household_message')
      .insert({ household_id: householdId, author_profile_id: userId, body: trimmed })
      .select('id, author_profile_id, body, created_at, edited_at, deleted_at')
      .single(),
  ) as MessageRow;

  const names = await loadAuthorNames(db, [userId]);
  return toMessage(row, names);
}

/** Modifie SON message (RLS auteur — la base refuse sinon). */
export async function editChatMessage(db: DB, messageId: string, body: string): Promise<void> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Message vide.');
  if (trimmed.length > MAX_BODY) throw new Error('Message trop long.');
  const { data, error } = await db
    .from('household_message')
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('deleted_at', null)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Message introuvable (ou pas le tien).');
}

/** Supprime SON message (suppression douce : le corps n'est plus servi). */
export async function deleteChatMessage(db: DB, messageId: string): Promise<void> {
  const { data, error } = await db
    .from('household_message')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', messageId)
    .select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('Message introuvable (ou pas le tien).');
}

/** Marque le fil comme lu pour l'utilisateur courant (badge « non lus » remis à zéro). */
export async function markChatRead(db: DB, householdId: string): Promise<void> {
  const userId = await requireUserId(db);
  const { error } = await db
    .from('household_message_read')
    .upsert(
      { household_id: householdId, profile_id: userId, last_read_at: new Date().toISOString() },
      { onConflict: 'household_id,profile_id' },
    );
  if (error) throw new Error(error.message);
}

/** Nombre de messages non lus (des AUTRES membres, non supprimés) pour un profil. */
export async function getChatUnreadCount(db: DB, householdId: string, profileId: string): Promise<number> {
  // maybeSingle : aucune ligne tant que le membre n'a jamais ouvert le fil (cas normal).
  const { data: read } = await db
    .from('household_message_read')
    .select('last_read_at')
    .eq('household_id', householdId)
    .eq('profile_id', profileId)
    .maybeSingle();

  let q = db
    .from('household_message')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', householdId)
    // ≠ moi, en comptant aussi les messages d'auteurs partis (author NULL — neq exclurait).
    .or(`author_profile_id.is.null,author_profile_id.neq.${profileId}`)
    .is('deleted_at', null);
  if (read?.last_read_at) q = q.gt('created_at', read.last_read_at as string);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}
