'use client';

import { useRef, useState } from 'react';

/** Extension de fichier déduite du type MIME du MediaRecorder (Chrome=webm, Safari=mp4…). */
export function audioExt(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

/**
 * Enregistrement micro réutilisable (`getUserMedia` + `MediaRecorder`). Au stop, appelle
 * `onResult(blob, mime)`. Gère l'état d'enregistrement + une erreur de permission claire.
 * Utilisé par la saisie vocale de l'assistant (et factorisable avec `voice-capture`).
 */
export function useAudioRecorder(onResult: (blob: Blob, mime: string) => void) {
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const mime = rec.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        onResult(blob, mime);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      setError("Micro indisponible — autorise l'accès au microphone.");
      setRecording(false);
    }
  }

  function stop() {
    recRef.current?.stop();
    recRef.current = null;
  }

  /** Coupe l'enregistrement SANS déclencher onResult (abandon). */
  function cancel() {
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null;
      rec.stream.getTracks().forEach((t) => t.stop());
      recRef.current = null;
    }
    setRecording(false);
  }

  return { recording, error, start, stop, cancel };
}
