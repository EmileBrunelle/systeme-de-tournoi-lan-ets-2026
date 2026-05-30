// lib/formats/cup.ts
import type { Participant, ParticipantId } from '../domain/types';

export interface CupConfig {
  rounds?: number;          // total races including the final; default 4
  pointsTable?: number[];   // points for positions 1,2,3,...; default below
  finalMultiplier?: number; // multiplier applied to the final race's points; default 2
}

export interface CupRace {
  round: number;                 // 1-based
  isFinal: boolean;
  order: ParticipantId[] | null; // finishing order, 1st first; null = not run yet
}

export interface CupState {
  participants: Participant[];   // seed order
  rounds: number;
  pointsTable: number[];
  finalMultiplier: number;
  races: CupRace[];              // length = rounds; last one isFinal
}

const DEFAULT_POINTS_TABLE: number[] = [10, 8, 6, 5, 4, 3, 2, 1];
const DEFAULT_ROUNDS = 4;
const DEFAULT_FINAL_MULTIPLIER = 2;

export function createCup(participants: Participant[], config: CupConfig = {}): CupState {
  const rounds = config.rounds ?? DEFAULT_ROUNDS;
  const pointsTable = config.pointsTable ?? [...DEFAULT_POINTS_TABLE];
  const finalMultiplier = config.finalMultiplier ?? DEFAULT_FINAL_MULTIPLIER;

  const races: CupRace[] = Array.from({ length: rounds }, (_, i) => ({
    round: i + 1,
    isFinal: i + 1 === rounds,
    order: null,
  }));

  return {
    participants: [...participants],
    rounds,
    pointsTable: [...pointsTable],
    finalMultiplier,
    races,
  };
}

/** Deep clone a CupState without mutating the input. */
function cloneState(state: CupState): CupState {
  return {
    ...state,
    participants: state.participants.map((p) => ({ ...p })),
    pointsTable: [...state.pointsTable],
    races: state.races.map((r) => ({
      ...r,
      order: r.order ? [...r.order] : null,
    })),
  };
}

/**
 * Records a race result. `order` must be a permutation of all participant ids.
 * Re-recording an already-run round is allowed (overwrites).
 */
export function recordRace(state: CupState, round: number, order: ParticipantId[]): CupState {
  if (round < 1 || round > state.rounds) {
    throw new Error(`Round ${round} is out of range (1..${state.rounds}).`);
  }

  const expectedIds = new Set(state.participants.map((p) => p.id));

  if (order.length !== expectedIds.size) {
    throw new Error(
      `Order length ${order.length} does not match participant count ${expectedIds.size}.`,
    );
  }

  const seen = new Set<ParticipantId>();
  for (const id of order) {
    if (!expectedIds.has(id)) {
      throw new Error(`Unknown participant id in order: ${id}.`);
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate participant id in order: ${id}.`);
    }
    seen.add(id);
  }

  const next = cloneState(state);
  const race = next.races[round - 1];
  race.order = [...order];

  return next;
}

/** Points earned by a participant in a single race. */
function racePoints(state: CupState, race: CupRace, id: ParticipantId): number {
  if (race.order === null) return 0;

  const position = race.order.indexOf(id); // 0-based
  if (position === -1) return 0;

  const basePoints = state.pointsTable[position] ?? 0;
  const multiplier = race.isFinal ? state.finalMultiplier : 1;

  return basePoints * multiplier;
}

/** Total points for a participant across all run races. */
export function totalPoints(state: CupState, id: ParticipantId): number {
  return state.races.reduce((sum, race) => sum + racePoints(state, race, id), 0);
}

export interface CupStanding {
  participantId: ParticipantId;
  name: string;
  rank: number;     // 1 = most points
  points: number;
}

/** Standings sorted by total points descending, then lower seed on tie. */
export function standings(state: CupState): CupStanding[] {
  const sorted = [...state.participants].sort((a, b) => {
    const pa = totalPoints(state, a.id);
    const pb = totalPoints(state, b.id);
    if (pb !== pa) return pb - pa;  // higher points first
    return a.seed - b.seed;         // lower seed wins tie
  });

  return sorted.map((p, i) => ({
    participantId: p.id,
    name: p.name,
    rank: i + 1,
    points: totalPoints(state, p.id),
  }));
}

/** True when every race has a non-null order. */
export function isComplete(state: CupState): boolean {
  return state.races.every((r) => r.order !== null);
}

/** The champion's ParticipantId if the cup is complete, else null. */
export function champion(state: CupState): ParticipantId | null {
  if (!isComplete(state)) return null;
  return standings(state)[0].participantId;
}
