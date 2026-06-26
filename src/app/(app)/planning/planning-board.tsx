'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, isoDate } from '@/lib/dates';
import type { MealSlot } from '@/lib/core';
import {
  addMealAction,
  deleteMealAction,
  markDayOffAction,
  unmarkDayOffAction,
  recordDeviationAction,
  clearDeviationAction,
  reassignLeftoverAction,
  setMealLeftoverAction,
  copyWeekAction,
  suggestRecipesAction,
  type RecipeSuggestion,
} from './actions';

// ---------------------------------------------------------------------------
// Types (snapshot sérialisable fourni par la page serveur).
// ---------------------------------------------------------------------------
export interface RecipeOption { id: string; name: string; time: number; tags: string[]; serves: number; imageUrl: string | null; }
export interface ProfileOption { id: string; name: string; }
export interface MealView {
  id: string;
  dayIndex: number;
  slot: string; // clé design : petitDej | dejeuner | diner | collation
  recipeId: string | null;
  name: string;
  serves: number;
  imageUrl: string | null;
  leftover: boolean;
  fromLeftover: boolean;
  leftoverSourceName: string | null;
  replannedCount: number;
  individual: string | null;
  status: 'skipped' | 'different' | null;
  diff: string | null;
}

interface BoardProps {
  weekStart: string;
  weekLabel: string;
  dates: number[];
  dateLabels: string[];
  todayIndex: number;
  prevWeek: string;
  nextWeek: string;
  thisWeek: string;
  meals: MealView[];
  offDates: number[];
  recipes: RecipeOption[];
  profiles: ProfileOption[];
  /** Recette tout juste créée à rattacher (retour du flux « + Créer une recette »). */
  pending: { recipeId: string; d: number; slot: string } | null;
}

// Police (next/font → variables CSS).
const FF_DISPLAY = 'var(--font-display)';
const FF_SANS = 'var(--font-sans)';
const FF_HAND = 'var(--font-hand)';

const SLOT_ORDER = ['petitDej', 'dejeuner', 'diner', 'collation'] as const;
type SlotKey = (typeof SLOT_ORDER)[number];
const SLOT_TO_DB: Record<SlotKey, MealSlot> = { petitDej: 'breakfast', dejeuner: 'lunch', diner: 'dinner', collation: 'snack' };
const SLOT_META: Record<SlotKey, { label: string; bar: string; tint: string; dot: string; icon: string }> = {
  petitDej: { label: 'Petit-déj', bar: '#E4C95E', tint: '#F8F1D4', dot: '#D9B83F', icon: 'sunrise' },
  dejeuner: { label: 'Déjeuner', bar: '#9CBE96', tint: '#E2ECDB', dot: '#7CA875', icon: 'sun' },
  diner: { label: 'Dîner', bar: '#D9A98C', tint: '#F3E2D7', dot: '#C98A66', icon: 'moon' },
  collation: { label: 'Collation', bar: '#C3B690', tint: '#F1ECDD', dot: '#AE9F70', icon: 'cookie' },
};
const DAY_FULL = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const DAY_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

const ICONS: Record<string, string> = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  cl: '<path d="M15 6l-6 6 6 6"/>',
  cr: '<path d="M9 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  alert: '<path d="M12 3.5L21 19H3z"/><path d="M12 10v4M12 16.5h.01"/>',
  repeat: '<path d="M4 9.5a6 6 0 0 1 10-3.2L16 8M20 14.5a6 6 0 0 1-10 3.2L8 16"/><path d="M16 4v4h-4M8 20v-4h4"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c0-3.6 3.4-5.5 7.5-5.5s7.5 1.9 7.5 5.5"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M2.5 20c0-3 2.9-4.7 6.5-4.7M16 5.2a3 3 0 0 1 0 5.6M15 15.6c3 .5 5.5 2.1 5.5 4.4"/>',
  sparkles: '<path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z"/><path d="M18.5 14l.7 1.7 1.8.8-1.8.8-.7 1.7-.7-1.7-1.8-.8 1.8-.8z"/>',
  cart: '<circle cx="9.5" cy="20" r="1.3"/><circle cx="17" cy="20" r="1.3"/><path d="M3 4h2.2l2 11h10l1.9-8H6.2"/>',
  sun: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>',
  moon: '<path d="M20 14.2A8 8 0 1 1 10 3.5a6.2 6.2 0 0 0 10 10.7z"/>',
  sunrise: '<path d="M17 18a5 5 0 0 0-10 0"/><path d="M12 2.5v4M3.5 18h2M18.5 18h2M5.6 9.6l1.4 1.4M17 11l1.4-1.4M2 22h20M9 5.5l3-3 3 3"/>',
  cookie: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="9.5" r="1"/><circle cx="14.5" cy="9" r="1"/><circle cx="15" cy="14.5" r="1"/><circle cx="9.5" cy="15" r="1"/>',
  check: '<path d="M5 12.5l4.5 4.5L20 6.5"/>',
  ar: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2.2"/><path d="M5 15V5.2A2.2 2.2 0 0 1 7.2 3H17"/>',
  undo: '<path d="M9 14l-4-4 4-4"/><path d="M5 10h9.5a5.5 5.5 0 0 1 0 11H11"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  utensils: '<path d="M6 3v6.5a2.2 2.2 0 0 0 4.4 0V3M8.2 11.7V21M16.5 3c-1.6 1-2.4 3-2.4 5.6 0 1.8 1 2.9 2.4 2.9V21"/>',
  more: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2.4"/><path d="M3 9.5h18M8 3v4M16 3v4"/>',
  pencil: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/>',
  grip: '<circle cx="9" cy="6" r="1.1"/><circle cx="15" cy="6" r="1.1"/><circle cx="9" cy="12" r="1.1"/><circle cx="15" cy="12" r="1.1"/><circle cx="9" cy="18" r="1.1"/><circle cx="15" cy="18" r="1.1"/>',
  replan: '<path d="M5 4v6.5A2.5 2.5 0 0 0 7.5 13H17"/><path d="M13 9l4 4-4 4"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11.5v5M12 8h.01"/>',
  bowl: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M12 7c-1-2 .5-3.5 1.5-3-.5 1.5.5 2.5 1.5 2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
};

function Ic({ name, size = 18, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline-block', verticalAlign: 'middle', flex: '0 0 auto' }}
      dangerouslySetInnerHTML={{ __html: ICONS[name] || '' }}
    />
  );
}

// ---------------------------------------------------------------------------
// Petits composants UI (pill / iconBtn / btn) — calqués sur le handoff.
// ---------------------------------------------------------------------------
function Pill({ label, icon, bg = '#EFEADD', color = '#6F6B61', fs = 12.5, pad = '3px 9px', is = 13 }: { label: ReactNode; icon?: string; bg?: string; color?: string; fs?: number; pad?: string; is?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: pad, borderRadius: 999, fontSize: fs, fontWeight: 600, lineHeight: 1.2, background: bg, color, whiteSpace: 'nowrap' }}>
      {icon ? <Ic name={icon} size={is} color={color} /> : null}
      {label}
    </span>
  );
}

