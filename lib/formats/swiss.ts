// lib/formats/swiss.ts
import type { Participant, ParticipantId, SwissStatus } from '../domain/types';

export interface SwissMatch {
  id: string;
  round: number;
  home: ParticipantId;
  /** null = bye (le `home` gagne automatiquement). */
  away: ParticipantId | null;
  /** null = pas encore joué. */
  score: { home: number; away: number } | null;
}

interface SwissRecord {
  wins: number;
  losses: number;
  /** Adversaires affrontés (byes exclus). */
  opponents: ParticipantId[];
  hadBye: boolean;
}

export interface SwissState {
  participants: Participant[];
  matches: SwissMatch[];
  records: Record<ParticipantId, SwissRecord>;
  winsToQualify: number;
  lossesToEliminate: number;
}

export interface SwissConfig {
  winsToQualify?: number;
  lossesToEliminate?: number;
}

export function createSwiss(participants: Participant[], config: SwissConfig = {}): SwissState {
  const records: Record<ParticipantId, SwissRecord> = {};
  for (const p of participants) {
    records[p.id] = { wins: 0, losses: 0, opponents: [], hadBye: false };
  }
  return {
    participants: [...participants],
    matches: [],
    records,
    winsToQualify: config.winsToQualify ?? 3,
    lossesToEliminate: config.lossesToEliminate ?? 3,
  };
}

export function statusOf(state: SwissState, id: ParticipantId): SwissStatus {
  const rec = state.records[id];
  if (rec.wins >= state.winsToQualify) return 'qualified';
  if (rec.losses >= state.lossesToEliminate) return 'eliminated';
  return 'active';
}

/** Copie profonde d'un état (records + matches). */
function cloneState(state: SwissState): SwissState {
  const records: Record<ParticipantId, SwissRecord> = {};
  for (const [id, r] of Object.entries(state.records)) {
    records[id] = { ...r, opponents: [...r.opponents] };
  }
  return {
    ...state,
    records,
    matches: state.matches.map((m) => ({ ...m, score: m.score ? { ...m.score } : null })),
  };
}

export function recordResult(
  state: SwissState,
  matchId: string,
  score: { home: number; away: number },
): SwissState {
  const next = cloneState(state);
  const match = next.matches.find((m) => m.id === matchId);
  if (!match) throw new Error(`Match introuvable : ${matchId}`);
  if (match.away === null) throw new Error(`Le match ${matchId} est un bye, déjà résolu`);

  match.score = { ...score };
  const homeWon = score.home > score.away;
  const winner = homeWon ? match.home : match.away;
  const loser = homeWon ? match.away : match.home;

  next.records[winner].wins += 1;
  next.records[loser].losses += 1;
  next.records[match.home].opponents.push(match.away);
  next.records[match.away].opponents.push(match.home);

  return next;
}
