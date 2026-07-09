'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
// Types uniquement (erasés au build) — ne JAMAIS importer les modules core en valeur
// depuis un composant client (chaîne server-only via le barrel, cf. convention Recettes).
import type { HouseholdOverview } from '@/lib/core/household';
import type { SharedNutritionWeek } from '@/lib/core/nutrition-shared';
import {
  cancelInvitationAction,
  inviteMemberAction,
  leaveHouseholdAction,
  removeMemberAction,
  renameHouseholdAction,
  setDisplayNameAction,
  setExpiryThresholdAction,
  setHouseholdSettingsAction,
  sharedNutritionAction,
  toggleNutritionShareAction,
  transferAdminAction,
} from './actions';

/* ------------------------------ Petites briques ------------------------------ */

const AVATAR_STYLES = ['bg-sage-tint text-sage-deep', 'bg-butter-tint text-ink', 'bg-clay-tint text-ink'];

/** Couleur stable par membre (dérivée de l'id — même teinte à chaque rendu). */
function avatarStyle(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_STYLES[h % AVATAR_STYLES.length];
}

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));

function Flash({ text, tone }: { text: string; tone: 'ok' | 'error' }) {
  return (
    <p className={`text-xs font-semibold ${tone === 'ok' ? 'text-green-strong' : 'text-red-strong'}`}>{text}</p>
  );
}

/* --------------------------------- Vue ---------------------------------- */

