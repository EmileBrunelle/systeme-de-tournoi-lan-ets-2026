// lib/formats/time-attack.ts
import type { Participant, ParticipantId } from '../domain/types';

export interface TAState {
  participants: Participant[];
  /** Best time in milliseconds per participant; null = no time recorded yet. */
  bestMs: Record<ParticipantId, number | null>;
}

export function createTimeAttack(participants: Participant[]): TAState {
  const bestMs: Record<ParticipantId, number | null> = {};
  for (const p of participants) {
    bestMs[p.id] = null;
  }
  return {
    participants: [...participants],
    bestMs,
  };
}

export function recordTime(state: TAState, participantId: ParticipantId, timeMs: number): TAState {
  if (!(participantId in state.bestMs)) {
    throw new Error(`Participant inconnu : ${participantId}`);
  }
  if (!Number.isFinite(timeMs) || timeMs <= 0) {
    throw new Error(`Temps invalide : ${timeMs} (doit être un nombre fini positif)`);
  }

  const prevBest = state.bestMs[participantId];
  const newBest = prevBest === null ? timeMs : Math.min(prevBest, timeMs);

  return {
    participants: [...state.participants],
    bestMs: {
      ...state.bestMs,
      [participantId]: newBest,
    },
  };
}

export interface TAStanding {
  participantId: ParticipantId;
  name: string;
  /** 1 = fastest */
  rank: number;
  /** null if no time recorded yet */
  bestMs: number | null;
}

/**
 * Ranks participants by: has-time before no-time, then bestMs ascending,
 * then seed ascending (tiebreak). Ranks are sequential 1..N.
 */
export function standings(state: TAState): TAStanding[] {
  const sorted = [...state.participants].sort((a, b) => {
    const ta = state.bestMs[a.id];
    const tb = state.bestMs[b.id];
    // Participants with a time come before those without
    if (ta !== null && tb === null) return -1;
    if (ta === null && tb !== null) return 1;
    if (ta !== null && tb !== null) {
      if (ta !== tb) return ta - tb;
    }
    // Tiebreak by seed ascending
    return a.seed - b.seed;
  });

  return sorted.map((p, i) => ({
    participantId: p.id,
    name: p.name,
    rank: i + 1,
    bestMs: state.bestMs[p.id],
  }));
}

/** True once every participant has recorded at least one time. */
export function isComplete(state: TAState): boolean {
  return state.participants.every((p) => state.bestMs[p.id] !== null);
}

/** Participant ids in ranked order (fastest first) — used to seed the TrackMania cup. */
export function seedingOrder(state: TAState): ParticipantId[] {
  return standings(state).map((s) => s.participantId);
}
