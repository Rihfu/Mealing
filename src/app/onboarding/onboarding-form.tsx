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
        Ton prénom (optionnel)
        <input name="display_name" type="text" className="field-input" />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Nom du foyer
        <input
          name="household_name"
          type="text"
          required
          placeholder="Ex. Maison"
          className="field-input"
        />
      </label>

      {state?.error && <p className="text-sm text-red-strong">{state.error}</p>}

      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? '…' : 'Créer mon foyer'}
      </button>
    </form>
  );
}
