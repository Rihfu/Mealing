'use client';

import { useRef, useState, useTransition } from 'react';
import { UNIT_OPTIONS } from '@/lib/units';
import type { DictatedItem } from '@/lib/ai/parse-stock-dictation';

/** Article ajouté en lot par dictée (cible : stock OU liste de courses). */
export interface BulkVoiceItem {
  label: string;
  quantity: number | null;
  unit: string | null;
  location: string | null;
}

export interface VoiceCaptureTexts {
  trigger: string; // libellé du bouton (variant inline)
  hero?: string; // libellé du bouton (variant hero) — défaut : `trigger`
  title: string; // titre de la modale
  intro: string; // phrase d'explication
}

type Phase = 'idle' | 'recording' | 'transcribing' | 'review' | 'done';

interface ReviewRow {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  location: string;
}

function mmss(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function extFromMime(m: string): string {
  if (m.includes('webm')) return 'webm';
  if (m.includes('mp4')) return 'mp4';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('mpeg')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  return 'webm';
}

function MicIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0M12 19v3" />
    </svg>
  );
}

/**
 * Saisie par DICTÉE (speech-to-text), réutilisable Stock ↔ Courses : l'utilisateur
 * énonce sa liste, on transcrit (gpt-4o-transcribe via l'action `transcribe`), on
 * découpe en articles, il VALIDE/CORRIGE, puis ajout en lot (`onAdd`). Le sélecteur de
 * lieu n'apparaît que si `withLocation` (Stock = oui, Courses = non). Garde-fou n°3 :
 * la voix donne nature + quantité ; la nutrition vient toujours d'USDA/OFF.
 */
