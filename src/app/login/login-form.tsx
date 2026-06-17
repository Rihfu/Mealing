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

  const tab = (m: 'signin' | 'signup', label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      data-active={mode === m}
      className="flex-1 rounded-full px-4 py-2.5 text-sm font-semibold text-ink-soft transition data-[active=true]:bg-sage-tint data-[active=true]:font-extrabold data-[active=true]:text-sage-deep"
    >
      {label}
    </button>
  );

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-paper px-4 py-8 sm:px-6">
      <section className="w-full max-w-md rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Mealing" width={68} height={68} />
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-ink">Mealing</h1>
            <p className="font-hand text-2xl text-green-strong">Qu’est-ce qu’on mange ?</p>
          </div>
        </div>

        <div className="mt-7 flex rounded-full border border-line bg-paper p-1">
          {tab('signin', 'Connexion')}
          {tab('signup', 'Inscription')}
        </div>

        <form action={formAction} className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-bold text-ink-soft">Email</span>
            <input name="email" type="email" required autoComplete="email" className="field-input" />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-bold text-ink-soft">Mot de passe</span>
            <input
              name="password"
              type="password"
              required
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="field-input"
            />
          </label>

          {mode === 'signup' && !state?.error && (
            <p className="text-xs text-ink-soft">Au moins 8 caractères.</p>
          )}
          {state?.error && <p className="text-sm text-red-strong">{state.error}</p>}
          {state?.message && <p className="text-sm text-green-strong">{state.message}</p>}

          <button type="submit" disabled={pending} className="btn-primary mt-1 py-3">
            {pending ? '…' : mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
          </button>
        </form>

        <p className="mt-5 text-center text-xs text-ink-soft">
          En continuant, tu rejoins ou crées ton foyer.
        </p>
      </section>
    </main>
  );
}
