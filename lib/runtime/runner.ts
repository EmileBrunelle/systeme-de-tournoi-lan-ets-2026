// lib/runtime/runner.ts
//
// Couche d'orchestration : enchaîne les moteurs purs (lib/formats) pour
// décrire le déroulé complet d'un tournoi par jeu. L'état renvoyé ici est ce
// qui est sérialisé dans `Tournament.stateJson` (voir prisma/schema.prisma).
// Tout reste pur et immutable, comme les moteurs sous-jacents.

import type { Participant } from '../domain/types';
import * as swiss from '../formats/swiss';
import * as de from '../formats/double-elimination';
import * as se from '../formats/single-elimination';
import * as ta from '../formats/time-attack';
import * as cup from '../formats/cup';

export type Game = 'valorant' | 'geoguessr' | 'trackmania';

/** Valorant : phase suisse "à 3V/3D" puis playoff double-élimination (top N). */
export interface ValorantState {
  game: 'valorant';
  phase: 'swiss' | 'playoff' | 'done';
  /** Nombre d'équipes qualifiées pour le playoff. */
  playoffSize: number;
  swiss: swiss.SwissState;
  playoff: de.DEState | null;
}

/** GeoGuessr : élimination simple + petite finale. */
export interface GeoState {
  game: 'geoguessr';
  se: se.SEState;
}

/** TrackMania : Time Attack (qualif) puis cup (rondes à points + finale). */
export interface TrackmaniaState {
  game: 'trackmania';
  phase: 'time-attack' | 'cup' | 'done';
  ta: ta.TAState;
  cup: cup.CupState | null;
}

export type RunnerState = ValorantState | GeoState | TrackmaniaState;

export const DEFAULT_PLAYOFF_SIZE = 8;

// ─── Création ──────────────────────────────────────────────────────────────

export function startValorant(
  participants: Participant[],
  playoffSize: number = DEFAULT_PLAYOFF_SIZE,
): ValorantState {
  return {
    game: 'valorant',
    phase: 'swiss',
    playoffSize,
    swiss: swiss.createSwiss(participants),
    playoff: null,
  };
}

export function startGeoguessr(participants: Participant[]): GeoState {
  return {
    game: 'geoguessr',
    se: se.createSingleElim(participants, { thirdPlaceMatch: true }),
  };
}

export function startTrackmania(participants: Participant[]): TrackmaniaState {
  return {
    game: 'trackmania',
    phase: 'time-attack',
    ta: ta.createTimeAttack(participants),
    cup: null,
  };
}

// ─── Transitions de phase ────────────────────────────────────────────────────

/** Vrai quand la phase suisse est terminée (plus aucune équipe active). */
export function canStartPlayoff(state: ValorantState): boolean {
  return state.phase === 'swiss' && swiss.isComplete(state.swiss);
}

/**
 * Lance le playoff : prend les `playoffSize` meilleures équipes du classement
 * suisse (qualifiées en tête) et les re-seede 1..N pour la double-élimination.
 */
export function startPlayoff(state: ValorantState): ValorantState {
  const board = swiss.standings(state.swiss);
  const top = board.slice(0, state.playoffSize);
  const participants: Participant[] = top.map((s, i) => ({
    id: s.participantId,
    name: s.name,
    seed: i + 1,
  }));
  return {
    ...state,
    phase: 'playoff',
    playoff: de.createDoubleElim(participants, { grandFinalReset: false }),
  };
}

/** Vrai quand la qualif Time Attack est complète (tous ont un temps). */
export function canStartCup(state: TrackmaniaState): boolean {
  return state.phase === 'time-attack' && ta.isComplete(state.ta);
}

/** Lance la cup, seedée par l'ordre de la Time Attack (le plus rapide = seed 1). */
export function startCup(state: TrackmaniaState): TrackmaniaState {
  const byId = new Map(state.ta.participants.map((p) => [p.id, p]));
  const order = ta.seedingOrder(state.ta);
  const participants: Participant[] = order.map((id, i) => ({
    id,
    name: byId.get(id)!.name,
    seed: i + 1,
  }));
  return {
    ...state,
    phase: 'cup',
    cup: cup.createCup(participants),
  };
}