export function VoiceCapture({
  transcribeChunk,
  parse,
  onAdd,
  refresh,
  texts,
  withLocation = false,
  locationOptions = [],
  variant = 'inline',
}: {
  /** Transcrit UN segment audio → texte (appelé une fois par segment). */
  transcribeChunk: (formData: FormData) => Promise<{ text: string }>;
  /** Découpe le texte concaténé en articles (une seule fois, à la fin). */
  parse: (text: string) => Promise<{ items: DictatedItem[] }>;
  onAdd: (items: BulkVoiceItem[]) => Promise<{ added: number }>;
  refresh: () => void | Promise<void>;
  texts: VoiceCaptureTexts;
  withLocation?: boolean;
  locationOptions?: { key: string; label: string }[];
  variant?: 'inline' | 'hero';
}) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [defaultLocation, setDefaultLocation] = useState('');
  const [addedCount, setAddedCount] = useState(0);
  const [recSeconds, setRecSeconds] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [submitting, start] = useTransition();

  // Enregistrement SEGMENTÉ : on découpe en segments de SEGMENT_MS (recorder relancé), pour
  // qu'une dictée longue (plusieurs minutes) ne parte pas en une seule requête géante
  // (qui dépasserait la limite de taille des Server Actions + le timeout serverless).
  const SEGMENT_MS = 60_000;
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const segmentsRef = useRef<Blob[]>([]);
  const mimeRef = useRef<string>('audio/webm');
  const finishingRef = useRef(false);
  const rotateRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearTimers() {
    if (rotateRef.current) clearInterval(rotateRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    rotateRef.current = null;
    tickRef.current = null;
  }
  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function close() {
    clearTimers();
    finishingRef.current = true;
    if (recRef.current && recRef.current.state !== 'inactive') {
      recRef.current.onstop = null;
      recRef.current.stop();
    }
    recRef.current = null;
    stopStream();
    setOpen(false);
    setPhase('idle');
    setError(null);
    setRows([]);
    setDefaultLocation('');
    setAddedCount(0);
    setRecSeconds(0);
    setProgress(null);
  }

  /** Démarre un segment (recorder dédié) ; au stop, l'empile et relance le suivant
   *  tant qu'on n'a pas fini — sinon lance la transcription de tous les segments. */
  function startSegment() {
    const stream = streamRef.current;
    if (!stream) return;
    const rec = new MediaRecorder(stream);
    mimeRef.current = rec.mimeType || mimeRef.current;
    const buf: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) buf.push(e.data);
    };
    rec.onstop = () => {
      const type = rec.mimeType || 'audio/webm';
      mimeRef.current = type;
      if (buf.length) segmentsRef.current.push(new Blob(buf, { type }));
      if (finishingRef.current) {
        stopStream();
        void runTranscription();
      } else {
        startSegment();
      }
    };
    recRef.current = rec;
    rec.start();
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      segmentsRef.current = [];
      finishingRef.current = false;
      setRecSeconds(0);
      startSegment();
      setPhase('recording');
      tickRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
      rotateRef.current = setInterval(() => recRef.current?.stop(), SEGMENT_MS);
    } catch {
      setError("Micro indisponible — autorise l'accès au microphone pour dicter ta liste.");
      setPhase('idle');
    }
  }

  function stopRecording() {
    clearTimers();
    finishingRef.current = true;
    setProgress(null);
    setPhase('transcribing');
    recRef.current?.stop(); // l'onstop du segment courant lancera runTranscription
    recRef.current = null;
  }

  /** Transcrit chaque segment l'un après l'autre, concatène, puis découpe en articles. */
  async function runTranscription() {
    const segs = segmentsRef.current;
    if (segs.length === 0) {
      setError("Je n'ai rien entendu — réessaie.");
      setPhase('idle');
      return;
    }
    try {
      const ext = extFromMime(mimeRef.current);
      let full = '';
      for (let i = 0; i < segs.length; i++) {
        setProgress({ done: i, total: segs.length });
        const fd = new FormData();
        fd.append('audio', new File([segs[i]], `seg${i}.${ext}`, { type: mimeRef.current }));
        const { text } = await transcribeChunk(fd);
        const t = (text ?? '').trim();
        if (t) full += (full ? ' ' : '') + t;
      }
      setProgress({ done: segs.length, total: segs.length });
      if (!full.trim()) {
        setError("Je n'ai rien compris — réessaie en parlant distinctement.");
        setPhase('idle');
        return;
      }
      const { items } = await parse(full);
      if (items.length === 0) {
        setError("Je n'ai rien compris — réessaie en parlant distinctement.");
        setPhase('idle');
        return;
      }
      setRows(
        items.map((it, i) => ({
          id: `r${i}`,
          name: it.name,
          quantity: it.quantity != null ? String(it.quantity) : '',
          unit: it.unit ?? '',
          location: withLocation ? (it.location ?? '') : '',
        })),
      );
      setPhase('review');
    } catch {
      setError('La transcription a échoué — réessaie dans un instant.');
      setPhase('idle');
    } finally {
      setProgress(null);
    }
  }

  function updateRow(id: string, patch: Partial<ReviewRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }
  function addRow() {
    setRows((rs) => [...rs, { id: `r${Date.now()}`, name: '', quantity: '', unit: '', location: '' }]);
  }

  function submit() {
    const payload: BulkVoiceItem[] = rows
      .map((r) => {
        const q = r.quantity.trim() !== '' ? Number(r.quantity.replace(',', '.')) : NaN;
        return {
          label: r.name.trim(),
          quantity: !Number.isNaN(q) && q > 0 ? q : null,
          unit: r.unit || null,
          location: withLocation ? r.location || defaultLocation || null : null,
        };
      })
      .filter((r) => r.label.length > 0);
    if (payload.length === 0) return;
    start(async () => {
      const { added } = await onAdd(payload);
      await refresh();
      setAddedCount(added);
      setPhase('done');
    });
  }

  const trigger =
    variant === 'hero' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-3 rounded-2xl border border-green-strong bg-sage-tint px-4 py-4 font-display text-base font-semibold text-green-strong"
      >
        <MicIcon size={22} />
        {texts.hero ?? texts.trigger}
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary mt-2 flex w-full items-center justify-center gap-2 py-2.5 text-sm"
      >
        <MicIcon size={18} />
        {texts.trigger}
      </button>
    );

  return (
    <>
      {trigger}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          style={{ background: 'rgba(40,38,34,0.32)' }}
          onClick={close}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border border-line bg-surface p-5 shadow-soft sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold">{texts.title}</h3>
              <button type="button" onClick={close} className="text-ink-soft hover:text-ink" aria-label="Fermer">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {(phase === 'idle' || phase === 'recording') && (
              <div className="flex flex-col items-center gap-4 py-8">
                <p className="text-center text-sm text-ink-soft">{texts.intro}</p>
                {phase === 'recording' ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-red text-white shadow-soft"
                    aria-label="Arrêter l'enregistrement"
                  >
                    <span className="h-6 w-6 rounded-sm bg-white" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="flex h-20 w-20 items-center justify-center rounded-full bg-green-strong text-white shadow-soft"
                    aria-label="Démarrer l'enregistrement"
                  >
                    <MicIcon size={30} />
                  </button>
                )}
                <span className="text-xs font-semibold text-ink-soft">
                  {phase === 'recording' ? `Enregistrement ${mmss(recSeconds)} — appuie pour arrêter` : 'Appuie pour parler'}
                </span>
                {phase === 'recording' && (
                  <span className="text-center text-[11px] text-ink-soft/80">
                    Tu peux énumérer autant que tu veux — c’est découpé automatiquement.
                  </span>
                )}
                {error && <p className="text-center text-sm text-clay">{error}</p>}
              </div>
            )}

            {phase === 'transcribing' && (
              <div className="flex flex-col items-center gap-3 py-12">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-green-strong" />
                <p className="text-sm text-ink-soft">
                  Transcription en cours…
                  {progress && progress.total > 1 ? ` (${Math.min(progress.done + 1, progress.total)}/${progress.total})` : ''}
                </p>
              </div>
            )}

            {phase === 'review' && (
              <>
                <p className="mt-1 text-xs text-ink-soft">Vérifie et corrige avant d&apos;ajouter.</p>
                {withLocation && (
                  <div className="mt-2 flex items-center gap-2 text-sm">
                    <label htmlFor="default-loc" className="shrink-0 text-xs font-semibold text-ink-soft">
                      Lieu par défaut
                    </label>
                    <select
                      id="default-loc"
                      value={defaultLocation}
                      onChange={(e) => setDefaultLocation(e.target.value)}
                      className="field-input flex-1 px-2 py-1 text-sm"
                    >
                      <option value="">— aucun</option>
                      {locationOptions.map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <ul className="my-3 flex-1 divide-y divide-line overflow-auto rounded-xl border border-line">
                  {rows.map((r) => (
                    <li key={r.id} className="flex flex-col gap-2 p-2.5">
                      <div className="flex items-center gap-2">
                        <input
                          value={r.name}
                          onChange={(e) => updateRow(r.id, { name: e.target.value })}
                          placeholder="Aliment"
                          aria-label="Aliment"
                          className="field-input min-w-0 flex-1 px-2 py-1 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          className="shrink-0 text-ink-soft hover:text-clay"
                          aria-label={`Retirer ${r.name || 'cet article'}`}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M18 6 6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={r.quantity}
                          onChange={(e) => updateRow(r.id, { quantity: e.target.value })}
                          type="number"
                          step="any"
                          inputMode="decimal"
                          placeholder="Qté"
                          aria-label="Quantité"
                          className="field-input w-16 px-2 py-1 text-sm"
                        />
                        <select
                          value={r.unit}
                          onChange={(e) => updateRow(r.id, { unit: e.target.value })}
                          aria-label="Unité"
                          className="field-input w-24 px-2 py-1 text-sm"
                        >
                          <option value="">—</option>
                          {UNIT_OPTIONS.map((u) => (
                            <option key={u.code} value={u.code}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                        {withLocation && (
                          <select
                            value={r.location}
                            onChange={(e) => updateRow(r.id, { location: e.target.value })}
                            aria-label="Lieu"
                            className="field-input ml-auto w-32 px-2 py-1 text-sm"
                          >
                            <option value="">Lieu : défaut</option>
                            {locationOptions.map((l) => (
                              <option key={l.key} value={l.key}>
                                {l.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>

                <button type="button" onClick={addRow} className="mb-3 self-start text-sm font-semibold text-green-strong">
                  + Ajouter une ligne
                </button>

                <div className="flex gap-2">
                  <button type="button" onClick={submit} disabled={submitting} className="btn-primary flex-1 py-2.5 disabled:opacity-60">
                    {submitting ? 'Ajout…' : `Ajouter (${rows.filter((r) => r.name.trim()).length})`}
                  </button>
                  <button type="button" onClick={() => setPhase('idle')} disabled={submitting} className="btn-secondary py-2.5">
                    Recommencer
                  </button>
                </div>
              </>
            )}

            {phase === 'done' && (
              <div className="flex flex-col items-center gap-4 py-10">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sage-tint text-green-strong">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
                <p className="text-center text-sm font-semibold">
                  {addedCount} article{addedCount > 1 ? 's' : ''} ajouté{addedCount > 1 ? 's' : ''}.
                </p>
                <button type="button" onClick={close} className="btn-primary px-6 py-2.5">
                  Terminé
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
