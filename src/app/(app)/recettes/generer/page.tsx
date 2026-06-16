import Link from 'next/link';
import { GenerateForm } from './generate-form';

export default function GenererRecettePage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Générer une recette (IA)</h1>
        <Link href="/recettes" className="text-sm text-ink-soft underline">
          Retour
        </Link>
      </div>
      <p className="text-sm text-ink-soft">
        Décrivez ce que vous voulez ; l’IA propose une recette structurée que vous pouvez relire
        avant de l’enregistrer.
      </p>
      <GenerateForm />
    </div>
  );
}
