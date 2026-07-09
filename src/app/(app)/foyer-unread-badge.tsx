'use client';

import { useEffect, useId, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { chatBadgeInfoAction } from './foyer/chat-actions';
import { CHAT_READ_EVENT } from './foyer/chat';

/**
 * Pastille « messages non lus » de l'onglet Foyer. Compte initial via action serveur,
 * incrément en direct via Realtime (INSERT sur household_message, RLS respectée),
 * remise à zéro quand le fil est lu (événement fenêtre émis par le chat).
 * Best-effort : sans info (déconnecté, erreur), la pastille est simplement absente.
 */
export function FoyerUnreadBadge() {
  const [unread, setUnread] = useState(0);
  // Deux instances de NavTabs coexistent (desktop + mobile) → topic Realtime unique.
  const instanceId = useId();

  useEffect(() => {
    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void chatBadgeInfoAction().then((info) => {
      if (cancelled || !info) return;
      setUnread(info.unread);

      const supabase = createSupabaseBrowserClient();
      const channel = supabase
        .channel(`household-chat-badge:${info.householdId}:${instanceId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'household_message',
            filter: `household_id=eq.${info.householdId}`,
          },
          (payload) => {
            const row = payload.new as { author_profile_id: string | null };
            if (row.author_profile_id !== info.meId) setUnread((n) => n + 1);
          },
        )
        .subscribe();

      const onRead = () => setUnread(0);
      const onFocus = () => {
        if (document.visibilityState !== 'visible') return;
        void chatBadgeInfoAction().then((fresh) => {
          if (fresh) setUnread(fresh.unread);
        });
      };
      window.addEventListener(CHAT_READ_EVENT, onRead);
      window.addEventListener('focus', onFocus);
      cleanup = () => {
        void supabase.removeChannel(channel);
        window.removeEventListener(CHAT_READ_EVENT, onRead);
        window.removeEventListener('focus', onFocus);
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [instanceId]);

  if (unread === 0) return null;
  return (
    <span
      className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-sage-deep px-1 text-[10px] font-bold text-white"
      aria-label={`${unread} message(s) non lu(s)`}
    >
      {unread > 9 ? '9+' : unread}
    </span>
  );
}
