import Link from 'next/link';
import { ArrowRight, CalendarDays, EyeOff, Gauge } from 'lucide-react';

/**
 * État 1 du handoff — Hero d'activation. Premier contact : la promesse, jamais un
 * tableau de zéros. Le rappel vie privée est présent dès ce moment de confiance.
 */
export function ActivationHero() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Nutrition</h1>
      <div className="rounded-2xl border border-line bg-surface p-6 lg:p-12" style={{ boxShadow: 'var(--shadow-md)' }}>
        <div className="flex flex-col items-center gap-8 lg:flex-row lg:gap-14">
          <div className="min-w-0 flex-1 text-center lg:text-left">
            <div className="font-hand text-xl text-sage-deep">rien à pointer, rien à peser</div>
            <h2 className="mt-2 font-display text-[30px] font-semibold leading-[1.15] tracking-tight lg:text-[42px]">
              Ta nutrition, déduite de ton planning. Zéro saisie.
            </h2>
            <p className="mx-auto mt-3 max-w-[520px] text-[15px] leading-relaxed text-ink-soft lg:mx-0 lg:text-[17px]">
              Un repas planifié compte tel que prévu — tes repères se remplissent tout seuls, semaine après semaine.
            </p>
            <div className="mx-auto mt-6 flex max-w-[520px] flex-col gap-3 lg:mx-0">
              <FeatureRow tint="bg-sage-tint" Icon={CalendarDays} label="Tes repas planifiés font tout le travail" />
              <FeatureRow tint="bg-butter-tint" Icon={Gauge} label="Des repères et des zones — jamais de notes ni de jugement" />
              <FeatureRow tint="bg-clay-tint" Icon={EyeOff} label="Strictement personnel — invisible pour ton foyer" />
            </div>
            <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start">
              <Link
                href="/nutrition/activer"
                className="inline-flex h-[50px] items-center justify-center gap-2 rounded-xl bg-green-strong px-6 text-base font-bold text-white"
                style={{ boxShadow: 'var(--shadow-md)' }}
              >
                Activer mon suivi
                <ArrowRight className="h-[18px] w-[18px]" strokeWidth={1.75} />
              </Link>
              <Link
                href="/nutrition/activer"
                className="inline-flex h-[50px] items-center justify-center rounded-xl border-[1.5px] border-sage bg-surface px-5 text-[15px] font-bold text-sage-deep"
              >
                Comment ça marche ?
              </Link>
            </div>
            <p className="mt-5 text-[12.5px] text-ink-soft">
              Des estimations bien-être, pas des mesures. Ceci n’est pas un avis médical.
            </p>
          </div>
          <div className="relative flex h-[200px] w-[200px] shrink-0 items-center justify-center rounded-full bg-sage-tint lg:h-[280px] lg:w-[280px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="h-24 w-24 lg:h-[150px] lg:w-[150px]" aria-hidden="true" />
            <span className="absolute right-1 top-3 rotate-[6deg] font-hand text-lg text-sage-deep lg:text-xl">
              ça se remplit tout seul !
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ tint, Icon, label }: { tint: string; Icon: typeof CalendarDays; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 text-[15px] font-semibold lg:border-0 lg:bg-transparent lg:p-0">
      <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] ${tint} text-sage-deep`}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </span>
      {label}
    </div>
  );
}

/**
 * État 8 du handoff — activé mais rien de planifié. Invitation chaleureuse vers le
 * Planning, jamais de tableaux de zéros.
 */
export function NoPlanningState() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Nutrition</h1>
        <p className="font-hand text-base text-sage-deep">déduite de ton planning — zéro saisie</p>
      </div>
      <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-surface p-7 text-center" style={{ boxShadow: 'var(--shadow-sm)' }}>
        <div className="mx-auto mb-3.5 flex h-[120px] w-[120px] items-center justify-center rounded-full bg-butter-tint">
          <CalendarDays className="h-[52px] w-[52px] text-sage-deep" strokeWidth={1.75} />
        </div>
        <div className="font-display text-[21px] font-semibold leading-tight">Rien de prévu cette semaine — on s’y met ?</div>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          Planifie tes repas : tes repères se rempliront tout seuls, sans rien saisir ici.
        </p>
        <Link
          href="/planning"
          className="mt-5 inline-flex h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-green-strong text-[15.5px] font-bold text-white"
          style={{ boxShadow: 'var(--shadow-md)' }}
        >
          <CalendarDays className="h-[18px] w-[18px]" strokeWidth={1.75} />
          Ouvrir le planning
        </Link>
      </div>
      <div className="mx-auto flex w-full max-w-md items-center gap-2.5 rounded-xl bg-sage-tint px-3.5 py-2.5 text-[12.5px] font-semibold leading-snug text-sage-deep">
        <EyeOff className="h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
        Ton suivi reste invisible pour le reste du foyer.
      </div>
    </div>
  );
}
