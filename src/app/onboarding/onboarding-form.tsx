'use client';

import { useActionState } from 'react';
import { createHouseholdAction, type OnboardingState } from './actions';

export function OnboardingForm() {
  const [state, formAction, pending] = useActionState<OnboardingState | undefined, FormData>(
    createHouseholdAction,
    undefined,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Votre prénom (optionnel)
        <input
          name="display_name"
          type="text"
          className="rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Nom du foyer
        <input
          name="household_name"
          type="text"
          required
          placeholder="Ex. Maison"
          className="rounded border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-black px-4 py-2 text-white disabled:opacity-50 dark:bg-white dark:text-black"
      >
        {pending ? '…' : 'Créer mon foyer'}
      </button>
    </form>
  );
}