function IconBtn({ name, onClick, title, size = 34, r = 9, border = '#E7E0D2', bg = '#FFFDFA', color = '#6F6B61', ic = 16 }: { name: string; onClick?: (e: React.MouseEvent) => void; title?: string; size?: number; r?: number; border?: string; bg?: string; color?: string; ic?: number }) {
  return (
    <button type="button" title={title} onClick={(e) => { e.stopPropagation(); onClick?.(e); }} style={{ width: size, height: size, minWidth: size, borderRadius: r, border: `1px solid ${border}`, background: bg, color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flex: '0 0 auto', transition: 'background .15s,border-color .15s' }}>
      <Ic name={name} size={ic} color={color} />
    </button>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger';
function Btn({ label, onClick, v = 'secondary', icon, is = 17, pad = '11px 16px', fs = 14.5, minH = 44, full = false, disabled = false }: { label: ReactNode; onClick?: () => void; v?: BtnVariant; icon?: string; is?: number; pad?: string; fs?: number; minH?: number; full?: boolean; disabled?: boolean }) {
  let bg = '#FFFDFA', color = '#5E7E58', border = '1px solid #D7CDB9';
  if (v === 'primary') { bg = '#2F8049'; color = '#fff'; border = '1px solid #2F8049'; }
  else if (v === 'soft') { bg = '#DCE8D4'; color = '#3C5A36'; border = '1px solid transparent'; }
  else if (v === 'ghost') { bg = 'transparent'; color = '#6F6B61'; border = '1px solid transparent'; }
  else if (v === 'danger') { bg = '#FFFDFA'; color = '#C23E2E'; border = '1px solid #ECC9C2'; }
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: pad, borderRadius: 12, fontSize: fs, fontWeight: 700, fontFamily: FF_SANS, border, background: bg, color, cursor: 'pointer', minHeight: minH, lineHeight: 1, width: full ? '100%' : 'auto', whiteSpace: 'nowrap', opacity: disabled ? 0.55 : 1 }}>
      {icon ? <Ic name={icon} size={is} color={color} /> : null}
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
type Overlay =
  | { type: 'add'; d: number; slot: SlotKey; step: 'search' | 'config'; recipe: RecipeOption | 'libre' | null }
  | { type: 'ecart'; d: number; mealId: string; name: string; step?: 'diff' }
  | { type: 'replan'; sourceMealId: string; recipeName: string }
  | { type: 'ai' }
  | null;

export function PlanningBoard(props: BoardProps) {
  const { weekStart, weekLabel, dates, dateLabels, todayIndex, prevWeek, nextWeek, thisWeek, meals, offDates, recipes, profiles, pending } = props;
  const router = useRouter();
  const [, startT] = useTransition();
  const start0 = new Date(`${weekStart}T00:00:00`);
  const dateFor = (d: number) => isoDate(addDays(start0, d));
  const refresh = () => router.refresh();
  const run = (fn: () => Promise<unknown>) => startT(async () => { await fn(); refresh(); });

  const [view, setView] = useState<'agenda' | 'grid' | 'jour'>('agenda');
  const [focusDay, setFocusDay] = useState(todayIndex >= 0 ? todayIndex : 0);
  const [mobileMode, setMobileMode] = useState<'jour' | 'semaine'>('jour');
  const [isMobile, setIsMobile] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Tout');
  const [draftPortions, setDraftPortions] = useState(2);
  const [draftLeftover, setDraftLeftover] = useState(false);
  const [draftIndividual, setDraftIndividual] = useState(''); // profileId
  const [draftName, setDraftName] = useState('');
  const [diffText, setDiffText] = useState('');
  const [replanSel, setReplanSel] = useState<{ d: number; slot: SlotKey }>({ d: todayIndex >= 0 ? todayIndex : 0, slot: 'dejeuner' });
  const [replanMode, setReplanMode] = useState<'telquel' | 'plat'>('telquel');
  const [replanName, setReplanName] = useState('');
  const [replanExtra, setReplanExtra] = useState('');
  const [aiList, setAiList] = useState<RecipeSuggestion[] | null>(null);
  const [copyPending, startCopy] = useTransition();

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Retour du flux « + Créer une recette » : ouvre la config pour rattacher la recette
  // au créneau d'origine, puis nettoie l'URL. (setState différé → règle set-state-in-effect.)
  useEffect(() => {
    if (!pending) return;
    const r = recipes.find((x) => x.id === pending.recipeId);
    const raf = requestAnimationFrame(() => {
      if (r) {
        setDraftPortions(r.serves || 2);
        setDraftLeftover(false);
        setDraftIndividual('');
        setOverlay({ type: 'add', d: pending.d, slot: pending.slot as SlotKey, step: 'config', recipe: r });
      }
      router.replace(`/planning?week=${weekStart}`);
    });
    return () => cancelAnimationFrame(raf);
  }, [pending, recipes, weekStart, router]);

  // ---- données dérivées ----
  const mealsAt = (d: number, slot: SlotKey) => meals.filter((m) => m.dayIndex === d && m.slot === slot);
  const isOff = (d: number) => offDates.includes(d);
  const isToday = (d: number) => d === todayIndex;
  // État « semaine vide » réservé aux semaines FUTURES (anti-feuille-blanche) ; sur la
  // semaine courante/passée vide on montre l'agenda (avec ses boutons d'ajout partout).
  const emptyWeek = meals.length === 0 && offDates.length === 0 && weekStart > thisWeek;
  const firstEmptySlot = (d: number): SlotKey => SLOT_ORDER.find((s) => mealsAt(d, s).length === 0) ?? 'dejeuner';

  // ---- mutations ----
  function openAdd(d: number, slot: SlotKey) {
    setSearch(''); setFilter('Tout'); setDraftPortions(2); setDraftLeftover(false); setDraftIndividual(''); setDraftName('');
    setOverlay({ type: 'add', d, slot, step: 'search', recipe: null });
  }
  function chooseRecipe(r: RecipeOption) {
    setDraftPortions(r.serves || 2);
    setOverlay((o) => (o && o.type === 'add' ? { ...o, step: 'config', recipe: r } : o));
  }
  function createRecipeFor(d: number, slot: SlotKey) {
    // Traçabilité (décision utilisateur) : plus de repas libre → créer une vraie recette,
    // puis revenir au planning la rattacher au créneau (cf. effet `pending`).
    const ret = `/planning?week=${weekStart}&planD=${d}&planSlot=${slot}`;
    router.push(`/recettes/nouvelle?return=${encodeURIComponent(ret)}`);
  }
  function confirmAdd() {
    if (!overlay || overlay.type !== 'add' || !overlay.recipe) return;
    const o = overlay;
    const libre = o.recipe === 'libre';
    setOverlay(null);
    run(() =>
      addMealAction({
        date: dateFor(o.d),
        slot: SLOT_TO_DB[o.slot],
        recipeId: libre ? undefined : (o.recipe as RecipeOption).id,
        freeText: libre ? draftName || 'Repas libre' : undefined,
        servings: libre ? undefined : draftPortions,
        producesLeftover: draftLeftover,
        individualProfileId: draftIndividual || undefined,
      }),
    );
  }
  const removeMeal = (mealId: string) => { setMenu(null); run(() => deleteMealAction(mealId)); };
  function setStatus(mealId: string, status: 'skipped' | 'different' | null, diff?: string) {
    setOverlay(null);
    run(() => (status ? recordDeviationAction(mealId, status, diff) : clearDeviationAction(mealId)));
  }
  const toggleOff = (d: number) => { setMenu(null); run(() => (isOff(d) ? unmarkDayOffAction(dateFor(d)) : markDayOffAction(dateFor(d)))); };
  function doReplan(sourceMealId: string, d: number, slot: SlotKey) {
    setOverlay(null);
    setFocusDay(d);
    const name = replanMode === 'plat' ? replanName.trim() || undefined : undefined;
    const extra = replanMode === 'plat' ? replanExtra.trim() || undefined : undefined;
    run(() => reassignLeftoverAction(sourceMealId, dateFor(d), SLOT_TO_DB[slot], name, extra));
  }
  function openReplan(sourceMealId: string, recipeName: string) {
    setReplanMode('telquel'); setReplanName(''); setReplanExtra('');
    setReplanSel({ d: focusDay, slot: 'dejeuner' });
    setOverlay({ type: 'replan', sourceMealId, recipeName });
  }
  const markLeftover = (mealId: string, value: boolean) => run(() => setMealLeftoverAction(mealId, value));
  const [flash, setFlash] = useState<string | null>(null);
  const showFlash = (msg: string) => { setFlash(msg); window.setTimeout(() => setFlash(null), 3200); };
  const duplicatePrev = () => {
    if (meals.length > 0 && !window.confirm('Cette semaine contient déjà des repas. Copier ceux de la semaine précédente par-dessus ?')) return;
    startCopy(async () => {
      const n = await copyWeekAction(prevWeek, weekStart);
      refresh();
      showFlash(n > 0 ? `${n} repas copiés depuis la semaine précédente.` : 'Rien à copier dans la semaine précédente.');
    });
  };
  function openAi() {
    setAiList(null);
    setOverlay({ type: 'ai' });
    suggestRecipesAction().then(setAiList).catch(() => setAiList([]));
  }
  function aiAdd(s: RecipeSuggestion) {
    const d = focusDay; // jour focalisé de la semaine CONSULTÉE (pas forcément aujourd'hui)
    setOverlay(null);
    run(() => addMealAction({ date: dateFor(d), slot: SLOT_TO_DB[firstEmptySlot(d)], recipeId: s.id, servings: undefined }));
  }
  const goWeek = (iso: string) => router.push(`/planning?week=${iso}`);

  // =========================================================================
  // CHROME
  // =========================================================================
  function weekControls() {
    const seg = (label: string, icon: string, active: boolean, onClick: () => void) => (
      <button key={label} type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', border: 'none', background: active ? '#FFFDFA' : 'transparent', color: active ? '#34322C' : '#6F6B61', borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS, boxShadow: active ? '0 1px 2px rgba(52,50,44,.10)' : 'none', minHeight: 38 }}>
        <Ic name={icon} size={15} color={active ? '#5E7E58' : '#9A958A'} />{label}
      </button>
    );
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: '#F1EBDD', border: '1px solid #E7E0D2', borderRadius: 12, padding: 3 }}>
            <IconBtn name="cl" onClick={() => goWeek(prevWeek)} border="transparent" bg="transparent" size={30} title="Semaine précédente" />
            <div style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 16.5, padding: '0 8px', minWidth: 128, textAlign: 'center', whiteSpace: 'nowrap' }}>{weekLabel}</div>
            <IconBtn name="cr" onClick={() => goWeek(nextWeek)} border="transparent" bg="transparent" size={30} title="Semaine suivante" />
          </div>
          {todayIndex < 0 ? <Btn label="Aujourd'hui" onClick={() => goWeek(thisWeek)} v="secondary" pad="9px 13px" minH={40} fs={13.5} icon="cal" is={15} /> : null}
          <Btn label={copyPending ? '…' : 'Dupliquer'} onClick={duplicatePrev} v="soft" pad="9px 13px" minH={40} fs={13.5} icon="copy" is={15} disabled={copyPending} />
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: '#F1EBDD', border: '1px solid #E7E0D2', borderRadius: 11, padding: 3 }}>
          {seg('Agenda', 'list', view === 'agenda', () => setView('agenda'))}
          {seg('Grille', 'cal', view === 'grid', () => setView('grid'))}
          {seg('Jour', 'sun', view === 'jour', () => setView('jour'))}
        </div>
      </div>
    );
  }

  function toolbar() {
    if (isMobile) return <div style={{ height: 4 }} />;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#FFFDFA', border: '1px solid #E7E0D2', borderRadius: 14, padding: '10px 14px', marginBottom: 18, boxShadow: '0 1px 2px rgba(52,50,44,.05)' }}>
        <button type="button" onClick={openAi} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '9px 14px', borderRadius: 11, border: '1px solid #C9D9C1', background: '#E6F0DF', color: '#2F8049', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS, minHeight: 42 }}>
          <Ic name="sparkles" size={17} color="#2F8049" />Proposer des repas avec mon stock
        </button>
        <button type="button" onClick={() => router.push('/courses')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 11, border: '1px solid #E7E0D2', background: '#FFFDFA', color: '#6F6B61', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS, minHeight: 42 }}>
          <Ic name="cart" size={16} color="#8A8472" />Voir mes courses
        </button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#9A958A', fontSize: 12.5 }}>
          <Ic name="info" size={14} color="#B8B1A4" />Un repas prévu = mangé tel quel. Tu n’agis qu’en cas d’écart.
        </div>
      </div>
    );
  }

  // =========================================================================
  // MEAL CARD
  // =========================================================================
  function mealCard(meal: MealView, big?: boolean) {
    const sm = SLOT_META[meal.slot as SlotKey];
    const skipped = meal.status === 'skipped';
    const diff = meal.status === 'different';
    const initial = (meal.name || '?').trim()[0] || '?';
    const badges: ReactNode[] = [];
    if (meal.fromLeftover) badges.push(<Pill key="fl" label="Issu d’un reste" bg="#E2ECDB" color="#3C5A36" icon="repeat" is={12} />);
    if (meal.leftover) badges.push(<Pill key="lo" label={meal.replannedCount > 0 ? `Reste · ${meal.replannedCount} replanifié${meal.replannedCount > 1 ? 's' : ''}` : 'Produit un reste'} bg="#E6F0DF" color="#2F8049" icon="repeat" is={12} />);
    if (meal.individual) badges.push(<Pill key="iv" label={`pour ${meal.individual}`} bg="#F3E2D7" color="#9A5638" icon="user" is={12} />);
    const ps = big ? 46 : 38;
    return (
      <div key={meal.id} style={{ position: 'relative', background: '#FFFDFA', border: '1px solid #E7E0D2', borderLeft: `3px solid ${sm.bar}`, borderRadius: 12, padding: '11px 12px', display: 'flex', gap: 11, alignItems: 'flex-start', boxShadow: '0 1px 2px rgba(52,50,44,.05)' }}>
        <div style={{ width: ps, height: ps, borderRadius: 10, background: meal.imageUrl ? '#E2ECDB' : '#E2ECDB', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: big ? 19 : 16, color: '#6F6B61', opacity: skipped ? 0.5 : 1, overflow: 'hidden' }}>
          {meal.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL signée éphémère (bucket privé)
            <img src={meal.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : meal.recipeId ? initial : <Ic name="utensils" size={big ? 20 : 17} color="#8A8472" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, lineHeight: 1.28, color: skipped ? '#9A958A' : '#34322C', textDecoration: skipped ? 'line-through' : 'none' }}>{meal.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 5 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#6F6B61', fontSize: 13, fontWeight: 600 }}><Ic name="users" size={13} color="#8A8472" />{meal.serves} pers.</span>
            {badges}
          </div>
          {skipped ? <div style={{ marginTop: 7 }}><Pill label="Sauté" bg="#FBE4DF" color="#C23E2E" icon="ban" is={12} /></div> : null}
          {diff ? <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 6, color: '#B5641F', fontSize: 13, fontWeight: 600 }}><Ic name="ar" size={13} color="#EF8A3C" />À la place :&nbsp;<span style={{ color: '#9A5012' }}>{meal.diff}</span></div> : null}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
            {meal.leftover ? (
              <button type="button" onClick={() => openReplan(meal.id, meal.name)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, border: '1px solid #C9D9C1', background: '#fff', color: '#2F8049', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS }}><Ic name="replan" size={13} color="#2F8049" />Replanifier le reste</button>
            ) : null}
            {!meal.leftover && !meal.fromLeftover && meal.recipeId ? (
              <button type="button" onClick={() => markLeftover(meal.id, true)} title="J'en ai cuisiné plus / il en reste" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, border: '1px solid #E7E0D2', background: '#fff', color: '#6F6B61', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS }}><Ic name="repeat" size={13} color="#7CA875" />Il en reste</button>
            ) : null}
            {skipped || diff ? (
              <button type="button" onClick={() => setStatus(meal.id, null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, border: '1px solid #E7E0D2', background: '#fff', color: '#6F6B61', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS }}><Ic name="undo" size={13} color="#6F6B61" />Comme prévu</button>
            ) : (
              <button type="button" onClick={() => setOverlay({ type: 'ecart', d: meal.dayIndex, mealId: meal.id, name: meal.name })} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 8, border: '1px solid #E7E0D2', background: '#fff', color: '#6F6B61', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS }}><Ic name="alert" size={13} color="#9A958A" />Signaler un écart</button>
            )}
            <IconBtn name="trash" onClick={() => removeMeal(meal.id)} size={30} title="Supprimer" color="#B0867C" border="#EEDFD8" />
          </div>
        </div>
      </div>
    );
  }

  function addSlotBtn(d: number, slot: SlotKey, opts?: { strong?: boolean; label?: string; h?: number }) {
    const sm = SLOT_META[slot];
    const strong = opts?.strong;
    return (
      <button type="button" onClick={() => openAdd(d, slot)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', minHeight: opts?.h || 44, border: `1.5px dashed ${strong ? sm.bar : '#DAD2C2'}`, background: strong ? sm.tint : 'transparent', color: strong ? '#6F6B61' : '#9A958A', borderRadius: 11, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS, transition: 'all .15s' }}>
        <Ic name="plus" size={16} color={strong ? sm.dot : '#A89F8E'} />{opts?.label || 'Ajouter'}
      </button>
    );
  }

  function slotColumn(d: number, slot: SlotKey) {
    const sm = SLOT_META[slot];
    const ms = mealsAt(d, slot);
    return (
      <div key={slot} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '0 2px 2px' }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: sm.dot, flex: '0 0 auto' }} />
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.03em', textTransform: 'uppercase', color: '#8A8472' }}>{sm.label}</span>
        </div>
        {ms.map((m) => mealCard(m))}
        {addSlotBtn(d, slot, { strong: ms.length === 0, label: ms.length ? 'Ajouter' : sm.label.toLowerCase() })}
      </div>
    );
  }

  function dayHeader(d: number, opts?: { big?: boolean; mb?: number }) {
    const off = isOff(d);
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: opts?.mb != null ? opts.mb : 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: opts?.big ? 24 : 20, color: '#34322C', letterSpacing: '-0.01em' }}>{DAY_FULL[d]}</span>
          <span style={{ color: '#A89F8E', fontSize: 14, fontWeight: 600 }}>{dateLabels[d]}</span>
          {isToday(d) ? <Pill label="Aujourd'hui" bg="#DCE8D4" color="#3C5A36" fs={12} pad="2px 10px" /> : null}
        </div>
        {!off ? dayMenu(d) : null}
      </div>
    );
  }

  function dayMenu(d: number) {
    const open = menu === `day-${d}`;
    const off = isOff(d);
    return (
      <div style={{ position: 'relative' }}>
        <IconBtn name="more" onClick={() => setMenu(open ? null : `day-${d}`)} size={32} title="Options du jour" />
        {open ? (
          <div style={{ position: 'absolute', right: 0, top: 38, zIndex: 40, background: '#FFFDFA', border: '1px solid #E7E0D2', borderRadius: 12, boxShadow: '0 10px 28px rgba(52,50,44,.14)', padding: 6, minWidth: 208 }}>
            {menuItem(off ? 'undo' : 'ban', off ? 'Réactiver la journée' : 'Marquer hors-plan', () => toggleOff(d), off ? '#2F8049' : '#34322C')}
            {menuItem('cart', 'Voir les courses du jour', () => { setMenu(null); router.push('/courses'); })}
          </div>
        ) : null}
      </div>
    );
  }
  function menuItem(icon: string, label: string, onClick: () => void, color?: string) {
    return (
      <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', border: 'none', background: 'transparent', borderRadius: 8, fontSize: 14, fontWeight: 600, color: color || '#34322C', cursor: 'pointer', textAlign: 'left', fontFamily: FF_SANS }} onMouseEnter={(e) => (e.currentTarget.style.background = '#F3EEE3')} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
        <Ic name={icon} size={16} color={color || '#6F6B61'} />{label}
      </button>
    );
  }

  function offPlanCard(d: number, compact?: boolean) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', background: 'repeating-linear-gradient(135deg,#F4EEE2,#F4EEE2 9px,#F0E9DB 9px,#F0E9DB 18px)', border: '1px dashed #D7CDB9', borderRadius: 14, padding: compact ? '14px 16px' : '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{ width: 42, height: 42, borderRadius: 11, background: '#FBF7EF', border: '1px solid #E7E0D2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic name="ban" size={20} color="#A89F8E" /></div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#34322C' }}>Journée hors-plan</div>
            <div style={{ color: '#9A958A', fontSize: 13, marginTop: 2 }}>Restau, invités, jour off — rien à prévoir ni à acheter.</div>
          </div>
        </div>
        <Btn label="Réactiver la journée" onClick={() => toggleOff(d)} v="secondary" icon="undo" pad="9px 14px" minH={42} fs={13.5} />
      </div>
    );
  }

  // =========================================================================
  // VIEWS (desktop)
  // =========================================================================
  function renderAgenda() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {DAY_FULL.map((_, d) => {
          const off = isOff(d);
          const today = isToday(d);
          return (
            <div key={d} style={{ background: '#FFFDFA', border: `1px solid ${today ? '#BFD6B6' : '#E7E0D2'}`, boxShadow: today ? '0 2px 10px rgba(94,126,88,.10)' : '0 1px 2px rgba(52,50,44,.04)', borderRadius: 16, padding: '18px 20px', position: 'relative' }}>
              {today ? <div style={{ position: 'absolute', left: 0, top: 18, bottom: 18, width: 4, borderRadius: 99, background: '#9CBE96' }} /> : null}
              {dayHeader(d)}
              {off ? offPlanCard(d) : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>{SLOT_ORDER.map((s) => slotColumn(d, s))}</div>}
            </div>
          );
        })}
      </div>
    );
  }

  function renderGrid() {
    const cellChip = (m: MealView) => {
      const sm = SLOT_META[m.slot as SlotKey];
      const skipped = m.status === 'skipped';
      return (
        <div key={m.id} onClick={() => { setView('jour'); setFocusDay(m.dayIndex); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 8, background: '#FFFDFA', border: '1px solid #ECE5D7', borderLeft: `3px solid ${sm.bar}`, cursor: 'pointer', minWidth: 0 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: skipped ? '#A89F8E' : '#34322C', textDecoration: skipped ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</span>
          {m.leftover ? <Ic name="repeat" size={12} color="#7CA875" /> : null}
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#A89F8E', flex: '0 0 auto' }}>×{m.serves}</span>
        </div>
      );
    };
    return (
      <div style={{ background: '#FFFDFA', border: '1px solid #E7E0D2', borderRadius: 16, padding: '16px 16px 18px', boxShadow: '0 1px 2px rgba(52,50,44,.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#9A958A', fontSize: 12.5 }}><Ic name="info" size={14} color="#B8B1A4" />Vue compacte — clique un jour ou une case pour ouvrir le détail.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '74px repeat(7,1fr)', gap: 8, marginBottom: 8 }}>
          <div />
          {DAY_FULL.map((_, d) => (
            <button key={d} type="button" onClick={() => { setView('jour'); setFocusDay(d); }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '8px 4px', borderRadius: 11, border: `1px solid ${isToday(d) ? '#BFD6B6' : 'transparent'}`, background: isToday(d) ? '#DCE8D4' : 'transparent', cursor: 'pointer', fontFamily: FF_SANS }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#8A8472', textTransform: 'capitalize' }}>{DAY_SHORT[d]}</span>
              <span style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 18, color: isToday(d) ? '#2F5A2A' : '#34322C' }}>{dates[d]}</span>
            </button>
          ))}
        </div>
        {SLOT_ORDER.map((slot) => {
          const sm = SLOT_META[slot];
          return (
            <div key={slot} style={{ display: 'grid', gridTemplateColumns: '74px repeat(7,1fr)', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px' }}><span style={{ width: 8, height: 8, borderRadius: 99, background: sm.dot }} /><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.02em', textTransform: 'uppercase', color: '#8A8472', lineHeight: 1.1 }}>{sm.label}</span></div>
              {DAY_FULL.map((_, d) => {
                if (isOff(d)) return <div key={d} style={{ borderRadius: 9, background: 'repeating-linear-gradient(135deg,#F4EEE2,#F4EEE2 7px,#EFE8DA 7px,#EFE8DA 14px)', border: '1px dashed #DDD4C2' }} />;
                const ms = mealsAt(d, slot);
                return (
                  <div key={d} style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0, padding: 2 }}>
                    {ms.map((m) => cellChip(m))}
                    {ms.length === 0 ? <button type="button" onClick={() => openAdd(d, slot)} style={{ minHeight: 30, border: '1.5px dashed #DAD2C2', background: 'transparent', borderRadius: 8, color: '#B0A99B', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic name="plus" size={14} color="#B0A99B" /></button> : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  function daySlotsBody(d: number) {
    if (isOff(d)) return offPlanCard(d);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SLOT_ORDER.map((slot) => {
          const sm = SLOT_META[slot];
          const ms = mealsAt(d, slot);
          return (
            <div key={slot} style={{ background: sm.tint, borderRadius: 14, padding: '14px 16px', border: `1px solid ${sm.bar}66` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: ms.length ? 11 : 9 }}>
                <span style={{ width: 30, height: 30, borderRadius: 9, background: '#FFFDFA', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${sm.bar}88` }}><Ic name={sm.icon} size={17} color={sm.dot} /></span>
                <span style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 17, color: '#34322C' }}>{sm.label}</span>
                <span style={{ flex: 1 }} />
                {ms.length ? <IconBtn name="plus" onClick={() => openAdd(d, slot)} size={32} title="Ajouter" bg="#FFFDFA" /> : null}
              </div>
              {ms.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{ms.map((m) => mealCard(m, true))}</div> : addSlotBtn(d, slot, { strong: true, label: `Ajouter un ${sm.label.toLowerCase()}`, h: 48 })}
            </div>
          );
        })}
      </div>
    );
  }

  function renderJour(d: number, embedded?: boolean) {
    const today = isToday(d);
    const nav = embedded ? null : (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: '#F1EBDD', border: '1px solid #E7E0D2', borderRadius: 12, padding: 3 }}>
          <IconBtn name="cl" onClick={() => setFocusDay((d + 6) % 7)} border="transparent" bg="transparent" size={32} />
          <div style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 17, padding: '0 10px', minWidth: 120, textAlign: 'center' }}>{DAY_FULL[d]} {dates[d]}</div>
          <IconBtn name="cr" onClick={() => setFocusDay((d + 1) % 7)} border="transparent" bg="transparent" size={32} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {DAY_SHORT.map((_, i) => (
            <button key={i} type="button" onClick={() => setFocusDay(i)} style={{ width: 34, height: 34, borderRadius: 99, border: `1px solid ${i === d ? '#BFD6B6' : '#E7E0D2'}`, background: i === d ? '#9CBE96' : isToday(i) ? '#DCE8D4' : '#FFFDFA', color: i === d ? '#fff' : '#6F6B61', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS }}>{dates[i]}</button>
          ))}
        </div>
      </div>
    );
    return (
      <div>
        {nav}
        <div style={{ background: '#FFFDFA', border: `1px solid ${today ? '#BFD6B6' : '#E7E0D2'}`, borderRadius: 18, padding: embedded ? '4px 2px 0' : '22px 22px', boxShadow: embedded ? 'none' : '0 1px 3px rgba(52,50,44,.05)' }}>
          {embedded ? null : dayHeader(d, { big: true, mb: 16 })}
          {daySlotsBody(d)}
        </div>
      </div>
    );
  }

  function renderEmpty() {
    return (
      <div style={{ background: '#FFFDFA', border: '1px solid #E7E0D2', borderRadius: 18, padding: '46px 30px 30px', textAlign: 'center', boxShadow: '0 1px 3px rgba(52,50,44,.05)' }}>
        <div style={{ width: 76, height: 76, borderRadius: 99, background: '#DCE8D4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><Ic name="bowl" size={38} color="#5E7E58" /></div>
        <div style={{ fontFamily: FF_HAND, fontSize: 30, color: '#5E7E58', lineHeight: 1 }}>Rien de prévu cette semaine — on s’y met ?</div>
        <h2 style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 24, margin: '8px 0 6px' }}>Semaine vide</h2>
        <p style={{ color: '#6F6B61', fontSize: 15, maxWidth: 420, margin: '0 auto 22px', lineHeight: 1.5 }}>Pas de feuille blanche : repars de la semaine dernière, ou laisse l’assistant te proposer des repas avec ce que tu as déjà.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn label={copyPending ? '…' : 'Copier la semaine précédente'} onClick={duplicatePrev} v="primary" icon="copy" disabled={copyPending} />
          <Btn label="Proposer avec mon stock" onClick={openAi} v="secondary" icon="sparkles" />
        </div>
      </div>
    );
  }

  // =========================================================================
  // MOBILE
  // =========================================================================
  function renderMobileSemaine() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {DAY_FULL.map((_, d) => {
          const today = isToday(d);
          const off = isOff(d);
          return (
            <button key={d} type="button" onClick={() => { setMobileMode('jour'); setFocusDay(d); }} style={{ textAlign: 'left', width: '100%', background: '#FFFDFA', border: `1px solid ${today ? '#BFD6B6' : '#E7E0D2'}`, borderRadius: 16, padding: '14px 16px', cursor: 'pointer', fontFamily: FF_SANS, boxShadow: today ? '0 2px 10px rgba(94,126,88,.08)' : '0 1px 2px rgba(52,50,44,.04)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: off ? 0 : 11 }}>
                <span style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 18, color: '#34322C' }}>{DAY_FULL[d]}</span>
                <span style={{ color: '#A89F8E', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>{dateLabels[d]}</span>
                {today ? <Pill label="Auj." bg="#DCE8D4" color="#3C5A36" fs={11} pad="1px 8px" /> : null}
                <span style={{ flex: 1 }} />
                <Ic name="cr" size={16} color="#C7BFAF" />
              </div>
              {off ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9A958A', fontSize: 13.5, fontWeight: 600, marginTop: 8 }}><Ic name="ban" size={16} color="#A89F8E" />Journée hors-plan</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {SLOT_ORDER.map((slot) => {
                    const sm = SLOT_META[slot];
                    const ms = mealsAt(d, slot);
                    const names = ms.map((m) => m.name).join(', ');
                    return (
                      <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: sm.dot, flex: '0 0 auto' }} />
                        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.01em', textTransform: 'uppercase', color: '#A39A88', width: 70, flex: '0 0 auto', whiteSpace: 'nowrap' }}>{sm.label}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: ms.length ? 600 : 500, color: ms.length ? '#34322C' : '#C2BBAD', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ms.length ? names : '—'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  function renderMobile() {
    const d = focusDay;
    const pills = (
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 2px 8px', margin: '0 -2px 4px' }}>
        {DAY_SHORT.map((s, i) => {
          const sel = i === d;
          return (
            <button key={i} type="button" onClick={() => setFocusDay(i)} style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 52, padding: '8px 0', borderRadius: 13, border: `1px solid ${sel ? '#2F8049' : '#E7E0D2'}`, background: sel ? '#2F8049' : '#FFFDFA', cursor: 'pointer', fontFamily: FF_SANS, position: 'relative' }}>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: sel ? '#D9EAD0' : '#8A8472', textTransform: 'capitalize' }}>{s}</span>
              <span style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 18, color: sel ? '#fff' : isToday(i) ? '#2F5A2A' : '#34322C' }}>{dates[i]}</span>
              {isOff(i) ? <span style={{ position: 'absolute', top: 5, right: 7, width: 6, height: 6, borderRadius: 99, background: sel ? '#E9DFA3' : '#C3B690' }} /> : null}
            </button>
          );
        })}
      </div>
    );
    const seg = (label: string, icon: string, val: 'jour' | 'semaine') => (
      <button key={val} type="button" onClick={() => setMobileMode(val)} style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 4px', border: 'none', background: mobileMode === val ? '#FFFDFA' : 'transparent', color: mobileMode === val ? '#34322C' : '#8A8472', borderRadius: 9, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS, boxShadow: mobileMode === val ? '0 1px 2px rgba(52,50,44,.10)' : 'none', minHeight: 38 }}>
        <Ic name={icon} size={15} color={mobileMode === val ? '#5E7E58' : '#9A958A'} />{label}
      </button>
    );
    let content: ReactNode;
    if (emptyWeek) content = renderEmpty();
    else if (mobileMode === 'semaine') content = renderMobileSemaine();
    else content = (
      <div>
        {pills}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, margin: '4px 2px 14px' }}>
          <span style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 22 }}>{DAY_FULL[d]}</span>
          {isToday(d) ? <Pill label="Aujourd'hui" bg="#DCE8D4" color="#3C5A36" fs={11.5} /> : null}
          <span style={{ flex: 1 }} />
          {dayMenu(d)}
        </div>
        {renderJour(d, true)}
      </div>
    );
    return (
      <div style={{ paddingBottom: emptyWeek ? 8 : 80 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: '#F1EBDD', border: '1px solid #E7E0D2', borderRadius: 11, padding: 3 }}>
            <IconBtn name="cl" onClick={() => goWeek(prevWeek)} border="transparent" bg="transparent" size={30} />
            <div style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 14.5, padding: '0 6px', whiteSpace: 'nowrap' }}>{weekLabel}</div>
            <IconBtn name="cr" onClick={() => goWeek(nextWeek)} border="transparent" bg="transparent" size={30} />
          </div>
          {todayIndex < 0 ? <Btn label="Auj." onClick={() => goWeek(thisWeek)} v="soft" pad="8px 11px" minH={38} fs={13} /> : <Btn label={copyPending ? '…' : 'Dupliquer'} onClick={duplicatePrev} v="soft" pad="8px 11px" minH={38} fs={13} icon="copy" is={14} disabled={copyPending} />}
        </div>
        <div style={{ display: 'flex', gap: 2, background: '#F1EBDD', border: '1px solid #E7E0D2', borderRadius: 11, padding: 3, marginBottom: 12 }}>{seg('Jour', 'sun', 'jour')}{seg('Semaine', 'list', 'semaine')}</div>
        <div style={{ display: 'flex', gap: 9, marginBottom: 14, overflowX: 'auto', padding: '0 0 2px' }}>
          <button type="button" onClick={openAi} style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 15px', borderRadius: 11, border: '1px solid #C9D9C1', background: '#E6F0DF', color: '#2F8049', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS }}><Ic name="sparkles" size={15} color="#2F8049" />Proposer des repas avec mon stock</button>
        </div>
        {content}
      </div>
    );
  }

  function mobileAddBar() {
    const d = mobileMode === 'jour' ? focusDay : todayIndex >= 0 ? todayIndex : 0;
    return (
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 25, padding: '10px 16px calc(12px + env(safe-area-inset-bottom))', background: 'linear-gradient(to top,#FBF7EF 72%,rgba(251,247,239,0))', display: 'flex' }}>
        <Btn label="Ajouter un repas" onClick={() => openAdd(d, firstEmptySlot(d))} v="primary" icon="plus" full minH={50} fs={15.5} />
      </div>
    );
  }

  // =========================================================================
  // OVERLAYS
  // =========================================================================
  function overlayHeader(title: string, sub?: string, onClose?: () => void) {
    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '18px 20px 14px', borderBottom: '1px solid #ECE5D7', flex: '0 0 auto' }}>
        <div>
          <div style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 20 }}>{title}</div>
          {sub ? <div style={{ color: '#9A958A', fontSize: 13.5, marginTop: 2 }}>{sub}</div> : null}
        </div>
        <IconBtn name="x" onClick={onClose || (() => setOverlay(null))} size={36} />
      </div>
    );
  }

  function addPanel(o: Extract<Overlay, { type: 'add' }>) {
    const sm = SLOT_META[o.slot];
    if (o.step === 'search') {
      // Chips dérivées des VRAIS tags des recettes du foyer (max 6 + « Tout »).
      const tagCounts = new Map<string, number>();
      for (const r of recipes) for (const t of r.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
      const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([t]) => t);
      const filters = ['Tout', ...topTags];
      const q = search.toLowerCase();
      const list = recipes.filter((r) => (filter === 'Tout' || r.tags.includes(filter)) && (!q || r.name.toLowerCase().includes(q)));
      return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
          {overlayHeader('Ajouter un repas', `${sm.label} · ${DAY_FULL[o.d]} ${dates[o.d]}`)}
          <div style={{ padding: '14px 20px 10px', flex: '0 0 auto' }}>
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <div style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }}><Ic name="search" size={18} color="#A89F8E" /></div>
              {/* Mobile : pas d'autofocus → le clavier ne masque pas la liste de recettes
                  (on voit d'abord les recettes + « Créer une recette »). Desktop : focus direct. */}
              <input autoFocus={!isMobile} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une recette…" style={{ width: '100%', padding: '13px 14px 13px 42px', borderRadius: 12, border: '1px solid #E0D8C8', background: '#FFFDFA', fontSize: 15, fontFamily: FF_SANS, color: '#34322C', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {filters.map((f) => (
                <button key={f} type="button" onClick={() => setFilter(f)} style={{ padding: '6px 13px', borderRadius: 999, border: `1px solid ${filter === f ? '#9CBE96' : '#E0D8C8'}`, background: filter === f ? '#DCE8D4' : '#FFFDFA', color: filter === f ? '#3C5A36' : '#6F6B61', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS }}>{f}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 14px 16px' }}>
            <button type="button" onClick={() => createRecipeFor(o.d, o.slot)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 12px', borderRadius: 13, border: '1px dashed #C9D9C1', background: '#EFF4EB', cursor: 'pointer', marginBottom: 10, fontFamily: FF_SANS, textAlign: 'left' }}>
              <div style={{ width: 46, height: 46, borderRadius: 11, background: '#FFFDFA', border: '1px solid #D7E2CF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic name="plus" size={20} color="#5E7E58" /></div>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15, color: '#34322C' }}>Créer une nouvelle recette</div><div style={{ color: '#6F6B61', fontSize: 13, marginTop: 1 }}>Réutilisable et traçable (nutrition, courses) — un nom suffit, les ingrédients sont optionnels.</div></div>
              <Ic name="cr" size={18} color="#9A958A" />
            </button>
            {list.map((r) => (
              <button key={r.id} type="button" onClick={() => chooseRecipe(r)} style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%', padding: '10px 12px', borderRadius: 13, border: '1px solid #ECE5D7', background: '#FFFDFA', cursor: 'pointer', marginBottom: 9, fontFamily: FF_SANS, textAlign: 'left' }} onMouseEnter={(e) => (e.currentTarget.style.background = '#F7F2E9')} onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFDFA')}>
                <div style={{ width: 54, height: 54, borderRadius: 12, background: '#E2ECDB', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 22, color: '#6F6B61', overflow: 'hidden' }}>
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- URL signée éphémère
                    <img src={r.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : r.name[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#34322C', lineHeight: 1.25 }}>{r.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                    {r.time > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#9A958A', fontSize: 12.5 }}><Ic name="clock" size={13} color="#B0A99B" />{r.time} min</span> : null}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#9A958A', fontSize: 12.5 }}><Ic name="users" size={13} color="#B0A99B" />{r.serves} pers.</span>
                    {r.tags.map((t) => <Pill key={t} label={t} bg="#F1ECDE" color="#8A7F68" fs={11.5} pad="2px 8px" />)}
                  </div>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#2F8049', fontSize: 13.5, fontWeight: 700, flex: '0 0 auto' }}>Choisir<Ic name="cr" size={16} color="#2F8049" /></span>
              </button>
            ))}
            {list.length === 0 ? <div style={{ textAlign: 'center', color: '#9A958A', padding: '30px 0', fontSize: 14 }}>Aucune recette ne correspond.</div> : null}
          </div>
        </div>
      );
    }
    // config step
    const r = o.recipe;
    const libre = r === 'libre';
    const rec = libre ? null : (r as RecipeOption);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 18px 14px', borderBottom: '1px solid #ECE5D7' }}>
          <IconBtn name="cl" onClick={() => setOverlay({ ...o, step: 'search' })} size={36} />
          <div style={{ flex: 1 }}><div style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 18 }}>Configurer le repas</div><div style={{ color: '#9A958A', fontSize: 13, marginTop: 1 }}>{sm.label} · {DAY_FULL[o.d]}</div></div>
          <IconBtn name="x" onClick={() => setOverlay(null)} size={36} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px', borderRadius: 14, background: '#FFFDFA', border: '1px solid #ECE5D7', marginBottom: 20 }}>
            <div style={{ width: 54, height: 54, borderRadius: 12, background: libre ? '#EFF4EB' : '#E2ECDB', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 22, color: '#6F6B61', overflow: 'hidden' }}>
              {libre ? <Ic name="pencil" size={22} color="#5E7E58" /> : rec?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL signée éphémère
                <img src={rec.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : rec?.name[0]}
            </div>
            <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 16 }}>{libre ? 'Repas libre' : rec?.name}</div>{!libre && rec && rec.time > 0 ? <div style={{ display: 'flex', gap: 8, marginTop: 4, color: '#9A958A', fontSize: 12.5 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Ic name="clock" size={13} color="#B0A99B" />{rec.time} min</span></div> : null}</div>
          </div>
          {libre ? (
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Nom du repas</label>
              <input autoFocus placeholder="ex. Restes du frigo" value={draftName} onChange={(e) => setDraftName(e.target.value)} style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #E0D8C8', background: '#FFFDFA', fontSize: 15, fontFamily: FF_SANS, outline: 'none' }} />
            </div>
          ) : null}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 14, marginBottom: 9 }}>Portions</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <IconBtn name="minus" onClick={() => setDraftPortions(Math.max(1, draftPortions - 1))} size={44} r={12} border="#D7CDB9" />
              <div style={{ minWidth: 54, textAlign: 'center' }}><div style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 28, lineHeight: 1 }}>{draftPortions}</div><div style={{ fontSize: 12, color: '#9A958A', marginTop: 2 }}>pers.</div></div>
              <IconBtn name="plus" onClick={() => setDraftPortions(Math.min(12, draftPortions + 1))} size={44} r={12} border="#D7CDB9" />
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', gap: 6 }}>{[1, 2, 4].map((n) => <button key={n} type="button" onClick={() => setDraftPortions(n)} style={{ padding: '7px 13px', borderRadius: 10, border: `1px solid ${draftPortions === n ? '#9CBE96' : '#E0D8C8'}`, background: draftPortions === n ? '#DCE8D4' : '#FFFDFA', color: '#3C5A36', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: FF_SANS }}>{n}</button>)}</div>
            </div>
          </div>
          {!libre ? (
            <button type="button" onClick={() => setDraftLeftover(!draftLeftover)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '13px 14px', borderRadius: 14, background: '#FFFDFA', border: '1px solid #ECE5D7', cursor: 'pointer', fontFamily: FF_SANS, textAlign: 'left' }}>
              <span style={{ width: 32, height: 32, borderRadius: 9, background: '#E6F0DF', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Ic name="repeat" size={17} color="#2F8049" /></span>
              <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>Produit un reste</div><div style={{ color: '#9A958A', fontSize: 12.5, marginTop: 1 }}>Un reste replanifiable apparaîtra sur un autre créneau.</div></div>
              <span style={{ width: 46, height: 27, borderRadius: 99, background: draftLeftover ? '#45A35E' : '#DDD5C5', position: 'relative', flex: '0 0 auto', transition: 'background .15s' }}><span style={{ position: 'absolute', top: 3, left: draftLeftover ? 22 : 3, width: 21, height: 21, borderRadius: 99, background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} /></span>
            </button>
          ) : null}
          {profiles.length > 1 ? (
            <>
              <div style={{ height: 12 }} />
              <div style={{ padding: '13px 14px', borderRadius: 14, background: '#FFFDFA', border: '1px solid #ECE5D7' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: draftIndividual ? 11 : 0 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 9, background: '#F3E2D7', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Ic name="user" size={17} color="#9A5638" /></span>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>Repas individuel</div><div style={{ color: '#9A958A', fontSize: 12.5, marginTop: 1 }}>Pour une seule personne du foyer</div></div>
                  <button type="button" onClick={() => setDraftIndividual(draftIndividual ? '' : profiles[0].id)} style={{ width: 46, height: 27, borderRadius: 99, border: 'none', background: draftIndividual ? '#45A35E' : '#DDD5C5', position: 'relative', cursor: 'pointer', flex: '0 0 auto', transition: 'background .15s' }}><span style={{ position: 'absolute', top: 3, left: draftIndividual ? 22 : 3, width: 21, height: 21, borderRadius: 99, background: '#fff', transition: 'left .15s', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} /></button>
                </div>
                {draftIndividual ? <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>{profiles.map((m) => <button key={m.id} type="button" onClick={() => setDraftIndividual(m.id)} style={{ padding: '7px 13px', borderRadius: 999, border: `1px solid ${draftIndividual === m.id ? '#D9A98C' : '#E0D8C8'}`, background: draftIndividual === m.id ? '#F3E2D7' : '#FFFDFA', color: draftIndividual === m.id ? '#9A5638' : '#6F6B61', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: FF_SANS }}>{m.name}</button>)}</div> : null}
              </div>
            </>
          ) : null}
        </div>
        <div style={{ flex: '0 0 auto', padding: '14px 20px', borderTop: '1px solid #ECE5D7', display: 'flex', gap: 10 }}>
          <Btn label="Annuler" onClick={() => setOverlay(null)} v="ghost" />
          <div style={{ flex: 1 }} />
          <Btn label="Ajouter au planning" onClick={confirmAdd} v="primary" icon="check" />
        </div>
      </div>
    );
  }

  function ecartPanel(o: Extract<Overlay, { type: 'ecart' }>) {
    const opt = (icon: string, bg: string, color: string, title: string, sub: string, onClick: () => void) => (
      <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 13, width: '100%', padding: '14px', borderRadius: 14, background: '#FFFDFA', border: '1px solid #ECE5D7', cursor: 'pointer', marginBottom: 10, fontFamily: FF_SANS, textAlign: 'left' }} onMouseEnter={(e) => (e.currentTarget.style.background = '#F7F2E9')} onMouseLeave={(e) => (e.currentTarget.style.background = '#FFFDFA')}>
        <span style={{ width: 40, height: 40, borderRadius: 11, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Ic name={icon} size={19} color={color} /></span>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div><div style={{ color: '#9A958A', fontSize: 13, marginTop: 1 }}>{sub}</div></div>
        <Ic name="cr" size={17} color="#C2BBAD" />
      </button>
    );
    return (
      <div>
        {overlayHeader('Signaler un écart', `« ${o.name} » — tu n’interviens que si ça change.`)}
        <div style={{ padding: '16px 20px 20px' }}>
          {opt('ban', '#FBE4DF', '#C23E2E', 'J’ai sauté ce repas', 'Il sera barré et retiré des courses.', () => setStatus(o.mealId, 'skipped'))}
          {opt('pencil', '#FCEFD9', '#B5641F', 'J’ai mangé autre chose', 'Garde le créneau, note ce que c’était.', () => { setDiffText(''); setOverlay({ ...o, step: 'diff' }); })}
          {o.step === 'diff' ? (
            <div style={{ display: 'flex', gap: 8, marginTop: -2, marginBottom: 6 }}>
              <input autoFocus placeholder="ex. Pizza livrée" value={diffText} onChange={(e) => setDiffText(e.target.value)} style={{ flex: 1, padding: '11px 13px', borderRadius: 11, border: '1px solid #E0D8C8', fontSize: 14.5, fontFamily: FF_SANS, outline: 'none' }} />
              <Btn label="OK" onClick={() => setStatus(o.mealId, 'different', diffText || 'Autre chose')} v="primary" pad="11px 16px" />
            </div>
          ) : null}
          <div style={{ height: 6 }} />
          {opt('cal', '#EDEAE0', '#6F6B61', 'Toute la journée était hors-plan', 'Restau, invités… rien à suivre ce jour-là.', () => { toggleOff(o.d); setOverlay(null); })}
        </div>
      </div>
    );
  }

  function replanPanel(o: Extract<Overlay, { type: 'replan' }>) {
    return (
      <div>
        {overlayHeader('Replanifier un reste', `Reste de « ${o.recipeName} »`)}
        <div style={{ padding: '16px 20px 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px', borderRadius: 13, background: '#E6F0DF', border: '1px solid #C9D9C1', marginBottom: 18 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: '#FFFDFA', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Ic name="repeat" size={19} color="#2F8049" /></span>
            <div style={{ fontSize: 13.5, color: '#3C5A36', fontWeight: 600 }}>Recase ce qui reste sur un autre créneau — zéro gaspillage.</div>
          </div>
          <div style={{ display: 'flex', gap: 2, background: '#F1EBDD', border: '1px solid #E7E0D2', borderRadius: 11, padding: 3, marginBottom: 14 }}>
            {(['telquel', 'plat'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setReplanMode(m)} style={{ flex: 1, padding: '9px 4px', border: 'none', background: replanMode === m ? '#FFFDFA' : 'transparent', color: replanMode === m ? '#34322C' : '#8A8472', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: FF_SANS, boxShadow: replanMode === m ? '0 1px 2px rgba(52,50,44,.10)' : 'none', minHeight: 38 }}>{m === 'telquel' ? 'Le manger tel quel' : 'En faire un plat'}</button>
            ))}
          </div>
          {replanMode === 'plat' ? (
            <div style={{ marginBottom: 16 }}>
              <input value={replanName} onChange={(e) => setReplanName(e.target.value)} placeholder="Nom du plat (ex. Sauté de riz aux restes)" style={{ width: '100%', padding: '11px 13px', borderRadius: 11, border: '1px solid #E0D8C8', fontSize: 14, fontFamily: FF_SANS, outline: 'none', marginBottom: 8, background: '#FFFDFA' }} />
              <input value={replanExtra} onChange={(e) => setReplanExtra(e.target.value)} placeholder="À compléter aux courses (optionnel, ex. riz)" style={{ width: '100%', padding: '11px 13px', borderRadius: 11, border: '1px solid #E0D8C8', fontSize: 14, fontFamily: FF_SANS, outline: 'none', background: '#FFFDFA' }} />
              <div style={{ marginTop: 6, fontSize: 12, color: '#9A958A' }}>La part « reste » ne génère aucun achat ; seul le complément part dans les courses.</div>
            </div>
          ) : null}
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 9 }}>Quel jour ?</div>
          <div style={{ display: 'flex', gap: 7, marginBottom: 18, flexWrap: 'wrap' }}>
            {DAY_SHORT.map((s, i) => (
              <button key={i} type="button" onClick={() => setReplanSel({ ...replanSel, d: i })} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, width: 46, padding: '8px 0', borderRadius: 11, border: `1px solid ${replanSel.d === i ? '#9CBE96' : '#E0D8C8'}`, background: replanSel.d === i ? '#DCE8D4' : '#FFFDFA', cursor: 'pointer', fontFamily: FF_SANS }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#8A8472', textTransform: 'capitalize' }}>{s}</span>
                <span style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 16, color: replanSel.d === i ? '#2F5A2A' : '#34322C' }}>{dates[i]}</span>
              </button>
            ))}
          </div>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 9 }}>Quel créneau ?</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            {SLOT_ORDER.map((s) => { const m = SLOT_META[s]; const a = replanSel.slot === s; return (
              <button key={s} type="button" onClick={() => setReplanSel({ ...replanSel, slot: s })} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 13px', borderRadius: 11, border: `1px solid ${a ? m.bar : '#E0D8C8'}`, background: a ? m.tint : '#FFFDFA', color: '#34322C', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', fontFamily: FF_SANS }}><span style={{ width: 9, height: 9, borderRadius: 99, background: m.dot }} />{m.label}</button>
            ); })}
          </div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid #ECE5D7', display: 'flex', gap: 10, marginTop: 14 }}>
          <Btn label="Annuler" onClick={() => setOverlay(null)} v="ghost" /><div style={{ flex: 1 }} />
          <Btn label="Replanifier ici" onClick={() => doReplan(o.sourceMealId, replanSel.d, replanSel.slot)} v="primary" icon="replan" is={16} />
        </div>
      </div>
    );
  }

  function aiPanel() {
    return (
      <div>
        {overlayHeader('Proposer des repas avec mon stock', 'Idées à partir de ce que tu as déjà.')}
        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 12, background: '#E6F0DF', border: '1px solid #C9D9C1', marginBottom: 16, color: '#3C5A36', fontSize: 13.5, fontWeight: 600 }}><Ic name="sparkles" size={17} color="#2F8049" />Les recettes les plus réalisables avec ton stock actuel.</div>
          {aiList === null ? (
            <div style={{ textAlign: 'center', color: '#9A958A', padding: '24px 0', fontSize: 14 }}>Analyse de ton stock…</div>
          ) : aiList.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#9A958A', padding: '24px 0', fontSize: 14 }}>Garnis ton stock et lie les ingrédients de tes recettes au catalogue pour des suggestions.</div>
          ) : aiList.map((r) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 12px', borderRadius: 13, border: '1px solid #ECE5D7', background: '#FFFDFA', marginBottom: 9 }}>
              <div style={{ width: 48, height: 48, borderRadius: 11, background: '#E2ECDB', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 20, color: '#6F6B61', overflow: 'hidden' }}>
                {r.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL signée éphémère
                  <img src={r.imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : r.name[0]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 14.5 }}>{r.name}</div><div style={{ marginTop: 3 }}><Pill label={`${r.score}% en stock`} bg="#DCE8D4" color="#3C5A36" fs={11} pad="1px 7px" /></div></div>
              <Btn label="Ajouter" onClick={() => aiAdd(r)} v="soft" pad="8px 13px" minH={38} fs={13} icon="plus" is={15} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderOverlay() {
    if (!overlay && !menu) return null;
    const menuCatcher = menu ? <div onClick={() => setMenu(null)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} /> : null;
    if (!overlay) return menuCatcher;
    let panel: ReactNode = null;
    if (overlay.type === 'add') panel = addPanel(overlay);
    else if (overlay.type === 'ecart') panel = ecartPanel(overlay);
    else if (overlay.type === 'replan') panel = replanPanel(overlay);
    else if (overlay.type === 'ai') panel = aiPanel();
    const wide = overlay.type === 'ai' ? 560 : 580;
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}>
        <div onClick={() => setOverlay(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(52,50,44,.32)', animation: 'mealing-fade .2s ease both' }} />
        <div style={{ position: 'relative', zIndex: 1, width: isMobile ? '100%' : wide, maxWidth: '100%', maxHeight: isMobile ? '92vh' : '88vh', background: '#FBF7EF', borderRadius: isMobile ? '22px 22px 0 0' : 20, boxShadow: '0 20px 50px rgba(52,50,44,.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>{panel}</div>
      </div>
    );
  }

  // =========================================================================
  function renderBoard() {
    if (isMobile) return <>{renderMobile()}{emptyWeek ? null : mobileAddBar()}</>;
    if (emptyWeek) return renderEmpty();
    if (view === 'agenda') return renderAgenda();
    if (view === 'grid') return renderGrid();
    return renderJour(focusDay, false);
  }

  return (
    <div style={{ color: '#34322C', fontFamily: FF_SANS }}>
      <style>{`@keyframes mealing-fade{from{opacity:0}to{opacity:1}}@keyframes mealing-pop{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}`}</style>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
        <div style={{ minWidth: 240 }}>
          <div style={{ fontFamily: FF_HAND, color: '#5E7E58', fontSize: 24, lineHeight: 1, marginBottom: 2 }}>Qu&apos;est-ce qu&apos;on mange&nbsp;?</div>
          <h1 style={{ fontFamily: FF_DISPLAY, fontWeight: 600, fontSize: 40, letterSpacing: '-0.01em', margin: '2px 0 8px', lineHeight: 1 }}>Planning</h1>
          <p style={{ maxWidth: 540, color: '#6F6B61', fontSize: 15, lineHeight: 1.5, margin: 0 }}>Planifie ta semaine sans prise de tête&nbsp;: un repas prévu est mangé tel quel, tu n&apos;interviens que si ça change.</p>
        </div>
        {isMobile ? null : weekControls()}
      </div>
      {isMobile ? null : toolbar()}
      {renderBoard()}
      {renderOverlay()}
      {flash ? (
        <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 70, background: '#34322C', color: '#FBF7EF', padding: '11px 18px', borderRadius: 999, fontSize: 13.5, fontWeight: 600, boxShadow: '0 10px 28px rgba(52,50,44,.28)', maxWidth: '90vw' }}>{flash}</div>
      ) : null}
    </div>
  );
}
