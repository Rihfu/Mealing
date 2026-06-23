/**
 * Redimensionne une image (côté navigateur) avant upload : photos de caméra =
 * plusieurs Mo → on borne le plus grand côté et on réexporte en JPEG. Utilise
 * `createImageBitmap` avec `imageOrientation: 'from-image'` pour appliquer
 * l'orientation EXIF (sinon les photos portrait peuvent apparaître tournées).
 */
export async function resizeImageToBlob(file: File, maxPx = 1024, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('Canvas non supporté sur cet appareil.');
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error("Échec de l'encodage de l'image.");
  return blob;
}
