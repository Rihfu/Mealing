'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { resizeImageToBlob } from '@/lib/image-resize';
// Import direct du module (pas du barrel @/lib/core) pour ne PAS tirer de code
// server-only (env.server, fournisseurs IA…) dans le bundle client.
import { recipeImagePath, RECIPE_IMAGE_BUCKET } from '@/lib/core/recipe-image';
import { setRecipeImageAction, removeRecipeImageAction } from '../actions';

/**
 * Gestion de la photo d'une recette : importer (galerie/fichiers) ou prendre en
 * photo (caméra mobile via `capture`). Redimensionnement client avant upload vers
 * le bucket privé, puis enregistrement de la référence (action serveur). Modifiable
 * par tout membre du foyer (RLS Storage + table scopées foyer).
 */
export function RecipeImageManager({
  recipeId,
  householdId,
  hasImage,
}: {
  recipeId: string;
  householdId: string;
  hasImage: boolean;
}) {
  const router = useRouter();
  const importRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const blob = await resizeImageToBlob(file);
      const path = recipeImagePath(householdId, recipeId);
      const supabase = createSupabaseBrowserClient();
      const { error: upErr } = await supabase.storage
        .from(RECIPE_IMAGE_BUCKET)
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });
      if (upErr) throw new Error(upErr.message);
      await setRecipeImageAction(recipeId, path);
      start(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de l'envoi de la photo.");
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    }
  }

  function remove() {
    setBusy(true);
    setError(null);
    start(async () => {
      try {
        await removeRecipeImageAction(recipeId);
        router.refresh();
      } catch {
        setError('Échec du retrait de la photo.');
      } finally {
        setBusy(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <input ref={importRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handleFile(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => importRef.current?.click()} className="btn-secondary text-sm disabled:opacity-50">
          {hasImage ? 'Changer la photo' : 'Importer une photo'}
        </button>
        <button type="button" disabled={busy} onClick={() => cameraRef.current?.click()} className="btn-secondary text-sm disabled:opacity-50">
          Prendre une photo
        </button>
        {hasImage && (
          <button type="button" disabled={busy} onClick={remove} className="btn-danger text-sm disabled:opacity-50">
            Retirer
          </button>
        )}
      </div>
      {busy && <p className="text-xs text-ink-soft">Traitement de la photo…</p>}
      {error && <p className="text-xs font-semibold text-clay">{error}</p>}
    </div>
  );
}
