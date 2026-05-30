import type { RunnerState } from '@/lib/runtime/runner';

/** Libellé court de la phase courante, pour l'en-tête / l'accueil. */
export function phaseLabel(state: RunnerState | null): string {
  if (!state) return 'Non démarré';
  return state.phase === 'swiss' ? 'Phase suisse' : state.phase === 'playoff' ? 'Playoff' : 'Terminé';
}