export function FoyerView({
  overview,
  expiryThresholdDays,
  baseUrl,
  meId,
  welcome = false,
}: {
  overview: HouseholdOverview;
  expiryThresholdDays: number;
  baseUrl: string;
  meId: string;
  /** Vrai juste après l'acceptation d'une invitation (bandeau d'accueil). */
  welcome?: boolean;
}) {
  const router = useRouter();
  const [showWelcome, setShowWelcome] = useState(welcome);
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<{ zone: string; text: string; tone: 'ok' | 'error' } | null>(null);

  const notify = (zone: string, text: string, tone: 'ok' | 'error' = 'ok') => {
    setFlash({ zone, text, tone });
    setTimeout(() => setFlash((f) => (f?.zone === zone && f.text === text ? null : f)), 4000);
  };

  const run = (zone: string, okText: string, fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      try {
        const res = await fn();
        if (res.ok) notify(zone, okText);
        else notify(zone, res.error ?? 'Échec.', 'error');
      } catch {
        notify(zone, 'Connexion impossible — réessaie.', 'error');
      }
    });

  const me = overview.members.find((m) => m.id === meId);
  const others = overview.members.filter((m) => m.id !== meId);
  const sharedWithMe = new Set(overview.sharesReceived);
  const iShareWith = new Set(overview.sharesGiven);

  /* --- édition du nom du foyer / de mon prénom --- */
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(overview.name);
  const [editingMe, setEditingMe] = useState(false);
  const [meDraft, setMeDraft] = useState(me?.displayName ?? '');

  /* --- confirmations armées (transfert / retrait) --- */
  const [armed, setArmed] = useState<string | null>(null);
  const arm = (key: string) => {
    setArmed(key);
    setTimeout(() => setArmed((a) => (a === key ? null : a)), 6000);
  };

  /* --- modales --- */
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [nutriFor, setNutriFor] = useState<{ id: string; name: string } | null>(null);

  /* --- invitation --- */
  const [inviteEmail, setInviteEmail] = useState('');

  return (
    <div className="flex flex-col gap-6">
      {showWelcome && (
        <section className="rounded-2xl border border-sage bg-sage-tint/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold">
                Bienvenue dans {overview.name} 👋
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-soft">
                Tu partages maintenant le planning des repas, le stock, la liste de courses et les
                recettes avec {overview.members.length > 1 ? 'la maisonnée' : 'ce foyer'}. Ta
                nutrition reste <strong>privée</strong> tant que tu ne la partages pas explicitement,
                membre par membre — tu peux configurer ton suivi sur la page Nutrition.
              </p>
            </div>
            <button
              className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs font-bold text-ink-soft hover:bg-surface"
              onClick={() => {
                setShowWelcome(false);
                router.replace('/foyer');
              }}
            >
              OK
            </button>
          </div>
        </section>
      )}
      <div>
        {editingName ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run('name', 'Foyer renommé ✓', () => renameHouseholdAction(nameDraft));
              setEditingName(false);
            }}
          >
            <input
              className="field-input max-w-xs text-lg font-semibold"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={80}
              autoFocus
            />
            <button className="btn-primary px-3 py-1.5 text-sm">Enregistrer</button>
            <button type="button" className="btn-secondary px-3 py-1.5 text-sm" onClick={() => setEditingName(false)}>
              Annuler
            </button>
          </form>
        ) : (
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold tracking-tight">
            Foyer — {overview.name}
            {overview.isAdmin && (
              <button
                className="rounded-full border border-line px-2.5 py-1 text-xs font-bold text-ink-soft hover:bg-sage-tint"
                onClick={() => {
                  setNameDraft(overview.name);
                  setEditingName(true);
                }}
              >
                renommer
              </button>
            )}
          </h1>
        )}
        {flash?.zone === 'name' && <Flash text={flash.text} tone={flash.tone} />}
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-soft">
          Stock, courses, planning et recettes sont partagés par la maisonnée. La nutrition de chacun reste
          privée tant qu&rsquo;elle n&rsquo;est pas partagée explicitement.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {/* ------------------------------ Membres ------------------------------ */}
        <div className="flex flex-col gap-5">
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <h2 className="mb-3 font-display text-lg font-semibold">Membres</h2>
            {flash?.zone === 'members' && <Flash text={flash.text} tone={flash.tone} />}
            <ul className="divide-y divide-line">
              {overview.members.map((m) => {
                const isMe = m.id === meId;
                return (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${avatarStyle(m.id)}`}
                      >
                        {(m.displayName.trim()[0] || '?').toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          {isMe && editingMe ? (
                            <form
                              className="flex items-center gap-2"
                              onSubmit={(e) => {
                                e.preventDefault();
                                run('members', 'Prénom mis à jour ✓', () => setDisplayNameAction(meDraft));
                                setEditingMe(false);
                              }}
                            >
                              <input
                                className="field-input max-w-[10rem] py-1 text-sm"
                                value={meDraft}
                                onChange={(e) => setMeDraft(e.target.value)}
                                maxLength={40}
                                autoFocus
                              />
                              <button className="text-xs font-bold text-green-strong">OK</button>
                            </form>
                          ) : (
                            <span className="truncate font-semibold">{m.displayName}</span>
                          )}
                          {m.isAdmin && (
                            <span className="rounded-full bg-butter-tint px-2 py-0.5 text-[11px] font-bold text-ink">
                              Admin
                            </span>
                          )}
                          {isMe && !editingMe && (
                            <button
                              className="text-xs font-bold text-ink-soft underline decoration-dotted hover:text-ink"
                              onClick={() => {
                                setMeDraft(m.displayName);
                                setEditingMe(true);
                              }}
                            >
                              moi — modifier
                            </button>
                          )}
                        </span>
                        <span className="block text-xs text-ink-soft">membre depuis le {fmtDate(m.joinedAt)}</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {!isMe && (
                        <>
                          <button
                            disabled={pending}
                            onClick={() =>
                              run(
                                'members',
                                iShareWith.has(m.id) ? 'Partage désactivé.' : 'Nutrition partagée ✓',
                                () => toggleNutritionShareAction(m.id, !iShareWith.has(m.id)),
                              )
                            }
                            className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                              iShareWith.has(m.id)
                                ? 'bg-sage-tint text-green-strong'
                                : 'border border-line text-ink-soft hover:bg-sage-tint/50'
                            }`}
                          >
                            {iShareWith.has(m.id) ? 'nutrition partagée ✓' : 'partager ma nutrition'}
                          </button>
                          {sharedWithMe.has(m.id) && (
                            <button
                              className="rounded-full border border-sage px-3 py-1.5 text-xs font-bold text-sage-deep hover:bg-sage-tint"
                              onClick={() => setNutriFor({ id: m.id, name: m.displayName })}
                            >
                              voir sa nutrition
                            </button>
                          )}
                          {overview.isAdmin && (
                            <>
                              <button
                                disabled={pending}
                                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                                  armed === `transfer:${m.id}`
                                    ? 'bg-butter text-ink'
                                    : 'border border-line text-ink-soft hover:bg-butter-tint'
                                }`}
                                onClick={() => {
                                  if (armed === `transfer:${m.id}`) {
                                    setArmed(null);
                                    run('members', `${m.displayName} est maintenant admin.`, () => transferAdminAction(m.id));
                                  } else arm(`transfer:${m.id}`);
                                }}
                              >
                                {armed === `transfer:${m.id}` ? 'confirmer le transfert ?' : 'rendre admin'}
                              </button>
                              <button
                                disabled={pending}
                                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                                  armed === `remove:${m.id}`
                                    ? 'bg-red-strong text-white'
                                    : 'border border-line text-red-strong hover:bg-clay-tint'
                                }`}
                                onClick={() => {
                                  if (armed === `remove:${m.id}`) {
                                    setArmed(null);
                                    run('members', `${m.displayName} a été retiré du foyer (ses recettes restent).`, () =>
                                      removeMemberAction(m.id),
                                    );
                                  } else arm(`remove:${m.id}`);
                                }}
                              >
                                {armed === `remove:${m.id}` ? 'confirmer le retrait ?' : 'retirer'}
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ------------------------- Qui voit quoi ------------------------- */}
          <section className="rounded-2xl border border-butter bg-butter-tint/60 p-4">
            <h2 className="mb-2 font-display text-base font-semibold">Qui voit quoi ?</h2>
            <ul className="grid gap-1.5 text-xs leading-relaxed text-ink-soft sm:grid-cols-2">
              <li>
                <span className="font-bold text-ink">Partagé par le foyer :</span> stock, liste de courses et
                historique, planning des repas, recettes et photos, seuils et réglages.
              </li>
              <li>
                <span className="font-bold text-ink">Privé par défaut :</span> profil nutrition, objectifs,
                habitudes, extras, conversations avec l&rsquo;assistant — visibles uniquement si TU les partages,
                membre par membre.
              </li>
            </ul>
          </section>
        </div>

        {/* ------------------------------ Aside ------------------------------ */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
          {/* Invitations */}
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <h2 className="mb-3 font-display text-lg font-semibold">Inviter quelqu&rsquo;un</h2>
            {overview.isAdmin ? (
              <>
                <form
                  className="flex flex-col gap-2.5 text-sm"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const email = inviteEmail;
                    // Message adapté : email réellement parti vs repli « lien à transmettre ».
                    startTransition(async () => {
                      try {
                        const res = await inviteMemberAction(email);
                        if (!res.ok) notify('invite', res.error, 'error');
                        else if (res.emailSent) notify('invite', `Invitation envoyée à ${email} ✓`);
                        else notify('invite', `Invitation créée — transmets le lien à ${email}.`);
                      } catch {
                        notify('invite', 'Connexion impossible — réessaie.', 'error');
                      }
                    });
                    setInviteEmail('');
                  }}
                >
                  <input
                    type="email"
                    required
                    placeholder="email@exemple.com"
                    className="field-input"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                  />
                  <button className="btn-primary py-2.5" disabled={pending}>
                    Inviter
                  </button>
                </form>
                <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                  Le lien est valable 7 jours. Tu peux aussi le copier ci-dessous pour le transmettre
                  toi-même.
                </p>
              </>
            ) : (
              <p className="text-xs leading-relaxed text-ink-soft">
                Les invitations sont gérées par l&rsquo;admin du foyer.
              </p>
            )}
            {flash?.zone === 'invite' && <div className="mt-2"><Flash text={flash.text} tone={flash.tone} /></div>}

            {overview.invitations.length > 0 && (
              <ul className="mt-4 flex flex-col gap-3 border-t border-line pt-3 text-sm">
                {overview.invitations.map((inv) => (
                  <li key={inv.id} className="rounded-xl border border-line bg-paper/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-semibold">{inv.email}</span>
                      {overview.isAdmin && (
                        <button
                          className="text-xs font-bold text-red-strong"
                          disabled={pending}
                          onClick={() => run('invite', 'Invitation annulée.', () => cancelInvitationAction(inv.id))}
                        >
                          annuler
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-ink-soft">expire le {fmtDate(inv.expiresAt)}</p>
                    <div className="mt-1.5 flex items-start gap-2">
                      <p className="min-w-0 flex-1 break-all text-xs text-ink-soft">
                        {baseUrl}/invitations/accept?token={inv.token}
                      </p>
                      <button
                        className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] font-bold text-ink-soft hover:bg-sage-tint"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(
                              `${baseUrl}/invitations/accept?token=${inv.token}`,
                            );
                            notify('invite', 'Lien copié ✓');
                          } catch {
                            notify('invite', 'Copie impossible — sélectionne le lien.', 'error');
                          }
                        }}
                      >
                        Copier le lien
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Réglages du foyer */}
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <h2 className="mb-1 font-display text-lg font-semibold">Réglages du foyer</h2>
            <p className="mb-3 text-xs text-ink-soft">Communs à toute la maisonnée.</p>
            {flash?.zone === 'settings' && <Flash text={flash.text} tone={flash.tone} />}
            <div className="flex flex-col gap-3 text-sm">
              <label className="flex items-center justify-between gap-3">
                <span className="text-ink-soft">Courses pour</span>
                <select
                  className="field-input max-w-[11rem] py-1.5"
                  value={overview.shoppingHorizonDays}
                  disabled={pending}
                  onChange={(e) =>
                    run('settings', 'Cadence enregistrée ✓', () =>
                      setHouseholdSettingsAction({ shoppingHorizonDays: Number(e.target.value) }),
                    )
                  }
                >
                  <option value={3}>Quelques jours (3 j)</option>
                  <option value={7}>1 semaine</option>
                  <option value={14}>2 semaines</option>
                  <option value={21}>3 semaines</option>
                  <option value={30}>1 mois</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-ink-soft">
                  Portions par défaut
                  <span className="block text-[11px]">d&rsquo;un repas de foyer (enfants compris)</span>
                </span>
                <select
                  className="field-input max-w-[11rem] py-1.5"
                  value={overview.defaultServings ?? ''}
                  disabled={pending}
                  onChange={(e) =>
                    run('settings', 'Portions enregistrées ✓', () =>
                      setHouseholdSettingsAction({
                        defaultServings: e.target.value === '' ? null : Number(e.target.value),
                      }),
                    )
                  }
                >
                  <option value="">Celles de la recette</option>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} portion{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-ink-soft">
                  Alerte péremption
                  <span className="block text-[11px]">articles à ≤ N jours</span>
                </span>
                <select
                  className="field-input max-w-[11rem] py-1.5"
                  value={expiryThresholdDays}
                  disabled={pending}
                  onChange={(e) =>
                    run('settings', 'Seuil enregistré ✓', () => setExpiryThresholdAction(Number(e.target.value)))
                  }
                >
                  {[1, 2, 3, 5, 7, 10, 14].map((n) => (
                    <option key={n} value={n}>
                      {n} jour{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          {/* Quitter */}
          <section className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <h2 className="mb-2 font-display text-base font-semibold">Quitter le foyer</h2>
            <p className="mb-3 text-xs leading-relaxed text-ink-soft">
              {others.length === 0
                ? 'Tu es le dernier membre : partir supprimera le foyer et toutes ses données partagées.'
                : 'Tes données nutrition restent privées et te suivent. Tu choisiras quoi faire de tes recettes.'}
            </p>
            <button className="btn-danger w-full py-2 text-sm" onClick={() => setLeaveOpen(true)}>
              Quitter le foyer…
            </button>
          </section>
        </aside>
      </div>

      {leaveOpen && (
        <LeaveModal
          lastMember={others.length === 0}
          onClose={() => setLeaveOpen(false)}
          onError={(msg) => notify('members', msg, 'error')}
        />
      )}
      {nutriFor && <SharedNutritionModal owner={nutriFor} onClose={() => setNutriFor(null)} />}
    </div>
  );
}

/* ------------------------------ Modale départ ------------------------------ */

function LeaveModal({
  lastMember,
  onClose,
  onError,
}: {
  lastMember: boolean;
  onClose: () => void;
  onError: (msg: string) => void;
}) {
  const [leaveRecipes, setLeaveRecipes] = useState(true);
  const [busy, setBusy] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg font-semibold">Quitter le foyer</h3>
        {lastMember ? (
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Tu es le <strong>dernier membre</strong> : le foyer sera <strong>supprimé</strong> avec toutes ses
            données partagées (stock, planning, liste et historique de courses). Tes recettes et tes données
            nutrition restent liées à ton compte.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Tes repas individuels à venir seront retirés du planning et tes partages nutrition annulés. Que
              faire de <strong>tes recettes</strong> ?
            </p>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 hover:bg-sage-tint/40">
                <input
                  type="radio"
                  name="recipes"
                  checked={leaveRecipes}
                  onChange={() => setLeaveRecipes(true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Les laisser au foyer</span>
                  <span className="block text-xs text-ink-soft">
                    Le livre de cuisine reste complet ; les repas déjà planifiés ne cassent pas.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line p-3 hover:bg-sage-tint/40">
                <input
                  type="radio"
                  name="recipes"
                  checked={!leaveRecipes}
                  onChange={() => setLeaveRecipes(false)}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-semibold">Les emporter</span>
                  <span className="block text-xs text-ink-soft">
                    Elles disparaissent du foyer et te suivront dans ton prochain foyer.
                  </span>
                </span>
              </label>
            </div>
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary px-4 py-2 text-sm" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            className="btn-danger px-4 py-2 text-sm"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const res = await leaveHouseholdAction(lastMember ? false : leaveRecipes);
                // En cas de succès l'action REDIRIGE (jamais de retour ici).
                if (res && !res.ok) {
                  onError(res.error);
                  onClose();
                }
              } catch {
                // NEXT_REDIRECT remonte comme une exception côté client : rien à faire.
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Départ…' : lastMember ? 'Supprimer le foyer et partir' : 'Quitter le foyer'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------- Modale nutrition partagée -------------------------- */

function SharedNutritionModal({ owner, onClose }: { owner: { id: string; name: string }; onClose: () => void }) {
  const [state, setState] = useState<
    { s: 'loading' } | { s: 'error'; msg: string } | { s: 'ready'; week: SharedNutritionWeek }
  >({ s: 'loading' });

  // Chargement au montage (une modale = une lecture).
  useEffect(() => {
    let cancelled = false;
    sharedNutritionAction(owner.id)
      .then((res) => {
        if (!cancelled) setState(res.ok ? { s: 'ready', week: res.week } : { s: 'error', msg: res.error });
      })
      .catch(() => {
        if (!cancelled) setState({ s: 'error', msg: 'Connexion impossible — réessaie.' });
      });
    return () => {
      cancelled = true;
    };
  }, [owner.id]);

  const statusChip = (status: 'under' | 'in' | 'over' | null) =>
    status === null ? null : (
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
          status === 'in'
            ? 'bg-sage-tint text-green-strong'
            : status === 'under'
              ? 'bg-butter-tint text-ink'
              : 'bg-clay-tint text-red-strong'
        }`}
      >
        {status === 'in' ? 'dans la zone' : status === 'under' ? 'en dessous' : 'au-dessus'}
      </span>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-surface p-5 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold">Nutrition de {owner.name} — cette semaine</h3>
          <button className="text-sm font-bold text-ink-soft" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="mt-0.5 text-[11px] text-ink-soft">Lecture seule — {owner.name} peut retirer ce partage à tout moment.</p>

        {state.s === 'loading' && <p className="mt-4 text-sm text-ink-soft">Chargement…</p>}
        {state.s === 'error' && <p className="mt-4 text-sm font-semibold text-red-strong">{state.msg}</p>}

        {state.s === 'ready' && state.week.kind === 'none' && (
          <p className="mt-4 text-sm text-ink-soft">
            {owner.name} n&rsquo;a pas encore activé son suivi nutrition.
          </p>
        )}

        {state.s === 'ready' && state.week.kind === 'child' && (
          <div className="mt-4 flex flex-col gap-3 text-sm">
            <p className="text-ink-soft">
              Profil enfant : on parle variété et découvertes, jamais de chiffres.
            </p>
            <div>
              <p className="font-semibold">Légumes goûtés cette semaine</p>
              {state.week.week.vegetablesPast.length > 0 ? (
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {state.week.week.vegetablesPast.map((v) => (
                    <span key={v} className="rounded-full bg-sage-tint px-2.5 py-1 text-xs font-semibold text-sage-deep">
                      {v}
                    </span>
                  ))}
                </p>
              ) : (
                <p className="text-xs text-ink-soft">Rien encore cette semaine.</p>
              )}
            </div>
            {state.week.week.vegetablesUpcoming.length > 0 && (
              <p className="text-xs text-ink-soft">
                À venir :{' '}
                {state.week.week.vegetablesUpcoming.map((v) => `${v.name} (${v.day})`).join(', ')}
              </p>
            )}
            {state.week.week.discovery && (
              <p className="rounded-xl border border-butter bg-butter-tint/60 p-2.5 text-xs">
                🌟 Découverte de la semaine : <strong>{state.week.week.discovery.name}</strong> (
                {state.week.week.discovery.day})
              </p>
            )}
          </div>
        )}

        {state.s === 'ready' && state.week.kind === 'adult' && (
          <div className="mt-4 flex flex-col gap-4 text-sm">
            <div>
              <p className="mb-1.5 font-semibold">Nutriments suivis (réel estimé / jour visé)</p>
              {state.week.nutrients.length === 0 ? (
                <p className="text-xs text-ink-soft">Aucun nutriment suivi.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {state.week.nutrients.map((n) => (
                    <li key={n.code} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="font-semibold">{n.name}</span>
                        <span className="block text-[11px] text-ink-soft">
                          semaine : {n.real} {n.unit} réel · {n.planned} {n.unit} planifié
                          {n.min != null || n.max != null
                            ? ` · zone/j : ${n.min ?? '—'}–${n.max ?? '—'} ${n.unit}`
                            : ''}
                        </span>
                      </span>
                      {statusChip(n.status)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {state.week.habits.length > 0 && (
              <div>
                <p className="mb-1.5 font-semibold">Habitudes</p>
                <ul className="flex flex-col gap-1.5">
                  {state.week.habits.map((h) => (
                    <li key={h.label} className="flex items-center justify-between gap-3 text-xs">
                      <span>
                        <span className="font-semibold">{h.label}</span>{' '}
                        <span className="text-ink-soft">({h.objective})</span>
                      </span>
                      <span className={`font-bold ${h.reached ? 'text-green-strong' : 'text-ink-soft'}`}>
                        {h.done} fait{h.done > 1 ? 's' : ''}
                        {h.upcoming > 0 ? ` · ${h.upcoming} à venir` : ''} {h.reached ? '✓' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {state.week.coveragePct != null && (
              <p className="text-[11px] text-ink-soft">
                Couverture des données : {state.week.coveragePct} % — estimation, comme sur sa page Nutrition.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
