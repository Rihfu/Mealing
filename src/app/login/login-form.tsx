'use client';

import { useActionState, useState } from 'react';
import { signIn, signUp, type AuthFormState } from '@/app/auth/actions';

export function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const action = mode === 'signin' ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthFormState | undefined, FormData>(
    action,
    undefined,
  );

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 p-6">
      <div className="flex flex-col items-center gap-1 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Mealing" width={56} height={56} />
        <h1 className="text-3xl font-semibold text-ink">Mealing</h1>
        <p className="font-hand text-xl text-green-strong">mes repas, sans charge mentale</p>
        <p className="text-sm text-ink-soft">
          {mode === 'signin' ? 'Connecte-toi à ton compte.' : 'Crée ton compte.'}
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" required autoComplete="email" className="field-input" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Mot de passe
          <input
            name="password"
            type="password"
            required
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            className="field-input"
          />
        </label>

        {state?.error && <p className="text-sm text-red-strong">{state.error}</p>}
        {state?.message && <p className="text-sm text-green-strong">{state.message}</p>}

        <button type="submit" disabled={pending} className="btn-primary mt-1">
          {pending ? '…' : mode === 'signin' ? 'Se connecter' : 'Créer un compte'}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        className="text-sm text-ink-soft underline"
      >
        {mode === 'signin' ? 'Pas de compte ? Créer un compte' : 'Déjà un compte ? Se connecter'}
      </button>
    </div>
  );
}
