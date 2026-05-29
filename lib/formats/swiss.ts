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

export function buchholz(state: SwissState, id: ParticipantId): number {
  return state.records[id].opponents.reduce((sum, oppId) => sum + state.records[oppId].wins, 0);
}

/** Numéro de la dernière ronde générée (0 si aucune). */
export function currentRound(state: SwissState): number {
  return state.matches.reduce((max, m) => Math.max(max, m.round), 0);
}

/** Compare deux participants par force décroissante (victoires, Buchholz, seed). */
function strengthCompare(state: SwissState, a: Participant, b: Participant): number {
  const wa = state.records[a.id].wins;
  const wb = state.records[b.id].wins;
  if (wb !== wa) return wb - wa;
  const ba = buchholz(state, a.id);
  const bb = buchholz(state, b.id);
  if (bb !== ba) return bb - ba;
  return a.seed - b.seed;
}

/**
 * Génère la prochaine ronde. Apparie les participants actifs par force
 * comparable, en évitant les revanches quand c'est possible. Si le nombre
 * d'actifs est impair, attribue un bye (victoire auto) au moins bien classé
 * n'en ayant pas encore eu. Le bye est résolu immédiatement.
 */
export function generateNextRound(state: SwissState): SwissState {
  const unplayed = state.matches.some((m) => m.away !== null && m.score === null);
  if (unplayed) throw new Error('Ronde précédente incomplète : enregistrez tous les résultats.');

  const next = cloneState(state);
  const round = currentRound(next) + 1;

  const active = next.participants
    .filter((p) => statusOf(next, p.id) === 'active')
    .sort((a, b) => strengthCompare(next, a, b));

  // Bye si impair
  let byeId: ParticipantId | null = null;
  if (active.length % 2 === 1) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (!next.records[active[i].id].hadBye) { byeId = active[i].id; break; }
    }
    if (byeId === null) byeId = active[active.length - 1].id;
    const idx = active.findIndex((p) => p.id === byeId);
    active.splice(idx, 1);
  }

  // Appariement glouton anti-revanche
  let matchNo = 0;
  const pool = [...active];
  while (pool.length >= 2) {
    const home = pool.shift()!;
    let oppIdx = pool.findIndex((o) => !next.records[home.id].opponents.includes(o.id));
    if (oppIdx === -1) oppIdx = 0; // revanche inévitable
    const away = pool.splice(oppIdx, 1)[0];
    next.matches.push({
      id: `R${round}-M${++matchNo}`,
      round,
      home: home.id,
      away: away.id,
      score: null,
    });
  }

  // Bye résolu immédiatement
  if (byeId) {
    next.matches.push({ id: `R${round}-BYE`, round, home: byeId, away: null, score: { home: 1, away: 0 } });
    next.records[byeId].wins += 1;
    next.records[byeId].hadBye = true;
  }

  return next;
}
