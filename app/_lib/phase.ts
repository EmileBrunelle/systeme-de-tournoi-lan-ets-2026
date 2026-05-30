import type { RunnerState } from '@/lib/runtime/runner';

/** Libellé court de la phase courante, pour l'en-tête / l'accueil. */
export function phaseLabel(state: RunnerState | null): string {
  if (!state) return 'Non démarré';
  switch (state.game) {
    case 'valorant':
      return state.phase === 'swiss' ? 'Phase suisse' : state.phase === 'playoff' ? 'Playoff' : 'Terminé';
    case 'geoguessr':
      return 'Élimination simple';
    case 'trackmania':
      return state.phase === 'time-attack' ? 'Time Attack' : state.phase === 'cup' ? 'Cup' : 'Terminé';
  }
}

/** Nom affichable du jeu. */
export function gameLabel(game: string): string {
  return game === 'valorant' ? 'Valorant' : game === 'geoguessr' ? 'GeoGuessr' : game === 'trackmania' ? 'TrackMania' : game;
}
